import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { decideInbound } from "@/lib/inbound-context";
import { lastListSendForMany } from "@/lib/broadcast-membership";
import { replyToLead } from "@/lib/bot";
import { SUPPLIER_QUESTION, ASKED_EVENT } from "@/lib/supplier-check";
import { REPLY_WINDOW_DAYS } from "@/lib/broadcast-replies";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  השלמת שאלת הסינון למי שהגיב ולא נענה
 * ============================================================
 *
 *  **למה זה נחוץ.**
 *
 *  הבוט פועל על הודעה **ברגע שהיא מגיעה**. אם באותו רגע
 *  משהו חסם אותו - גרסה ישנה, מתג כבוי, שעה מחוץ לחלון -
 *  התגובה אבדה. הבוט לא חוזר אחורה מעצמו.
 *
 *  באמצע מבצע זה הפרש של עסקאות: אנשים ענו, לא קיבלו
 *  כלום, והם יושבים בצד בלי שאף אחד יודע.
 *
 *  **אותה הכרעה בדיוק.** מי שראוי לקבל את השאלה נקבע כאן
 *  באותה פונקציה שהבוט מריץ, ונשלח באותו מסלול שליחה.
 *  אין כאן היגיון שני שיכול לסטות ממנו.
 *
 *  GET  = מראה מי מחכה. לא שולח כלום.
 *  POST = שולח להם את השאלה.
 */

/**
 * ============================================================
 *  רק הדיוור הנוכחי, לא חודש אחורה
 * ============================================================
 *
 *  **למה ברירת המחדל צרה.**
 *
 *  הפעולה נועדה להשלים תגובות שאבדו **בדיוור שרץ עכשיו**.
 *  חלון של חודש הכניס אליה 117 אנשים - רובם ישנים, חלקם
 *  כבר דיברו איתך מזמן, ושליחה אליהם הייתה נראית להם
 *  מקרית ומוזרה.
 *
 *  12 שעות מכסות מבצע שיצא היום. מי שצריך יותר מעביר
 *  ?hours=N בכתובת, ורואה בדיוק כמה זה מוסיף לפני
 *  ששולח.
 */
const DEFAULT_HOURS = 12;

function hoursFrom(request: Request): number {
  const raw = new URL(request.url).searchParams.get("hours");
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0) return DEFAULT_HOURS;
  return Math.min(n, REPLY_WINDOW_DAYS * 24);
}

async function pending(hours: number) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const leads = await db.lead
    .findMany({
      where: {
        /** המעקות של הבוט חלים גם כאן */
        doNotContact: false,
        botMuted: false,
        /** **התגובה עצמה** חייבת להיות בתוך החלון */
        messages: { some: { direction: "in", createdAt: { gte: since } } },
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        status: true,
        origin: true,
        chatId: true,
        messages: {
          /**
           * ההיסטוריה נקראת רחב יותר מהחלון, אחרת הדיוור
           * עצמו נופל מחוץ לטווח ואי אפשר לזהות שהתגובה
           * היא תגובה אליו.
           */
          where: {
            createdAt: {
              gte: new Date(
                Date.now() - (REPLY_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000
              ),
            },
          },
          orderBy: { createdAt: "asc" },
          select: {
            direction: true,
            broadcast: true,
            broadcastKind: true,
            templateName: true,
            bodyText: true,
            createdAt: true,
          },
          take: 100,
        },
        events: {
          where: { type: ASKED_EVENT },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 1000,
    })
    .catch(() => []);

  const listSends = await lastListSendForMany(
    leads.map((lead) => lead.phone)
  ).catch(() => new Map<string, Date>());

  const settings = await getSettings();
  const now = new Date();

  return leads
    .map((lead) => {
      const decision = decideInbound({
        messages: lead.messages,
        origin: lead.origin,
        askedAt: lead.events[0]?.createdAt ?? null,
        blacklisted: false,
        listSendAt: listSends.get(lead.phone) ?? null,
        askEveryone: settings.botAskAll,
        now,
      });

      if (!decision.askSupplier) return null;

      /**
       * ההכרעה מסתכלת על כל ההיסטוריה, ולכן צריך לוודא
       * שהתגובה שבגללה הוא נבחר היא **מהחלון** ולא תגובה
       * ישנה שנשארה פתוחה.
       */
      const repliedAt = decision.window?.repliedAt;
      if (!repliedAt || repliedAt.getTime() < since.getTime()) return null;

      return { lead, decision };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

/** קוראת בלבד */
export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hours = hoursFrom(request);
  const rows = await pending(hours);

  return NextResponse.json({
    חלון: `${hours} שעות אחורה`,
    כמה: rows.length,
    מי: rows.map((r) =>
      `${r.lead.firstName ?? ""} ${displayPhone(r.lead.phone)} · ענה: "${(
        r.decision.window?.replyText ?? ""
      ).slice(0, 60)}"`.trim()
    ),
    מסקנה:
      rows.length === 0
        ? "אין אף אחד שהגיב לדיוור ולא קיבל את השאלה."
        : `${rows.length} אנשים הגיבו ב-${hours} השעות האחרונות ולא קיבלו את שאלת הסינון. שליחה תשלח להם אותה עכשיו. להרחיב את החלון - הוסף ?hours=48 לכתובת.`,
  });
}

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hours = hoursFrom(request);
  const rows = await pending(hours);

  let sent = 0;
  let failed = 0;

  for (const { lead, decision } of rows) {
    const ok = await replyToLead({
      leadId: lead.id,
      phone: lead.phone,
      chatId: lead.chatId,
      text: SUPPLIER_QUESTION,
    }).catch(() => false);

    if (!ok) {
      failed++;
      continue;
    }

    sent++;

    /**
     * נרשם בדיוק כמו שהבוט רושם, כדי שלא ישאל שוב
     * כשהתשובה תגיע.
     */
    await db.leadEvent
      .create({
        data: {
          leadId: lead.id,
          type: ASKED_EVENT,
          actor: "bot",
          payload: { reason: decision.reason, catchUp: true },
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    נשלחו: sent,
    נכשלו: failed,
    מסקנה: `נשלחה שאלת הסינון ל-${sent} אנשים.${
      failed ? ` ${failed} נכשלו - בדוק ביומן ההודעות.` : ""
    } מכאן התשובות שלהם יטופלו אוטומטית.`,
  });
}
