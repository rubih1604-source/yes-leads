/**
 * ============================================================
 *  הבוט
 * ============================================================
 *
 *  רץ אחרי כל הודעה נכנסת מלקוח.
 *  מסווג, פועל, ומתעד - אבל תמיד משאיר לך את ההחלטה
 *  במקרים שאינם חד משמעיים.
 */

import { db } from "./db";
import { classifyMessage, type Classification } from "./classify";
import { applyStatusChange } from "./rules";
import { isWithinWorkingHours, shiftToWorkingHours } from "./working-hours";
import { displayPhone } from "./phone";
import { searchChatByPhone, extractChatId, sendSessionMessage } from "./texter";

/** מוצא את מזהה הצ'אט של הליד, ושומר אותו להבא */
async function resolveChatId(leadId: string, phone: string, known: string | null) {
  if (known) return known;

  const result = await searchChatByPhone(phone);
  if (!result.ok) return null;

  const chatId = extractChatId(result.raw);
  if (chatId) {
    await db.lead.update({ where: { id: leadId }, data: { chatId } }).catch(() => null);
  }
  return chatId;
}

/** שולח הודעת טקסט ללקוח ומתעד אותה */
async function replyToLead(params: {
  leadId: string;
  phone: string;
  chatId: string | null;
  text: string;
}) {
  const chatId = await resolveChatId(params.leadId, params.phone, params.chatId);

  if (!chatId) {
    await db.message.create({
      data: {
        leadId: params.leadId,
        direction: "out",
        bodyText: params.text,
        status: "failed",
        error: "לא נמצא צ'אט בטקסטר למספר הזה",
      },
    });
    return false;
  }

  const result = await sendSessionMessage({ chatId, text: params.text });

  await db.message.create({
    data: {
      leadId: params.leadId,
      direction: "out",
      bodyText: params.text,
      status: result.ok ? "sent" : "failed",
      error: result.ok
        ? null
        : `${result.error ?? "שגיאה"} · ${JSON.stringify(result.raw).slice(0, 300)}`,
    },
  });

  return result.ok;
}

/** הניסוח משתנה לפי השעה - לא מבטיחים "כמה דקות" בלילה */
function handoffText(now: Date): string {
  if (isWithinWorkingHours(now)) {
    return "תודה! העברתי את הפנייה לנציג, הוא ייצור איתך קשר בדקות הקרובות.";
  }
  return "תודה! העברתי את הפנייה לנציג, הוא ייצור איתך קשר ביום העבודה הקרוב.";
}

export type BotResult = {
  classification: Classification;
  actions: string[];
};

