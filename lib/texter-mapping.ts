/**
 * ============================================================
 *  קריאת הודעה נכנסת מטקסטר (Scenario)
 * ============================================================
 *
 *  המבנה האמיתי שטקסטר שולח (אומת ב-29.7.26):
 *
 *  {
 *    eventName: "newIncomingMessage",
 *    eventData: {
 *      chat: {
 *        _id: "<chatId>",
 *        title: "<שם הלקוח>",
 *        channelInfo: { id: "<טלפון הלקוח>", name: "whatsapp",
 *                       accountId: "<המספר העסקי שלנו>" },
 *        crmData: { leadId, accountId }
 *      },
 *      message: {
 *        _id: "<מזהה הודעה>",
 *        text: "<תוכן>",
 *        incoming: true, outgoing: false, direction: "incoming",
 *        parent_chat: "<chatId>",
 *        channelInfo: { id: "wamid...." },   // מזהה, לא טלפון
 *        chatChannelInfo: { id: "<טלפון הלקוח>", name: "whatsapp" }
 *      }
 *    }
 *  }
 *
 *  שתי מלכודות שנפלנו בהן וצריך לשמור עליהן:
 *  1. השדה name מכיל "whatsapp" - אסור לקחת אותו כשם הלקוח
 *  2. message.channelInfo.id הוא מזהה הודעה, לא מספר טלפון
 */

export type InboundMessage = {
  phone: string | null;
  text: string | null;
  messageId: string | null;
  chatId: string | null;
  senderName: string | null;
  isOutgoing: boolean;
};

const EMPTY: InboundMessage = {
  phone: null,
  text: null,
  messageId: null,
  chatId: null,
  senderName: null,
  isOutgoing: false,
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * מוצא מספר טלפון: אובייקט ערוץ שבו name הוא whatsapp,
 * ואז השדה id שלו הוא הטלפון של הלקוח.
 * (accountId הוא המספר העסקי שלנו - לא לוקחים אותו)
 */
function findChannelPhone(obj: unknown, depth = 0): string | null {
  if (depth > 6) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findChannelPhone(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = asObject(obj);
  if (!record) return null;

  const name = str(record.name);
  const id = str(record.id);
  if (name && id && /whatsapp|sms|telegram/i.test(name) && /^\+?\d{7,15}$/.test(id)) {
    return id;
  }

  for (const value of Object.values(record)) {
    const found = findChannelPhone(value, depth + 1);
    if (found) return found;
  }

  return null;
}

export function mapInboundMessage(payload: unknown): InboundMessage {
  const root = asObject(payload);
  if (!root) return { ...EMPTY };

  const eventData = asObject(root.eventData) ?? root;
  const chat = asObject(eventData.chat);
  const message = asObject(eventData.message);

  // --- מבנה מוכר של טקסטר ---
  if (chat || message) {
    const phone =
      findChannelPhone(message?.chatChannelInfo) ??
      findChannelPhone(chat?.channelInfo) ??
      findChannelPhone(eventData);

    const text = str(message?.text) ?? str(asObject(chat?.lastMessage)?.text);

    const messageId = str(message?._id) ?? str(asObject(message?.channelInfo)?.id);

    const chatId = str(chat?._id) ?? str(message?.parent_chat);

    // שם הלקוח מגיע מכותרת הצ'אט. לא לוקחים משדה name - שם כתוב "whatsapp"
    let senderName = str(chat?.title);
    if (senderName && /^(whatsapp|sms|telegram|unknown)$/i.test(senderName)) {
      senderName = null;
    }
    // אם הכותרת היא בעצם המספר - לא שם
    if (senderName && /^\+?\d{7,15}$/.test(senderName)) senderName = null;

    const isOutgoing =
      message?.outgoing === true ||
      /^(out|outgoing|sent|outbound)$/i.test(str(message?.direction) ?? "") ||
      /outgoing/i.test(str(root.eventName) ?? "");

    if (phone || text) {
      return { phone, text, messageId, chatId, senderName, isOutgoing };
    }
  }

  // --- גיבוי: מבנה שטוח פשוט ---
  const flatPhone =
    str(root.from) ??
    str(root.sender) ??
    str(root.phone) ??
    str(root.waId) ??
    str(root.wa_id) ??
    str(root.msisdn) ??
    findChannelPhone(root);

  const flatText =
    str(root.text) ?? str(root.body) ?? str(root.message) ?? str(root.content);

  const flatOutgoing =
    root.fromMe === true ||
    root.outgoing === true ||
    /^(out|outgoing|sent|outbound)$/i.test(str(root.direction) ?? "");

  return {
    phone: flatPhone,
    text: flatText,
    messageId: str(root.messageId) ?? str(root.message_id) ?? str(root.wamid),
    chatId: str(root.chatId) ?? str(root.chat_id),
    senderName: str(root.senderName) ?? str(root.pushName) ?? str(root.contactName),
    isOutgoing: flatOutgoing,
  };
}
