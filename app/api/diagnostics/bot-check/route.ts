import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizePhone, displayPhone } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { shouldBotReply } from "@/lib/bot-gate";
import {
  replyAfterBroadcast,
  isBroadcastMessage,
} from "@/lib/broadcast-replies";
import { ASKED_EVENT } from "@/lib/supplier-check";
import { decideInbound } from "@/lib/inbound-context";
import { lastListSendFor } from "@/lib/broadcast-membership";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  למה הבוט לא שאל את שאלת הסינון
 * ============================================================
 *
 *  קוראת בלבד.
 *
 *  **למה זה קיים.** "הבוט לא שולח" יכול לנבוע משבע סיבות
 *  שונות, וכולן נראות אותו דבר מבחוץ. במקום לנחש, המסך
 *  הזה מריץ על ליד אחד **בדיוק את אותן בדיקות** שהבוט
 *  מריץ, ואומר איזו מהן עצרה אותו.
 */
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
      botMuted: true,
      doNotContact: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          direction: true,
          broadcast: true,
          broadcastKind: true,
          templateName: true,
          bodyText: true,
          status: true,
          error: true,
          createdAt: true,
        },
        take: 200,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({
      נמצא: false,
      מסקנה: "אין ליד עם המספר הזה. הבוט לא יכול לשאול מי שלא קיים במערכת.",
    });
  }

  const settings = await getSettings();
  /**
   * אותו שער בדיוק, ובאותו מצב: תגובה לדיוור נמדדת בשער
   * של הדיוור, בלי מגבלת הסטטוסים. אחרת האבחון היה אומר
   * "נחסם בסטטוס" על מישהו שבפועל כן מקבל את השאלה.
   */
  const gate = await shouldBotReply(lead.id, "broadcast");

  const outgoing = lead.messages.filter((m) => m.direction === "out");
  const lastOut = outgoing[outgoing.length - 1];
  const recognised = outgoing.filter(isBroadcastMessage);
  const window = replyAfterBroadcast(lead.messages, new Date());

  /** אותה הכרעה בדיוק שהבוט מריץ */
  /** אותו מקור שני בדיוק שהבוט בודק */
  const listSendAt = await lastListSendFor(lead.phone).catch(() => null);

  const decision = decideInbound({
    messages: lead.messages,
    origin: lead.origin,
    alreadyAsked: false,
    blacklisted: lead.doNotContact,
    listSendAt,
    now: new Date(),
  });

  const asked = await db.leadEvent
    .findFirst({ where: { leadId: lead.id, type: ASKED_EVENT } })
    .catch(() => null);

  /**
   * הסיבה הראשונה שעוצרת, לפי הסדר שבו הבוט עצמו בודק.
   * סדר אחר היה מצביע על הסיבה הלא נכונה.
   */
  let verdict: string;

  if (lead.doNotContact) {
    verdict = "הליד ברשימה השחורה - הבוט לא פונה אליו בכוונה.";
  } else if (asked) {
    verdict = `השאלה כבר נשלחה אליו ב-${asked.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}. הבוט שואל פעם אחת בלבד.`;
  } else if (outgoing.length === 0) {
    verdict = "לא נשלחה אליו אף הודעה יוצאת. הדיוור לא הגיע אליו בכלל.";
  } else if (recognised.length === 0 && !listSendAt) {
    verdict =
      "נשלחו אליו הודעות, אבל אף אחת מהן לא מסומנת כדיוור. אם הדיוור יצא לפני עדכון 152, הסימון לא היה קיים אז - הרץ 'סמן דיוור קודם' בתחזוקה.";
  } else if (!window) {
    verdict =
      "הוא קיבל דיוור אבל אין ממנו תגובה **אחרי** הדיוור ובתוך 30 יום. הבוט שואל רק את מי שענה.";
  } else if (!decision.askSupplier) {
    verdict = decision.reason;
  } else if (!gate.allowed) {
    verdict = `הבוט נעצר בשער: ${gate.reason}`;
  } else {
    verdict =
      "כל התנאים מתקיימים. אם השאלה בכל זאת לא יצאה, בדוק את ההודעות היוצאות למטה - שליחה שנכשלה מופיעה שם עם השגיאה.";
  }

  return NextResponse.json({
    ליד: {
      מי: lead.firstName ?? displayPhone(lead.phone),
      טלפון: displayPhone(lead.phone),
      סטטוס: lead.status,
      בעלות: lead.origin,
      ברשימה_שחורה: lead.doNotContact,
      בוט_מושתק: lead.botMuted,
    },
    הגדרות: {
      בוט_דלוק: settings.botEnabled,
      מצב: settings.botMode === "broadcast" ? "רק דיוור" : "כל הודעה",
      שעות: `${settings.botFromHour}:00-${settings.botToHour}:00`,
    },
    שער: { עובר: gate.allowed, סיבה: gate.reason },
    דיוור: {
      ברשימת_דיוור_שנשלחה: listSendAt
        ? listSendAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })
        : "לא",
      הודעות_יוצאות: outgoing.length,
      מזוהות_כדיוור: recognised.length,
      הודעה_אחרונה: lastOut
        ? {
            טקסט: (lastOut.bodyText ?? "").slice(0, 120),
            תבנית: lastOut.templateName,
            מסומנת_כדיוור: lastOut.broadcast === true,
            מצב: lastOut.status,
            שגיאה: lastOut.error?.slice(0, 200) ?? null,
          }
        : null,
      ענה_אחרי_דיוור: window
        ? {
            הדיוור: window.broadcastLabel,
            ענה: window.replyText,
          }
        : null,
    },
    שאלת_הסינון_נשלחה: Boolean(asked),
    סוג_הדיוור:
      decision.window && decision.askSupplier
        ? "דאטה שנטענה - הבוט שואל"
        : decision.isBroadcastReply
          ? decision.reason
          : "—",
    מסקנה: verdict,
  });
}
