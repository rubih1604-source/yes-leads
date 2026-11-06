import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizePhone, displayPhone } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import {
  ASKED_EVENT,
  DONE_EVENT,
  QUIET_HOURS,
  TIME_ASKED_EVENT,
  readSupplierAnswer,
  statesExistingCustomer,
} from "@/lib/supplier-check";
import { parseWhen } from "@/lib/when";
import {
  receivedCampaign,
  CAMPAIGN_WINDOW_DAYS,
} from "@/lib/campaign-audience";
import { lastListSendFor } from "@/lib/broadcast-membership";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  למה הבוט לא ענה לו
 * ============================================================
 *
 *  קוראת בלבד.
 *
 *  **למה זה קיים.** "הבוט לא שלח" נראה אותו דבר מבחוץ בכל
 *  מקרה, ובלי המסך הזה אין דרך לדעת למה.
 *
 *  **מה השתנה כאן.** הגרסה הקודמת הריצה את השער הישן
 *  ואת הכרעת הדיוור הישנה - שעות, סטטוסים, "האם הוא
 *  נמען דיוור". כל אלה נמחקו מהמערכת, והאבחון שדיווח
 *  עליהם היה פשוט משקר: הוא היה מצביע על חסימה שלא
 *  קיימת, או מכריז "הכל תקין" לפי כללים שאיש לא מריץ.
 *
 *  עכשיו הסולם כאן הוא **בדיוק** סדר ההחלטות של
 *  handleCampaignReply, ולא העתק שלו: המתג, הרשימה
 *  השחורה, השקט של 24 שעות, והאם נשאל מאז הסגירה
 *  האחרונה.
 */

function timeIL(date: Date): string {
  return date.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
}

