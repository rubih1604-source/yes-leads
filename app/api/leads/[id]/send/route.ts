import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTemplate } from "@/lib/texter";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { templateName } = await request
    .json()
    .catch(() => ({ templateName: "" }));

  if (!templateName) {
    return NextResponse.json({ error: "לא נבחרה תבנית" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }

  // מעקה בטיחות: לא שולחים למי שביקש להסיר אותו
  if (lead.doNotContact) {
    return NextResponse.json(
      { error: "הליד ברשימת אי-פנייה - לא נשלחה הודעה" },
      { status: 400 }
    );
  }

  const template = await db.template.findUnique({
    where: { name: templateName },
  });

  // ממלאים {{1}} בשם הפרטי של הלקוח
  const firstName = (lead.firstName || "").trim().split(/\s+/)[0] || "";
  const variableCount = template?.variables ?? 1;
  const body = variableCount > 0 ? [firstName] : undefined;

  const result = await sendTemplate({
    templateName,
    to: lead.phone,
    body,
  });

  const sentText =
    result.data && typeof result.data === "object"
      ? (result.data as { text?: string }).text ?? null
      : null;
  const messageId =
    result.data && typeof result.data === "object"
      ? (result.data as { messageId?: string }).messageId ?? null
      : null;

  await db.message.create({
    data: {
      leadId: lead.id,
      direction: "out",
      templateName,
      bodyText: sentText ?? template?.bodyText ?? null,
      texterMessageId: messageId,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    },
  });

  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: result.ok ? "message_sent" : "message_failed",
      actor: "user",
      payload: { templateName, status: result.status },
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "השליחה נכשלה", raw: result.raw },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, messageId });
}
