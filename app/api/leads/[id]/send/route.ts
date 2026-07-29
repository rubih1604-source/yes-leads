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

  const firstName = (lead.firstName || "").trim().split(/\s+/)[0] || "";

  /**
   * כלל אצבע: שולחים את השם הפרטי, אלא אם קראנו את טקסט התבנית
   * ווידאנו שאין בה משתנים בכלל.
   *
   * למה: אם נשלח בלי שם לתבנית שיש בה {{1}}, הלקוח יקבל "היי 1".
   * זו טעות גרועה בהרבה מלשלוח פרמטר מיותר - כי במקרה השני
   * טקסטר פשוט יחזיר שגיאה ואנחנו ננסה שוב בלי.
   */
  const readTemplateText = Boolean(template?.bodyText);
  const sendName =
    firstName !== "" && (!readTemplateText || (template?.variables ?? 1) > 0);

  let result = await sendTemplate({
    templateName,
    to: lead.phone,
    body: sendName ? [firstName] : undefined,
  });

  let attempts = sendName ? "עם שם" : "בלי משתנים";

  if (!result.ok) {
    const retry = await sendTemplate({
      templateName,
      to: lead.phone,
      body: sendName ? undefined : firstName ? [firstName] : undefined,
    });
    if (retry.ok) {
      result = retry;
      attempts = sendName ? "בלי משתנים (ניסיון שני)" : "עם שם (ניסיון שני)";
    }
  }

  const data = (result.data ?? {}) as {
    text?: string;
    messageId?: string;
  };

  await db.message.create({
    data: {
      leadId: lead.id,
      direction: "out",
      templateName,
      bodyText: data.text ?? template?.bodyText ?? null,
      texterMessageId: data.messageId ?? null,
      status: result.ok ? "sent" : "failed",
      error: result.ok
        ? null
        : `${result.error ?? "שגיאה"} · ${JSON.stringify(result.raw).slice(0, 500)}`,
    },
  });

  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: result.ok ? "message_sent" : "message_failed",
      actor: "user",
      payload: { templateName, status: result.status, attempts },
    },
  });

  // אם טקסטר החזיר את הטקסט האמיתי - שומרים אותו לתבנית להבא
  if (result.ok && data.text && template && !template.bodyText) {
    await db.template
      .update({
        where: { name: templateName },
        data: { bodyText: data.text },
      })
      .catch(() => null);
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "השליחה נכשלה", raw: result.raw },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, messageId: data.messageId });
}
