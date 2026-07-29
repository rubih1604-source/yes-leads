/**
 * ============================================================
 *  קריאת הודעה נכנסת מטקסטר (Scenario)
 * ============================================================
 *
 *  זה הקובץ היחיד שצריך לגעת בו כשנדע איך באמת נראה
 *  ה-payload שהסנריו של טקסטר שולח.
 *
 *  התהליך: מגדירים את הסנריו, שולחים הודעה למספר העסקי,
 *  ורואים ב"יומן קליטה" מה בדיוק הגיע.
 */

const PHONE_FIELDS = [
  "from", "sender", "phone", "waId", "wa_id", "chatId", "chat_id",
  "senderPhone", "sender_phone", "number", "msisdn", "contactPhone",
];

const TEXT_FIELDS = [
  "text", "body", "message", "content", "caption",
  "messageBody", "message_body", "textBody",
];

const MESSAGE_ID_FIELDS = [
  "messageId", "message_id", "id", "wamid", "msgId", "msg_id",
];

const NAME_FIELDS = [
  "senderName", "sender_name", "contactName", "contact_name",
  "pushName", "push_name", "name", "profileName",
];

/** שדות שמעידים שההודעה יצאה מאיתנו ולא מהלקוח */
const OUTGOING_FLAGS = [
  "fromMe", "from_me", "isOutgoing", "is_outgoing", "outgoing", "self",
];

const DIRECTION_FIELDS = ["direction", "type", "messageType", "message_type"];

export type InboundMessage = {
  phone: string | null;
  text: string | null;
  messageId: string | null;
  senderName: string | null;
  isOutgoing: boolean;
};

function walk(
  obj: unknown,
  visit: (key: string, value: unknown) => void,
  depth = 0
) {
  if (depth > 5 || obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item, visit, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    visit(key, value);
    if (value && typeof value === "object") walk(value, visit, depth + 1);
  }
}

/** מחפש שדה לפי רשימת שמות אפשריים, בכל עומק */
function findString(payload: unknown, candidates: string[]): string | null {
  let found: string | null = null;
  const lower = candidates.map((c) => c.toLowerCase());

  walk(payload, (key, value) => {
    if (found !== null) return;
    if (!lower.includes(key.toLowerCase())) return;
    if (typeof value === "string" && value.trim()) found = value.trim();
    else if (typeof value === "number") found = String(value);
  });

  return found;
}

function detectOutgoing(payload: unknown): boolean {
  let outgoing = false;
  const flags = OUTGOING_FLAGS.map((f) => f.toLowerCase());
  const dirs = DIRECTION_FIELDS.map((f) => f.toLowerCase());

  walk(payload, (key, value) => {
    const k = key.toLowerCase();
    if (flags.includes(k) && (value === true || value === "true")) {
      outgoing = true;
    }
    if (dirs.includes(k) && typeof value === "string") {
      if (/^(out|outgoing|sent|outbound)$/i.test(value.trim())) outgoing = true;
    }
  });

  return outgoing;
}

export function mapInboundMessage(payload: unknown): InboundMessage {
  return {
    phone: findString(payload, PHONE_FIELDS),
    text: findString(payload, TEXT_FIELDS),
    messageId: findString(payload, MESSAGE_ID_FIELDS),
    senderName: findString(payload, NAME_FIELDS),
    isOutgoing: detectOutgoing(payload),
  };
}
