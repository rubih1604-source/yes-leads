/**
 * ============================================================
 *  האם ההודעה באמת יצאה
 * ============================================================
 *
 *  **הבאג שזה מתקן, במילים שלך:**
 *  "אני משנה סטטוס לנשלחה הצעת מחיר, המערכת מראה שההודעה
 *  נשלחה, אני נכנס לצ'אט - והלקוח בכלל לא קיבל."
 *
 *  **הסיבה.** המערכת קבעה "נשלח" לפי קוד ה-HTTP בלבד:
 *
 *      status: result.ok ? "sent" : "failed"
 *
 *  ו-`ok` פירושו 200 מטקסטר, כלומר **"קיבלתי את הבקשה"** -
 *  ולא "ההודעה הגיעה ללקוח". טקסטר מחזירה בגוף התשובה שדה
 *  `success`, והקוד פשוט לא קרא אותו. תשובה של
 *  `200 {success: false}` נרשמה אצלנו כהצלחה מלאה.
 *
 *  **ומעבר לזה:** גם `success: true` אמיתי אינו מסירה. הוא
 *  אומר שטקסטר קיבלה את ההודעה לתור. מה שקורה אחר ככ -
 *  תבנית שמטא השהתה, מספר שאינו בוואטסאפ, חסימה - קורה
 *  **אחרי** התשובה הזו.
 *
 *  לכן יש כאן שלושה מצבים ולא שניים, והמילה "נשלח" כבר לא
 *  בשימוש:
 *
 *    failed    - ידוע שלא יצאה
 *    accepted  - טקסטר קיבלה. **לא יודעים אם הגיעה.**
 *    delivered - וואטסאפ אישרה מסירה. רק זה "הגיע ללקוח".
 *
 *  מודול טהור - בלי מסד ובלי רשת - כדי שההכרעה הזו תיבדק.
 */

/** המצבים שהודעה יוצאת יכולה להיות בהם */
export const SENT_TO_TEXTER = "accepted";
export const DELIVERED = "delivered";
export const READ = "read";
export const FAILED = "failed";

/**
 * "sent" הוא המצב ההיסטורי. שורות שנרשמו לפניכן נשארות
 * איתו, והוא נקרא כ"נמסר לטקסטר" - כלומר בדיוק מה שהוא
 * באמת היה, גם אם הוצג אחרת.
 */
export const LEGACY_SENT = "sent";

export type SendState = "failed" | "accepted";

export type SendJudgement = {
  state: SendState;
  /** מה בדיוק קרה - נשמר על ההודעה ומוצג לך */
  reason: string | null;
};

type Raw = unknown;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** טקסט שגיאה מתוך תשובה, בכמה מבנים אפשריים */
function errorText(raw: Raw): string | null {
  const root = asObject(raw);
  if (!root) return null;

  for (const key of ["error", "message", "errorMessage", "reason", "detail"]) {
    const value = root[key];
    if (typeof value === "string" && value.trim()) return value.trim();

    const nested = asObject(value);
    if (nested) {
      const inner = nested.message ?? nested.error ?? nested.detail;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    }
  }

  const errors = root.errors;
  if (Array.isArray(errors) && errors.length) {
    const first = errors[0];
    if (typeof first === "string") return first;
    const obj = asObject(first);
    const message = obj?.message ?? obj?.error;
    if (typeof message === "string") return message;
  }

  return null;
}

/**
 * ההכרעה היחידה במערכת על תשובת שליחה.
 *
 * **מחמירה בכוונה.** בספק - נכשל. הודעה שנרשמה ככשל ובעצם
 * יצאה היא אי-נוחות; הודעה שנרשמה כהצלחה ולא יצאה היא
 * לקוח שמחכה לתשובה שלא תגיע, ואתה לא יודע.
 */
export function judgeSend(result: {
  ok: boolean;
  status: number;
  raw?: Raw;
  error?: string | null;
}): SendJudgement {
  if (!result.ok) {
    const detail = errorText(result.raw);
    return {
      state: "failed",
      reason: detail
        ? `טקסטר החזירה ${result.status}: ${detail}`.slice(0, 400)
        : (result.error ?? `טקסטר החזירה ${result.status}`).slice(0, 400),
    };
  }

  const root = asObject(result.raw);

  /**
   * **השדה שלא נקרא.** טקסטר מחזירה 200 עם success: false
   * כשהיא דוחה את ההודעה, וזה נרשם אצלנו כנשלח.
   */
  if (root && root.success === false) {
    const detail = errorText(root);
    return {
      state: "failed",
      reason: `טקסטר דחתה את ההודעה${detail ? `: ${detail}` : ""}`.slice(
        0,
        400
      ),
    };
  }

  /** 200 עם גוף שהוא בעצם שגיאה */
  if (root && !("success" in root) && errorText(root)) {
    return {
      state: "failed",
      reason: `טקסטר החזירה שגיאה: ${errorText(root)}`.slice(0, 400),
    };
  }

  return { state: "accepted", reason: null };
}

