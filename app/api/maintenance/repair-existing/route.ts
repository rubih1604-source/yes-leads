import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { isExistingCustomer, supplierAnswer } from "@/lib/existing-customer";

export const dynamic = "force-dynamic";

/**
 * מתקן לידים שסומנו בטעות כלקוחות קיימים.
 *
 * הסריקה הרחבה שהייתה כאן קודם סימנה כמעט כל ליד, כי שמות
 * הקמפיינים והטפסים מכילים את המילה yes. הפעולה הזו עוברת
 * ליד ליד ומיישרת לפי שאלת הספק בלבד.
 *
 * מה שקורה:
 *  - סטטוס "לקוח קיים" ושאלת הספק אינה yes/sting -> חוזר ל"חדש"
 *  - שאלת הספק כן yes/sting והסטטוס אחר -> עובר ל"לקוח קיים"
 *
 * בכל מקרה מבטלים משימות ממתינות של אותם לידים, כדי שלא
 * תצא להם הודעה על סמך הסימון השגוי.
 *
 * לידים שסימנת ידנית ואין להם שאלת ספק כלל - לא נוגעים בהם.
 */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    select: { id: true, status: true, extra: true },
  });

  let wrong = 0;
  let missing = 0;

  for (const lead of leads) {
    const answer = supplierAnswer(lead.extra);
    if (!answer) continue;

    const should = isExistingCustomer(lead.extra, lead.status);

    if (lead.status === "לקוח קיים" && !should) wrong++;
    if (should && lead.status !== "לקוח קיים") missing++;
  }

  return NextResponse.json({ ok: true, wrong, missing });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    select: { id: true, status: true, extra: true },
  });

  let reverted = 0;
  let marked = 0;
  let cancelled = 0;

  for (const lead of leads) {
    const answer = supplierAnswer(lead.extra);
    // אין שאלת ספק - סימון ידני שלך, לא נוגעים
    if (!answer) continue;

    const should = isExistingCustomer(lead.extra, lead.status);

    if (lead.status === "לקוח קיים" && !should) {
      await db.lead
        .update({ where: { id: lead.id }, data: { status: "חדש" } })
        .catch(() => null);

      await db.leadEvent
        .create({
          data: {
            leadId: lead.id,
            type: "status_changed",
            actor: "system",
            fromStatus: "לקוח קיים",
            toStatus: "חדש",
            payload: {
              note: `תוקן: שאלת הספק היא "${answer}", לא yes/sting`,
            },
          },
        })
        .catch(() => null);

      reverted++;
    } else if (should && lead.status !== "לקוח קיים") {
      await db.lead
        .update({ where: { id: lead.id }, data: { status: "לקוח קיים" } })
        .catch(() => null);

      await db.leadEvent
        .create({
          data: {
            leadId: lead.id,
            type: "status_changed",
            actor: "system",
            fromStatus: lead.status,
            toStatus: "לקוח קיים",
            payload: { note: `תוקן לפי שאלת ספק: ${answer}` },
          },
        })
        .catch(() => null);

      marked++;
    } else {
      continue;
    }

    // אף הודעה לא תצא על סמך הסימון הקודם
    const res = await db.scheduledJob
      .updateMany({
        where: { leadId: lead.id, state: "pending" },
        data: { state: "cancelled", lastError: "תוקן סימון לקוח קיים" },
      })
      .catch(() => ({ count: 0 }));

    cancelled += res.count;
  }

  return NextResponse.json({ ok: true, reverted, marked, cancelled });
}