export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const phone = normalizePhone(q);

  if (!phone) {
    return NextResponse.json(
      { error: "צריך מספר טלפון תקין" },
      { status: 400 }
    );
  }

  const lead = await db.lead.findUnique({
    where: { phone },
    select: {
      id: true,
      phone: true,
      firstName: true,
      status: true,
      origin: true,
      doNotContact: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          direction: true,
          broadcast: true,
          templateName: true,
          bodyText: true,
          status: true,
          error: true,
          createdAt: true,
        },
        take: 200,
      },
      events: {
        where: {
          type: {
            in: [
              ASKED_EVENT,
              DONE_EVENT,
              TIME_ASKED_EVENT,
              "callback_scheduled",
              "campaign_bot",
              "bot_failed",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { type: true, createdAt: true, payload: true },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({
      נמצא: false,
      מסקנה:
        "אין ליד עם המספר הזה. הבוט עונה רק למי שההודעה שלו נרשמה במערכת - אם הוא כתב ולא נוצר לו ליד, הבעיה היא בקליטה מטקסטר ולא בבוט.",
    });
  }

  const settings = await getSettings();
  const now = new Date();

  const outgoing = lead.messages.filter((m) => m.direction === "out");
  const lastOut = outgoing.at(-1);
  const inbound = lead.messages.filter((m) => m.direction === "in");
  const lastInbound = inbound.at(-1);

  /**
   * **האם הדיוור הגיע אליו - אותה פונקציה שהבוט מריץ.**
   *
   * לא העתק ולא קירוב: אם האבחון יענה אחרת מהבוט, הוא
   * גרוע מחסר.
   */
  const audience = receivedCampaign({
    campaignText: settings.campaignText,
    outgoing: outgoing.map((m) => ({
      bodyText: m.bodyText,
      broadcast: m.broadcast,
      createdAt: m.createdAt,
    })),
    listSendAt: await lastListSendFor(lead.phone).catch(() => null),
    now,
  });

  const lastDone = lead.events.find((e) => e.type === DONE_EVENT);
  const crashed = lead.events.find((e) => e.type === "bot_failed");

  /**
   * קריסה רלוונטית רק אם היא **אחרי** ההודעה האחרונה של
   * הלקוח. אחרת היא היסטוריה, והצגתה כסיבה הנוכחית היא
   * מה שהסתיר תיקון שכבר עבד.
   */
  const crashedNow = Boolean(
    crashed &&
      lastInbound &&
      crashed.createdAt.getTime() >= lastInbound.createdAt.getTime()
  );

  /** השאלות נספרות מאז הסגירה האחרונה, כמו בבוט עצמו */
  const since = lastDone?.createdAt;

  const asks = lead.events.filter(
    (e) =>
      e.type === ASKED_EVENT &&
      (!since || e.createdAt.getTime() > since.getTime())
  );

  const quietHoursLeft = lastDone
    ? QUIET_HOURS - (now.getTime() - lastDone.createdAt.getTime()) / 3600000
    : 0;

  const inQuiet = quietHoursLeft > 0;

  /**
   * מה הבוט **היה** עושה עם ההודעה האחרונה שלו, לפי אותן
   * פונקציות קריאה שהבוט מריץ. זה מה שמאפשר לראות שהתשובה
   * שלו נקראה נכון - או לא.
   */
  const lastText = lastInbound?.bodyText ?? "";

  const timeAsks = lead.events.filter(
    (e) =>
      e.type === TIME_ASKED_EVENT &&
      (!since || e.createdAt.getTime() > since.getTime())
  );

  const parsedTime = lastText ? parseWhen(lastText, now) : { kind: "unclear" as const };

  const reading = !lastText
    ? "אין הודעה"
    : timeAsks.length > 0
      ? parsedTime.kind === "at"
        ? `נשאל מתי נוח לו, וזוהתה שעה: ${parsedTime.label} (${timeIL(parsedTime.at)})`
        : "נשאל מתי נוח לו, ולא זוהתה שעה בתשובה"
      : statesExistingCustomer(lastText)
        ? "הצהיר שהוא לקוח קיים"
        : asks.length > 0
          ? {
              yes: "ענה שהוא לקוח קיים",
              no: "ענה שאינו לקוח - מתעניין",
              unclear: "התשובה לא הכריעה",
            }[readSupplierAnswer(lastText)]
          : "הודעה ראשונה - אמור לקבל את שאלת הסינון";

  /** הסיבה הראשונה שעוצרת, לפי סדר ההחלטות של הבוט */
  let verdict: string;

  if (crashedNow) {
    const payload = (crashed!.payload ?? {}) as { error?: string };
    verdict = `הבוט קרס בטיפול בהודעה האחרונה, ב-${timeIL(crashed!.createdAt)}. זו הסיבה שלא יצא כלום: ${(payload.error ?? "").slice(0, 300)}`;
  } else if (!settings.campaignBot) {
    verdict =
      "מתג בוט הדיוור כבוי. זו הסיבה היחידה, ואין אחרת - הדלק אותו בהגדרות והבוט יענה לכל מי שכותב מכאן והלאה. הוא לא חוזר אחורה על הודעות שכבר הגיעו.";
  } else if (lead.doNotContact) {
    verdict = "הליד ברשימה השחורה - הבוט לא פונה אליו בכוונה.";
  } else if (!lastInbound) {
    verdict =
      "הוא לא כתב כלום. הבוט עונה למי שכותב, ולא יוזם - גם אם הדיוור יצא אליו.";
  } else if (!audience.yes) {
    verdict = `הדיוור לא זוהה אצלו, ולכן הבוט שותק מולו בכוונה: ${audience.why}. אם הוא כן נמען - בדוק שטקסט הדיוור בהגדרות הוא בדיוק מה ששלחת.`;
  } else if (inQuiet) {
    verdict = `התהליך מולו נסגר ב-${timeIL(lastDone!.createdAt)}, והבוט שותק מולו עוד ${Math.ceil(quietHoursLeft)} שעות. זה בכוונה: אחרי שידוע אם הוא לקוח או לא, אין מה לשאול שוב.`;
  } else if (asks.length > 0) {
    verdict = `שאלת הסינון נשלחה אליו ב-${timeIL(asks.at(-1)!.createdAt)}, והבוט מחכה לתשובה. התשובה האחרונה שלו נקראה כ: "${typeof reading === "string" ? reading : ""}".`;
  } else {
    verdict =
      "כל התנאים מתקיימים: המתג דלוק, הוא לא חסום, הוא כתב, ולא נשאל. אם השאלה בכל זאת לא יצאה - בדוק את ההודעות היוצאות למטה, שליחה שנכשלה מופיעה שם עם השגיאה.";
  }

  return NextResponse.json({
    ליד: {
      מי: lead.firstName ?? displayPhone(lead.phone),
      טלפון: displayPhone(lead.phone),
      סטטוס: lead.status,
      בעלות: lead.origin,
      ברשימה_שחורה: lead.doNotContact,
    },
    התנאים: {
      המתג_דלוק: settings.campaignBot,
      לא_ברשימה_שחורה: !lead.doNotContact,
      קיבל_את_הדיוור: audience.yes,
      איך_זוהה: audience.why,
      לא_בשקט_של_24_שעות: !inQuiet,
    },
    התהליך: {
      כתב_לנו: lastInbound ? timeIL(lastInbound.createdAt) : "אף פעם",
      ההודעה_האחרונה_שלו: lastText.slice(0, 160) || "—",
      כך_הבוט_קורא_אותה: reading,
      שאלת_הסינון_נשלחה: asks.length
        ? `${asks.length} פעמים · אחרונה ב-${timeIL(asks.at(-1)!.createdAt)}`
        : "לא",
      נשאל_מתי_נוח_לו: timeAsks.length
        ? `${timeAsks.length} פעמים · אחרונה ב-${timeIL(timeAsks.at(-1)!.createdAt)}`
        : "לא",
      תזכורת_שנפתחה: (() => {
        const row = lead.events.find((e) => e.type === "callback_scheduled");
        if (!row) return "לא";
        const p = (row.payload ?? {}) as { at?: string; label?: string };
        return p.at
          ? `${timeIL(new Date(p.at))} · ביקש ${p.label ?? ""}`
          : "לא";
      })(),
      התהליך_נסגר: lastDone
        ? `${timeIL(lastDone.createdAt)} · ${
            ((lastDone.payload ?? {}) as { outcome?: string }).outcome ?? ""
          }`
        : "לא",
    },
    הודעות: {
      יוצאות: outgoing.length,
      נכנסות: inbound.length,
      היוצאת_האחרונה: lastOut
        ? {
            טקסט: (lastOut.bodyText ?? "").slice(0, 120),
            תבנית: lastOut.templateName,
            מסומנת_כדיוור: lastOut.broadcast === true,
            מצב: lastOut.status,
            שגיאה: lastOut.error?.slice(0, 200) ?? null,
          }
        : null,
    },
    /**
     * **מה הבוט באמת עשה, בכל פעם.** זו השורה שהייתה
     * חסרה: במקום להסיק מהתנאים, רואים את ההחלטה שלו
     * עצמו על כל הודעה.
     */
    מה_הבוט_עשה: lead.events
      .filter((e) => e.type === "campaign_bot")
      .slice(0, 10)
      .map((e) => {
        const p = (e.payload ?? {}) as { action?: string; reason?: string };
        return `${timeIL(e.createdAt)} · ${p.action ?? ""} · ${p.reason ?? ""}`;
      }),
    הבוט_קרס: !crashed
      ? "לא"
      : crashedNow
        ? timeIL(crashed.createdAt)
        : `לא · הייתה קריסה ישנה ב-${timeIL(crashed.createdAt)}, לפני ההודעה האחרונה`,
    מסקנה: verdict,
  });
}
