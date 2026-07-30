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
import {
  isWithinWorkingHours,
  shiftToWorkingHours,
  nextWorkingPhrase,
} from "./working-hours";
import { displayPhone } from "./phone";
import { searchChatByPhone, extractChatId, sendSessionMessage } from "./texter";
import { matchKnowledge } from "./answer";
import { emailLeadAlert } from "./email";
import { shouldBotReply } from "./bot-gate";
import { getSettings } from "./settings";
import { getWonStatusNames } from "./status-store";

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
        error:
          "לא נמצא מזהה צ'אט. גם החיפוש בטקסטר לא החזיר תוצאה - בדוק שהטוקן כולל הרשאות צ'אטים.",
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
        : `${result.error ?? "שגיאה"} · chatId=${chatId} · ${JSON.stringify(result.raw).slice(0, 250)}`,
    },
  });

  return result.ok;
}

/** בודק אם הסטטוס הוא של עסקה סגורה */
async function isClosedStatus(status: string): Promise<boolean> {
  const won = await getWonStatusNames();
  return won.includes(status);
}

/** ממלא את מציין המקום {מתי} בניסוח הנכון ליום */
function fillPlaceholders(text: string, now: Date): string {
  return text.replace(/\{מתי\}/g, nextWorkingPhrase(now));
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

  // לפני הכל: האם הבוט בכלל אמור לדבר עכשיו?
  const gate = await shouldBotReply(lead.id);

  if (!gate.allowed) {
    await db.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "bot_skipped",
        actor: "bot",
        payload: { reason: gate.reason },
      },
    });

    await db.alert.create({
      data: {
        leadId: lead.id,
        title: "לקוח כתב - הבוט לא ענה",
        body: `${lead.firstName || displayPhone(lead.phone)}: ${params.text.slice(0, 200)}\n\nהסיבה: ${gate.reason}`,
      },
    });

    return {
      classification: {
        intent: "unknown",
        confidence: 0,
        requestedCallbackAt: null,
        callbackParseConfident: false,
        suggestedReply: null,
        reasoning: gate.reason,
      },
      actions: [`skipped:${gate.reason}`],
    };
  }

  const lastOut = await db.message.findFirst({
    where: { leadId: lead.id, direction: "out" },
    orderBy: { createdAt: "desc" },
  });

  const settings = await getSettings();

  /**
   * לקוח בסטטוס "נסגר" - ההודעה שלו היא כמעט תמיד שירות.
   * אבל רק אחרי 24 שעות מרגע הסגירה. ביממה הראשונה
   * הוא עדיין באמצע התהליך והשיחה עשויה להיות מכירתית.
   */
  let closedForService = false;
  if (await isClosedStatus(lead.status)) {
    const closedEvent = await db.leadEvent.findFirst({
      where: { leadId: lead.id, type: "status_changed", toStatus: lead.status },
      orderBy: { createdAt: "desc" },
    });
    const changedAt = closedEvent?.createdAt ?? lead.updatedAt;
    closedForService =
      Date.now() - changedAt.getTime() > 24 * 60 * 60 * 1000;
  }

  const classification = await classifyMessage({
    text: params.text,
    currentStatus: lead.status,
    lastTemplateSent: lastOut?.bodyText ?? lastOut?.templateName ?? null,
    isClosedDeal: closedForService,
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

    if (!gate.serviceOnly) {
      await replyToLead({
        leadId: lead.id,
        phone: lead.phone,
        chatId: lead.chatId,
        text: fillPlaceholders(
          dueAt
            ? settings.replyCallback
            : isWithinWorkingHours(now)
            ? settings.replyInterested
            : settings.replyAfterHours,
          now
        ),
      });
    }

    await db.alert.create({
      data: {
        leadId: lead.id,
        title: "לקוח ביקש שתחזור אליו",
        body: `${displayName}: ${params.text.slice(0, 200)}`,
      },
    });

    await emailLeadAlert({
      headline: "לקוח ביקש שתחזור אליו",
      customerName: displayName,
      phone: displayPhone(lead.phone),
      status: lead.status,
      message: params.text.slice(0, 400),
      extra: dueAt
        ? `הזמן שביקש: ${dueAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`
        : "לא ציין זמן מדויק - שווה לבדוק את ההודעה",
      leadId: lead.id,
    });

    actions.push(dueAt ? "task:scheduled" : "task:needs-review");
    return { classification, actions };
  }

  // ---------- מביע עניין ----------
  if (classification.intent === "interested" && classification.confidence >= 0.7) {
    /**
     * במצב "רק שירות" לא שולחים תשובה מכירתית.
     * הלקוח אמר שהוא מעוניין - אתה רואה ומחליט מה לענות.
     */
    const sent = gate.serviceOnly
      ? false
      : await replyToLead({
          leadId: lead.id,
          phone: lead.phone,
          chatId: lead.chatId,
          text: fillPlaceholders(
            isWithinWorkingHours(now)
              ? settings.replyInterested
              : settings.replyAfterHours,
            now
          ),
        });

    const afterHours = !isWithinWorkingHours(now);

    await db.task.create({
      data: {
        leadId: lead.id,
        title: gate.serviceOnly
          ? `ליד חם - ${displayName} מחכה לתשובה ממך`
          : afterHours
          ? `להתקשר ל${displayName} - ביקש מחוץ לשעות`
          : `ליד חם - להתקשר ל${displayName}`,
        body: [
          `הלקוח הביע עניין: "${params.text.slice(0, 300)}"`,
          gate.serviceOnly
            ? "לא נשלחה תשובה אוטומטית - בחרת שפניות מכירתיות מחכות להחלטה שלך."
            : afterHours
            ? `נשלחה לו הודעה ששאלה מתי ${nextWorkingPhrase(now)} מתאים לו. אם יענה עם שעה - תיפתח משימה נוספת לשעה הזו.`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        dueAt: isWithinWorkingHours(now) ? now : shiftToWorkingHours(now),
        urgent: true,
      },
    });

    await emailLeadAlert({
      headline: "לקוח הביע עניין ומחכה לשיחה ממך",
      customerName: displayName,
      phone: displayPhone(lead.phone),
      status: lead.status,
      message: params.text.slice(0, 400),
      extra: gate.serviceOnly
        ? "לא נשלחה תשובה אוטומטית - אתה מחליט מה לענות."
        : sent
        ? "העוזר כבר ענה לו."
        : null,
      leadId: lead.id,
      urgent: true,
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

  // ---------- שאלת שירות או טכניקה ----------
  if (
    classification.intent === "technical_question" ||
    classification.intent === "question"
  ) {
    /**
     * הבוט עונה על שאלת שירות **פעם אחת**.
     * אם הלקוח כותב שוב - סימן שהוא לא הסתדר, ואז הבוט שותק
     * ואתה מקבל התראה. זו בדיוק ההתנהגות שביקשת.
     */
    const alreadyAnswered = await db.leadEvent.findFirst({
      where: {
        leadId: lead.id,
        type: "bot_answered",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (alreadyAnswered) {
      await db.task.create({
        data: {
          leadId: lead.id,
          title: `${displayName} כתב שוב - כנראה לא הסתדר`,
          body: [
            `ההודעה: "${params.text.slice(0, 300)}"`,
            "",
            "העוזר כבר שלח לו תשובה קודם והוא חזר. הוא צריך אותך.",
          ].join("\n"),
          urgent: true,
          sourceQuestion: params.text.slice(0, 500),
        },
      });

      await db.alert.create({
        data: {
          leadId: lead.id,
          title: "לקוח חזר אחרי תשובת העוזר",
          body: `${displayName}: ${params.text.slice(0, 200)}`,
        },
      });

      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "bot_escalated",
          actor: "bot",
          payload: { reason: "הלקוח כתב שוב אחרי תשובה" },
        },
      });

      actions.push("escalated:second-message");
      return { classification, actions };
    }

    const match = await matchKnowledge({ question: params.text });

    if (match.matched && match.answer) {
      const sent = await replyToLead({
        leadId: lead.id,
        phone: lead.phone,
        chatId: lead.chatId,
        text: match.answer,
      });

      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "bot_answered",
          actor: "bot",
          payload: { topic: match.topic, sent },
        },
      });

      await db.alert.create({
        data: {
          leadId: lead.id,
          title: "העוזר ענה ללקוח",
          body: `${displayName} שאל: "${params.text.slice(0, 150)}"\nנשלחה התשובה: ${match.topic}`,
        },
      });

      actions.push(`reply:${match.topic}`);
      return { classification, actions };
    }

    // אין נושא מתאים - לא ממציאים כלום ולא שולחים כלום
    await db.task.create({
      data: {
        leadId: lead.id,
        title: `שאלה מ${displayName} - צריך תשובה`,
        body: [
          `השאלה: "${params.text.slice(0, 300)}"`,
          "",
          "אין נושא מתאים במאגר הידע, אז לא נשלחה תשובה.",
          "אחרי שתענה - הוסף את זה למאגר בלחיצה, והעוזר יידע בפעם הבאה.",
        ].join("\n"),
        needsReview: true,
        sourceQuestion: params.text.slice(0, 500),
      },
    });

    await db.alert.create({
      data: {
        leadId: lead.id,
        title: "שאלה שהעוזר לא ידע",
        body: `${displayName}: ${params.text.slice(0, 200)}`,
      },
    });

    actions.push("task:answer-needed");
    return { classification, actions };
  }

  // ---------- משהו לא ברור: לא נוגעים בסטטוס ----------
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