/* ============================================================
 *  איך מציגים את זה לך
 * ============================================================ */

/**
 * **הניסוח הוא העיקר כאן.**
 *
 * "נשלח" הוא בדיוק מה שהטעה: הוא נשמע כמו "הלקוח קיבל".
 * כל מצב אומר עכשיו את מה שידוע עליו באמת, ולא יותר.
 */
export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case DELIVERED:
      return "נמסר ללקוח";
    case READ:
      return "נקרא";
    case FAILED:
      return "נכשל";
    case SENT_TO_TEXTER:
    case LEGACY_SENT:
      return "יצא לטקסטר";
    case "received":
      return "התקבל";
    default:
      return status ?? "";
  }
}

/** האם ידוע בוודאות שההודעה הגיעה ללקוח */
export function reachedCustomer(status: string | null | undefined): boolean {
  return status === DELIVERED || status === READ;
}

/** האם ההודעה יצאה ולא נכשלה - כולל מצב שאינו ידוע */
export function notFailed(status: string | null | undefined): boolean {
  return status !== FAILED;
}

/* ============================================================
 *  עדכוני מסירה שמגיעים מטקסטר
 * ============================================================ */

/**
 * זיהוי עדכון מסירה בתוך אירוע של טקסטר.
 *
 * **למה לפי צורה ולא לפי שם אירוע אחד.** לא ידוע לנו
 * בוודאות באילו שמות טקסטר משתמשת, ושם שגוי אחד פירושו
 * שאף אישור מסירה לא ייקלט - כלומר נישאר בדיוק עם הבעיה
 * שאנחנו מתקנים. לכן מזהים לפי מה שיש באירוע: מזהה הודעה
 * ומילת מצב.
 */
export type DeliveryUpdate = {
  messageId: string;
  status: typeof DELIVERED | typeof READ | typeof FAILED;
  reason: string | null;
  /**
   * הטלפון שההודעה נשלחה אליו, אם הופיע באירוע.
   *
   * **גיבוי לזיהוי.** מזהה ההודעה שטקסטר שולחת בעדכון
   * אינו בהכרח המזהה ששמרנו בשליחה. בלי גיבוי, אי-התאמה
   * אחת פירושה שאף אישור מסירה לא נקלט - ושוב לא נדע
   * אם ההודעות מגיעות.
   */
  phone: string | null;
};

/**
 * **"received" הוסר מכאן בכוונה.** הודעה נכנסת רגילה
 * נושאת מזהה, ולעתים גם שדה status בערך כזה. אילו היא
 * הייתה נקראת כעדכון מסירה, **כל הודעה נכנסת הייתה
 * מדולגת** - הבוט היה מת לגמרי. מסוכן הרבה יותר מאשר
 * לפספס אישור מסירה.
 */
const DELIVERED_WORDS = /^(delivered|deliver|sent_to_device)$/i;
const READ_WORDS = /^(read|seen|opened)$/i;
const FAILED_WORDS = /^(failed|failure|error|undelivered|rejected|blocked)$/i;