export async function handleInboundMessage(params: {
  leadId: string;
  text: string;
}): Promise<BotResult> {
  const actions: string[] = [];

  const lead = await db.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) {
    return {
      classification: {
        intent: "unknown",
        confidence: 0,
        requestedCallbackAt: null,
        callbackParseConfident: false,
        suggestedReply: null,
        reasoning: "הליד לא נמצא",
      },
      actions,
    };
  }

  const lastOut = await db.message.findFirst({
    where: { leadId: lead.id, direction: "out" },
    orderBy: { createdAt: "desc" },
  });

  const classification = await classifyMessage({
    text: params.text,
    currentStatus: lead.status,
    lastTemplateSent: lastOut?.bodyText ?? lastOut?.templateName ?? null,
  });

  const now = new Date();
  const displayName = lead.firstName || displayPhone(lead.phone);

  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "bot_classified",
      actor: "bot",
      payload: {
        intent: classification.intent,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      },
    },
  });

  // ---------- בקשת הסרה או חוסר עניין ברור ----------
  if (
    (classification.intent === "remove" ||
      classification.intent === "not_interested") &&
    classification.confidence >= 0.85
  ) {
    const previousStatus = lead.status;

    await db.lead.update({
      where: { id: lead.id },
      data: { doNotContact: classification.intent === "remove" },
    });

    await applyStatusChange({
      leadId: lead.id,
      toStatus: "לא מעוניין",
      actor: "bot",
      note: `הבוט זיהה: ${classification.intent}`,
    });

    await db.alert.create({
      data: {
        leadId: lead.id,
        title:
          classification.intent === "remove"
            ? "לקוח ביקש להסיר"
            : "לקוח אמר שלא מעוניין",
        body: `${displayName} · הועבר ל"לא מעוניין" (היה "${previousStatus}") · הבוט. אפשר לבטל מכרטיס הליד.`,
      },
    });

    actions.push("status:לא מעוניין");
    if (classification.intent === "remove") actions.push("do-not-contact");
    return { classification, actions };
  }

  // ---------- לקוח קיים ----------
  if (
    classification.intent === "existing_customer" &&
    classification.confidence >= 0.85
  ) {
    await applyStatusChange({
      leadId: lead.id,
      toStatus: "לקוח קיים",
      actor: "bot",
      note: "הבוט זיהה שהלקוח כבר לקוח של yes",
    });
    await db.alert.create({
      data: {
        leadId: lead.id,
        title: "לקוח קיים",
        body: `${displayName} · הועבר ל"לקוח קיים" · הבוט`,
      },
    });
    actions.push("status:לקוח קיים");
    return { classification, actions };
  }

  // ---------- מבקש שיחזרו אליו בזמן מסוים ----------
  if (classification.intent === "callback_request") {
    let dueAt: Date | null = null;
    if (classification.requestedCallbackAt && classification.callbackParseConfident) {
      const parsed = new Date(classification.requestedCallbackAt);
      if (!Number.isNaN(parsed.getTime())) dueAt = parsed;
    }

    await db.task.create({
      data: {
        leadId: lead.id,
        title: `להתקשר ל${displayName}`,
        body: dueAt
          ? `הלקוח ביקש שתחזור אליו. ההודעה שלו: "${params.text.slice(0, 300)}"`
          : `הלקוח ביקש שתחזור אליו אבל לא הצלחתי לקבוע מתי בדיוק. ההודעה שלו: "${params.text.slice(0, 300)}"`,
        dueAt,
        needsReview: dueAt === null,
        urgent: false,
      },
    });

    await replyToLead({
      leadId: lead.id,
      phone: lead.phone,
      chatId: lead.chatId,
      text: dueAt
        ? "מעולה, רשמתי. נחזור אליך בזמן שביקשת."
        : "מעולה, רשמתי. נחזור אליך בהקדם.",
    });

    await db.alert.create({
      data: {
        leadId: lead.id,
        title: "לקוח ביקש שתחזור אליו",
        body: `${displayName}: ${params.text.slice(0, 200)}`,
      },
    });

    actions.push(dueAt ? "task:scheduled" : "task:needs-review");
    return { classification, actions };
  }

  // ---------- מביע עניין ----------
  if (classification.intent === "interested" && classification.confidence >= 0.7) {
    const sent = await replyToLead({
      leadId: lead.id,
      phone: lead.phone,
      chatId: lead.chatId,
      text: handoffText(now),
    });

    await db.task.create({
      data: {
        leadId: lead.id,
        title: `ליד חם - להתקשר ל${displayName}`,
        body: `הלקוח הביע עניין: "${params.text.slice(0, 300)}"`,
        dueAt: isWithinWorkingHours(now) ? now : shiftToWorkingHours(now),
        urgent: true,
      },
    });

    await db.alert.create({
      data: {
        leadId: lead.id,
        title: "ליד חם - הלקוח מעוניין",
        body: `${displayName}: ${params.text.slice(0, 200)}${sent ? "" : " · התשובה האוטומטית לא נשלחה"}`,
      },
    });

    actions.push("reply:handoff", "task:urgent");
    return { classification, actions };
  }

  // ---------- שאלה או משהו לא ברור: לא נוגעים בסטטוס ----------
  await db.task.create({
    data: {
      leadId: lead.id,
      title: `לענות ל${displayName}`,
      body: [
        `ההודעה: "${params.text.slice(0, 300)}"`,
        classification.suggestedReply
          ? `הצעה לתשובה: ${classification.suggestedReply}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      needsReview: true,
    },
  });

  actions.push("task:manual");
  return { classification, actions };
}
