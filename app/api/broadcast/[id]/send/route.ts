import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { sendTemplate } from "@/lib/texter";

export const dynamic = "force-dynamic";

/** כמה נשלחים בכל קריאה, כדי לא לתקוע את הבקשה */
const BATCH = 15;

/**
 * שולח תבנית לרשימת דיוור, במנות.
 *
 * הממשק קורא שוב ושוב עד שנגמר, ומראה התקדמות. ככה אפשר
 * לעצור באמצע, ורואים בדיוק כמה יצאו וכמה נכשלו.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { templateName, sendId } = await request.json().catch(() => ({}));

  const list = await db.broadcastList.findUnique({
    where: { id: params.id },
    include: { contacts: true },
  });

  if (!list) {
    return NextResponse.json({ error: "הרשימה לא נמצאה" }, { status: 404 });
  }

  let send = sendId
    ? await db.broadcastSend.findUnique({ where: { id: sendId } })
    : null;

  if (!send) {
    if (!templateName) {
      return NextResponse.json({ error: "צריך לבחור תבנית" }, { status: 400 });
    }

    const template = await db.template.findUnique({
      where: { name: templateName },
    });
    if (!template) {
      return NextResponse.json(
        { error: `התבנית ${templateName} לא קיימת` },
        { status: 400 }
      );
    }

    send = await db.broadcastSend.create({
      data: {
        listId: list.id,
        templateName,
        total: list.contacts.length,
      },
    });
  }

  const done = send.sent + send.failed;
  const batch = list.contacts.slice(done, done + BATCH);

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const contact of batch) {
    const result = await sendTemplate({
      templateName: send.templateName,
      to: contact.phone,
      body: contact.firstName ? [contact.firstName] : undefined,
    });

    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (!lastError) lastError = result.error ?? "שגיאה";
    }

    // מרווח קטן בין הודעות
    await new Promise((r) => setTimeout(r, 400));
  }

  const finishedCount = done + batch.length;
  const finished = finishedCount >= list.contacts.length;

  const updated = await db.broadcastSend.update({
    where: { id: send.id },
    data: {
      sent: { increment: sent },
      failed: { increment: failed },
      state: finished ? "done" : "running",
      finishedAt: finished ? new Date() : null,
    },
  });

  return NextResponse.json({
    ok: true,
    sendId: updated.id,
    sent: updated.sent,
    failed: updated.failed,
    total: updated.total,
    finished,
    lastError,
  });
}