function deepFind(
  obj: unknown,
  keys: string[],
  depth = 0
): string | null {
  if (depth > 6) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepFind(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = asObject(obj);
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  for (const value of Object.values(record)) {
    const found = deepFind(value, keys, depth + 1);
    if (found) return found;
  }

  return null;
}

/**
 * שם האירוע חייב להעיד על מסירה.
 *
 * **זה המעקה.** בלעדיו הזיהוי לפי צורה בלבד היה עלול
 * לבלוע הודעה נכנסת רגילה ולדלג עליה. אם טקסטר משתמשת
 * בשם שלא מופיע כאן - נפסיד אישורי מסירה, וזה בסדר:
 * השעון שמסמן הודעות שלא אושרו ייתן את ההתרעה. לבלוע
 * הודעה נכנסת זה לאבד לקוח.
 */
const STATUS_EVENT = /status|deliver|delivery|receipt|\back\b|messageState/i;

/**
 * ============================================================
 *  הקוד המספרי של טקסטר
 * ============================================================
 *
 *  **מה שהתברר מהתמיכה שלהם:** הם שולחים
 *  `messageStatus: 2` - **מספר, לא מילה**. הקוד כאן חיפש
 *  "delivered" ו-"failed" כטקסט, ולכן התעלם מזה לחלוטין:
 *  אישורי המסירה הגיעו, ואף אחד לא קרא אותם.
 *
 *  הסולם הוא הסולם המקובל של וואטסאפ:
 *
 *    -1  נכשל
 *     0  ממתין בתור
 *     1  הגיע לשרת של וואטסאפ - **עדיין לא ללקוח**
 *     2  נמסר למכשיר של הלקוח
 *     3  נקרא
 *     4  הושמע (הודעה קולית) - נחשב נקרא
 *
 *  **0 ו-1 לא משנים כלום בכוונה.** הם אומרים בדיוק מה
 *  שכבר ידענו - שטקסטר קיבלה את ההודעה - ולכן אין סיבה
 *  לגעת בשורה. רק 2 ומעלה הם "הגיע ללקוח".
 */
function fromNumericStatus(
  raw: string
): typeof DELIVERED | typeof READ | typeof FAILED | null {
  if (!/^-?\d+$/.test(raw)) return null;

  const code = Number(raw);

  if (code < 0) return FAILED;
  if (code >= 4) return READ;
  if (code === 3) return READ;
  if (code === 2) return DELIVERED;

  /** 0 ו-1 - אין מידע חדש */
  return null;
}

/** האם זו בכלל הודעה עם תוכן - כלומר לא עדכון מסירה */
function looksLikeMessage(root: Record<string, unknown>): boolean {
  const text = deepFind(root, ["text", "body", "caption", "content"]);
  return Boolean(text);
}

/** שדות שקיומם מעיד על עדכון מצב, ולא על הודעה */
const EXPLICIT_STATUS_KEYS = ["messageStatus", "deliveryStatus", "ack"];

export function readDeliveryUpdate(payload: unknown): DeliveryUpdate | null {
  const root = asObject(payload);
  if (!root) return null;

  const eventName =
    deepFind(root, ["eventName", "event", "type", "topic"]) ?? "";

  /**
   * **הודעה נכנסת לעולם לא נקראת כעדכון מסירה.**
   *
   * זה המעקה שמגן על כל הבוט: אם אירוע של הודעה מלקוח
   * ייתפס כאן, הוובוק יחזיר תשובה ויצא - וכל הודעה
   * מלקוח תדולג בשקט.
   */
  if (/incoming/i.test(eventName)) return null;

  /**
   * שדה מצב מפורש מספיק בפני עצמו.
   *
   * **למה זה נוסף.** טקסטר שולחת את העדכון כחלק מאירוע
   * על הודעה יוצאת, ולא באירוע ששמו "status". דרישה לשם
   * אירוע בלבד הייתה דוחה את כל האישורים שלהם - כלומר
   * משאירה אותנו בדיוק עם הבעיה שאנחנו מתקנים.
   */
  const explicit = EXPLICIT_STATUS_KEYS.some(
    (key) => deepFind(root, [key]) !== null
  );

  if (!explicit) {
    if (!STATUS_EVENT.test(eventName)) return null;

    /** בלי שדה מצב מפורש, אירוע שנושא טקסט הוא הודעה */
    if (looksLikeMessage(root)) return null;
  }

  const messageId = deepFind(root, [
    "messageId",
    "message_id",
    "externalMessageId",
    "waMessageId",
    "id",
  ]);

  if (!messageId) return null;

  /** המפורשים נבדקים ראשונים, כדי שלא ייגבר עליהם שדה כללי */
  const rawStatus = deepFind(root, [
    "messageStatus",
    "deliveryStatus",
    "ack",
    "status",
    "state",
  ]);

  if (!rawStatus) return null;

  /* ---------- קוד מספרי, כמו שטקסטר שולחת ---------- */
  const numeric = fromNumericStatus(rawStatus);

  const phone = deepFind(root, ["channelId", "to", "recipient", "phone", "id"]);

  /** רק מה שנראה כמו מספר בינלאומי, ולא כל מזהה */
  const asPhone = phone && /^\d{9,15}$/.test(phone) ? phone : null;

  if (numeric) {
    return {
      messageId,
      phone: asPhone,
      status: numeric,
      reason:
        numeric === FAILED
          ? (errorText(root) ??
            deepFind(root, ["error", "errorMessage", "reason", "detail"]) ??
            `וואטסאפ דיווחה שההודעה נכשלה (קוד ${rawStatus})`)
          : null,
    };
  }

  /** מספר שלא אומר כלום חדש - 0 או 1 */
  if (/^-?\d+$/.test(rawStatus)) return null;

  if (FAILED_WORDS.test(rawStatus)) {
    /**
     * הסיבה יושבת בעומק האירוע ולא בשורש שלו, ולכן
     * החיפוש כאן עמוק. בלי זה היה נרשם "נכשל" בלי לומר
     * למה - וזה לא עוזר לך יותר מ"נשלח" שקרי.
     */
    const reason =
      errorText(root) ??
      deepFind(root, ["error", "errorMessage", "reason", "message", "detail"]);

    return {
      messageId,
      phone: asPhone,
      status: FAILED,
      reason: reason ?? "וואטסאפ דיווחה שההודעה נכשלה",
    };
  }

  if (READ_WORDS.test(rawStatus)) {
    return { messageId, phone: asPhone, status: READ, reason: null };
  }

  if (DELIVERED_WORDS.test(rawStatus)) {
    return { messageId, phone: asPhone, status: DELIVERED, reason: null };
  }

  return null;
}
