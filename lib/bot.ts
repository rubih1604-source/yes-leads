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
import { detectUnsubscribe, intentBlacklists } from "./unsubscribe";
import { decideInbound } from "./inbound-context";
import { addToBlacklist } from "./blacklist";
import {
  readSupplierAnswer,
  replyForAnswer,
  SUPPLIER_QUESTION,
  ASKED_EVENT,
} from "./supplier-check";

import { searchChatByPhone, extractChatId, sendSessionMessage } from "./texter";
import { matchKnowledge } from "./answer";
import { emailLeadAlert } from "./email";
import { shouldBotReply } from "./bot-gate";
import { resolveCallbackTime } from "./callback-time";
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
        requestedDate: null,
        requestedDayPart: null,
        suggestedReply: null,
        reasoning: "הליד לא נמצא",
      },
      actions,
    };
  }

  /**
   * ============================================================
   *  בקשת הסרה נרשמת לפני כל שער
   * ============================================================
   *
   *  **זה חייב לרוץ לפני הבדיקה אם הבוט מדבר.**
   *
   *  השער מחליט אם הבוט *עונה* - לא אם אנחנו *מקשיבים*.
   *  בוט כבוי, שעה מחוץ לחלון, או סטטוס שלא נבחר היו
   *  גורמים ל"הסר" לא להירשם בכלל, והאדם היה מקבל את
   *  הדיוור הבא. בקשה להפסיק לקבל הודעות היא לא תשובה
   *  אוטומטית - היא חובה, והיא לא תלויה בהגדרות הבוט.
   */
  const certain = detectUnsubscribe(params.text);

  if (certain.blacklist) {
    await addToBlacklist({
      leadId: lead.id,
      reason: certain.reason ?? "ביקש להסיר",
      text: params.text,
    });
    actions.push("blacklist");
  }

  // האם הבוט בכלל אמור לדבר עכשיו?
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
        requestedDate: null,
        requestedDayPart: null,
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

  /**
   * ============================================================
   *  שאלת הסינון שאחרי הדיוור
   * ============================================================
   *
   *  מי שענה לדיוור מקבל שאלה אחת לפני שאתה מתקשר: האם
   *  הוא כבר לקוח של yes או סטינג. לקוח קיים שמגיב למבצע
   *  הוא שיחה מבוזבזת - אין מה למכור לו, והוא צריך שירות.
   *
   *  מי שביקש להסיר כבר יצא קודם, ולכן לא מגיע לכאן.
   */
  const askedEvent = certain.blacklist
    ? null
    : await db.leadEvent
        .findFirst({
          where: { leadId: lead.id, type: ASKED_EVENT },
          orderBy: { createdAt: "desc" },
        })
        .catch(() => null);

  /**
   * מי שביקש להסיר לא נשאל ולא נענה.
   *
   * בלי התנאי הזה אדם שכתב "הסר" היה מקבל בחזרה "האם אתם
   * לקוחות של yes?" - בדיוק ההפך ממה שביקש, ושנייה לפני
   * שהוא נכנס לרשימה השחורה.
   */
  if (!certain.blacklist && askedEvent) {
    /**
     * השאלה כבר נשאלה - ההודעה הזו היא כנראה התשובה.
     *
     * תשובה שאי אפשר להכריע **לא** עושה כלום ונופלת
     * לסיווג הרגיל: ניחוש כאן מסמן לקוח אמיתי כלקוח קיים
     * ומוציא אותו מהרשימה.
     */
    const answer = readSupplierAnswer(params.text);
    const reply = replyForAnswer(answer);

    if (answer && reply) {
      await replyToLead({
        leadId: lead.id,
        phone: lead.phone,
        chatId: lead.chatId,
        text: reply,
      });

      await db.leadEvent
        .create({
          data: {
            leadId: lead.id,
            type: "supplier_check_answered",
            actor: "bot",
            payload: { answer, text: params.text.slice(0, 200) },
          },
        })
        .catch(() => null);

      if (answer === "yes") {
        await applyStatusChange({
          leadId: lead.id,
          toStatus: "לקוח קיים",
          actor: "bot",
          note: "ענה שהוא כבר לקוח של yes/sting",
        });
        actions.push("status:לקוח קיים");
      }

      actions.push(`supplier:${answer}`);

      return {
        classification: {
          intent: answer === "yes" ? "existing_customer" : "interested",
          confidence: 0.95,
          requestedCallbackAt: null,
          callbackParseConfident: false,
          requestedDate: null,
          requestedDayPart: null,
          suggestedReply: null,
          reasoning: "תשובה לשאלת הסינון שאחרי הדיוור",
        },
        actions,
      };
    }
  } else if (!certain.blacklist) {
    /**
     * עוד לא נשאל. אם ההודעה הזו היא תגובה לדיוור - זה
     * הרגע לשאול, לפני כל טיפול אחר.
     */
    const history = await db.message
      .findMany({
        where: { leadId: lead.id },
        orderBy: { createdAt: "asc" },
        select: {
          direction: true,
          templateName: true,
          bodyText: true,
          createdAt: true,
        },
        take: 200,
      })
      .catch(() => []);

    /**
     * ההכרעה אינה נעשית כאן.
     *
     * decideInbound רואה את כל התמונה - מאיזה סוג דיוור
     * הוא הגיע, אם כבר נשאל, ואם הוא ברשימה השחורה -
     * ומחזיר תשובה אחת. הבוט רק מבצע אותה.
     */
    const decision = decideInbound({
      messages: history,
      origin: lead.origin,
      alreadyAsked: Boolean(askedEvent),
      blacklisted: lead.doNotContact,
      now: new Date(),
    });

    if (decision.askSupplier) {
      const sent = await replyToLead({
        leadId: lead.id,
        phone: lead.phone,
        chatId: lead.chatId,
        text: SUPPLIER_QUESTION,
      });

      if (sent) {
        await db.leadEvent
          .create({
            data: {
              leadId: lead.id,
              type: ASKED_EVENT,
              actor: "bot",
              payload: {
                text: params.text.slice(0, 200),
                reason: decision.reason,
              },
            },
          })
          .catch(() => null);

        actions.push("supplier:asked");

        return {
          classification: {
            intent: "other",
            confidence: 0,
            requestedCallbackAt: null,
            callbackParseConfident: false,
            requestedDate: null,
            requestedDayPart: null,
            suggestedReply: null,
            reasoning: "נשאלה שאלת הסינון שאחרי הדיוור",
          },
          actions,
        };
      }
    }
  }

  const settings = await getSettings();

  /**
   * ============================================================
   *  מצב "רק דיוור"
   * ============================================================
   *
   *  **הבוט לא אמור לענות על כל הודעה.** התפקיד שלו כאן
   *  הוא למקד דיוור: לשאול את שאלת הסינון, לקרוא את
   *  התשובה, ולעצור שם.
   *
   *  כל מה שמעל השורה הזו כבר רץ - בקשת הסרה נרשמת, ושאלת
   *  הסינון נשאלת ונענית. מי שהגיע עד לכאן במצב הזה הוא
   *  מישהו שכתב לך משהו אחר, והוא **שלך**: לא מסווגים
   *  אותו, לא עונים לו, ולא פותחים לו אוטומציה.
   *
   *  ההודעה כבר נשמרה בכרטיס, ולכן שום דבר לא הולך לאיבוד -
   *  אתה פשוט רואה אותה בשיחות ומחליט בעצמך.
   */
  if (settings.botMode === "broadcast") {
    await db.leadEvent
      .create({
        data: {
          leadId: lead.id,
          type: "bot_skipped",
          actor: "bot",
          payload: { reason: "מצב רק דיוור" },
        },
      })
      .catch(() => null);

    actions.push("skipped:מצב רק דיוור");

    return {
      classification: {
        intent: "unknown",
        confidence: 0,
        requestedCallbackAt: null,
        callbackParseConfident: false,
        requestedDate: null,
        requestedDayPart: null,
        suggestedReply: null,
        reasoning: "הבוט במצב 'רק דיוור' ולא מטפל בהודעות אחרות",
      },
      actions,
    };
  }

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

  /**
   * כל חותמת זמן בהודעה הופכת למשימה עם שעה - גם אם היא כללית.
   * "יום שני בבוקר" נקבע ל-09:30, "אחרי הצהריים" ל-17:00.
   * עדיף משימה שאתה מזיז מאשר לקוח שנשכח.
   */
  const requested = resolveCallbackTime({
    isoDateTime: classification.requestedCallbackAt,
    confident: classification.callbackParseConfident,
    date: classification.requestedDate,
    dayPart: classification.requestedDayPart,
    now,
  });

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
  /**
   * שתי דלתות, רשימה אחת.
   *
   * הזיהוי הוודאי גובר: אם הוא תפס, לא משנה מה הסיווג
   * החכם החזיר. אחרת הסיווג מכריע, וזה מה שתופס ניסוחים
   * שלא חשבנו עליהם.
   */
  const unsubscribe = certain.blacklist
    ? certain
    : intentBlacklists(classification.intent, classification.confidence);

  if (unsubscribe.blacklist) {
    const previousStatus = lead.status;

    await addToBlacklist({
      leadId: lead.id,
      reason: unsubscribe.reason ?? "ביקש להסיר",
      text: params.text,
    });

    await applyStatusChange({
      leadId: lead.id,
      toStatus: "לא מעוניין",
      actor: "bot",
      note: `${unsubscribe.reason} · ${
        certain.blacklist ? "ניסוח מפורש" : `סיווג: ${classification.intent}`
      }`,
    });

    await db.alert.create({
      data: {
        leadId: lead.id,
        title: `${unsubscribe.reason} - ברשימה שחורה`,
        body: `${displayName} · הועבר ל"לא מעוניין" (היה "${previousStatus}") · לא יקבל דיוור. אפשר להוציא מהרשימה בכרטיס הליד.`,
      },
    });

    actions.push("status:לא מעוניין");
    actions.push("blacklist");
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
    const dueAt = requested?.at ?? null;

    await db.task.create({
      data: {
        leadId: lead.id,
        title: `להתקשר ל${displayName}`,
        body: [
          `ההודעה שלו: "${params.text.slice(0, 300)}"`,
          requested ? "" : null,
          requested ? requested.note : "לא הצלחתי לקבוע מתי בדיוק - כדאי שתקבע.",
        ]
          .filter((x) => x !== null)
          .join("\n"),
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
        dueAt:
          requested?.at ??
          (isWithinWorkingHours(now) ? now : shiftToWorkingHours(now)),
        urgent: !requested,
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
  if (requested) {
    await db.task.create({
      data: {
        leadId: lead.id,
        title: `להתקשר ל${displayName}`,
        body: [`ההודעה: "${params.text.slice(0, 300)}"`, "", requested.note]
          .join("\n"),
        dueAt: requested.at,
      },
    });
    actions.push("task:from-time");
  }

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
