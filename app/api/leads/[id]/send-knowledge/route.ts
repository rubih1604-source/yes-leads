import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import {
  searchChatByPhone,
  extractChatId,
  sendSessionMessage,
} from "@/lib/texter";

export const dynamic = "force-dynamic";

/** שליחה ידנית של תשובת שירות מהמאגר, מילה במילה */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { knowledgeId } = await request.json().catch(() => ({}));
  if (!knowledgeId) {
    return NextResponse.json({ error: "לא נבחרה תשובה" }, { status: 400 });
  }

  const [lead, item] = await Promise.all([
    db.lead.findUnique({ where: { id: params.id } }),
    db.knowledgeItem.findUnique({ where: { id: knowledgeId } }),
  ]);

  if (!lead) return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  if (!item)
    return NextResponse.json({ error: "התשובה לא נמצאה" }, { status: 404 });

  if (lead.doNotContact) {
    return NextResponse.json(
      { error: "הליד ברשימת אי-פנייה" },
      { status: 400 }
    );
  }

  // מזהה הצ'אט: שמור אצלנו, ואם לא - מחפשים
  let chatId = lead.chatId;
  if (!chatId) {
    const found = await searchChatByPhone(lead.phone);
    chatId = found.ok ? extractChatId(found.raw) : null;
    if (chatId) {
      await db.lead
        .update({ where: { id: lead.id }, data: { chatId } })
        .catch(() => null);
    }
  }

  if (!chatId) {
    return NextResponse.json(
      { error: "לא נמצא צ'אט בטקסטר. אפשר לשלוח רק ללקוח שכבר כתב לך." },
      { status: 400 }
    );
  }

  const result = await sendSessionMessage({ chatId, text: item.answer });

  await db.message.create({
    data: {
      leadId: lead.id,
      direction: "out",
      bodyText: item.answer,
      status: result.ok ? "sent" : "failed",
      error: result.ok
        ? null
        : `${result.error ?? "שגיאה"} · ${JSON.stringify(result.raw).slice(0, 250)}`,
    },
  });

  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: result.ok ? "bot_answered" : "message_failed",
      actor: "user",
      payload: { topic: item.topic, manual: true },
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          "השליחה נכשלה. ייתכן שעברו 24 שעות מאז שהלקוח כתב, ואז אפשר לשלוח רק תבנית.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
