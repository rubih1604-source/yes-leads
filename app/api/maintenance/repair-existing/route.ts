import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { isExistingCustomer, supplierAnswer } from "@/lib/existing-customer";

export const dynamic = "force-dynamic";

/**
 * מתקן לידים שסומנו בטעות כלקוחות קיימים.
 *
 * חשוב: לא מחזירים ל"חדש" בעיוורון. קודם מחפשים ביומן
 * את הסטטוס שהליד היה בו **לפני** שהוא הפך ל"לקוח קיים",
 * ומחזירים אליו. ליד שהיה "נשלחה הצעת מחיר" חוזר לשם,
 * לא לתחילת המסלול.
 *
 * רק אם אין תיעוד כזה - נופלים ל"חדש".
 */

async function previousStatusOf(leadId: string): Promise<string | null> {
  const event = await db.leadEvent.findFirst({
    where: {
      leadId,
      type: "status_changed",
      toStatus: "לקוח קיים",
      fromStatus: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { fromStatus: true },
  });

  const from = event?.fromStatus ?? null;
  return from && from !== "לקוח קיים" ? from : null;
}

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
    if (!supplierAnswer(lead.extra)) continue;
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
  let restored = 0;
  let marked = 0;
  let cancelled = 0;

  for (const lead of leads) {
    const answer = supplierAnswer(lead.extra);

    // אין שאלת ספק - סימון ידני שלך, לא נוגעים
    if (!answer) continue;

    const should = isExistingCustomer(lead.extra, lead.status);
    let from: string | null = null;
    let to: string | null = null;

    if (lead.status === "לקוח קיים" && !should) {
      const previous = await previousStatusOf(lead.id);
      if (previous) restored++;

      from = "לקוח קיים";
      to = previous ?? "חדש";
      reverted++;
    } else if (should && lead.status !== "לקוח קיים") {
      from = lead.status;
      to = "לקוח קיים";
      marked++;
    } else {
      continue;
    }

    await db.lead
      .update({ where: { id: lead.id }, data: { status: to } })
      .catch(() => null);

    await db.leadEvent
      .create({
        data: {
          leadId: lead.id,
          type: "status_changed",
          actor: "system",
          fromStatus: from,
          toStatus: to,
          payload: {
            note:
              to === "לקוח קיים"
                ? `תוקן לפי שאלת ספק: ${answer}`
                : `תוקן: שאלת הספק היא "${answer}", לא yes/sting`,
          },
        },
      })
      .catch(() => null);

    // אף הודעה לא תצא על סמך הסימון הקודם
    const res = await db.scheduledJob
      .updateMany({
        where: { leadId: lead.id, state: "pending" },
        data: { state: "cancelled", lastError: "תוקן סימון לקוח קיים" },
      })
      .catch(() => ({ count: 0 }));

    cancelled += res.count;
  }

  return NextResponse.json({
    ok: true,
    reverted,
    restored,
    marked,
    cancelled,
  });
}
