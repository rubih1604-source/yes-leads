import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { askSupplierQuestion } from "@/lib/campaign-bot";
import { ASKED_EVENT, DONE_EVENT } from "@/lib/supplier-check";
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
 *  **אותם שלושה תנאים של הבוט, ולא תנאים משלה.**
 *
 *  קודם רצה כאן הכרעה נפרדת שבדקה מקור, סוג דיוור ועוד -
 *  היגיון שני שיכול לסטות מהבוט, ואכן סטה. עכשיו התנאי
 *  פשוט כמו של הבוט: הגיב, לא ברשימה שחורה, ולא נשאל
 *  ולא נסגר מולו תהליך מאז התגובה.
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
        doNotContact: false,
        /** **התגובה עצמה** חייבת להיות בתוך החלון */
        messages: { some: { direction: "in", createdAt: { gte: since } } },
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        messages: {
          where: { direction: "in", createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { bodyText: true, createdAt: true },
        },
        events: {
          where: { type: { in: [ASKED_EVENT, DONE_EVENT] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { type: true, createdAt: true },
        },
      },
      take: 1000,
    })
    .catch(() => []);

  return leads
    .map((lead) => {
      const replied = lead.messages[0];
      if (!replied) return null;

      /**
       * אם כבר נשאל - או שנסגר מולו תהליך - **אחרי**
       * התגובה הזו, הוא טופל. לפניה: התגובה אבדה.
       */
      const last = lead.events[0];
      if (last && last.createdAt.getTime() >= replied.createdAt.getTime()) {
        return null;
      }

      return { lead, replyText: replied.bodyText ?? "" };
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
      `${r.lead.firstName ?? ""} ${displayPhone(r.lead.phone)} · ענה: "${r.replyText.slice(
        0,
        60
      )}"`.trim()
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

  for (const { lead } of rows) {
    /**
     * **השליחה והרישום הם של הבוט עצמו.**
     *
     * קודם היה כאן עותק שני: שליחה אחת ורישום נפרד
     * אחריה. אם השליחה הצליחה והרישום נכשל, אותו אדם
     * היה נשאל שוב. עכשיו זו אותה פונקציה שהבוט מריץ,
     * ולכן אין שתי גרסאות שיכולות להיפרד.
     */
    const ok = await askSupplierQuestion(lead.id).catch(() => false);

    if (ok) sent++;
    else failed++;
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
