/**
 * ============================================================
 *  מי ענה אחרי דיוור
 * ============================================================
 *
 *  **למה אין כאן בוט חדש.**
 *
 *  הבוט כבר מסווג כל הודעה נכנסת, והדיוור כבר רושם בכרטיס
 *  הליד שנשלחה אליו הודעה. כל המידע קיים - מה שחסר היה
 *  רק לחבר בין השניים ולשאול: "מי קיבל דיוור, ואז ענה?"
 *
 *  לכן זו שאילתה על מה שכבר נרשם, ולא מנגנון שני שרץ לצד
 *  הקיים ומחזיק רשימה משלו שתצא מסנכרון.
 *
 *  הקובץ טהור - החלוקה עצמה מכוסה בבדיקות, כי מסך שמפספס
 *  מי שענה הוא מסך שמאבד לידים חמים.
 */

/** כמה זמן אחרי דיוור תגובה עדיין נחשבת תגובה לדיוור */
export const REPLY_WINDOW_DAYS = 30;

export type MessageLike = {
  direction: string;
  /** סימון מפורש שההודעה נשלחה כדיוור */
  broadcast?: boolean | null;
  /** "data" - רשימה שנטענה · "leads" - לידים שלך או מבצע */
  broadcastKind?: string | null;
  /** שם התבנית - קיים רק בהודעות יוצאות */
  templateName?: string | null;
  bodyText?: string | null;
  createdAt: Date;
};

/**
 * האם ההודעה היוצאת הזו היא דיוור.
 *
 * **הסימון המפורש קובע.** קודם ההיכר היה "האם הטקסט מתחיל
 * ב'דיוור:'" - וזה תפס רק דיוור מרשימה שנטענה. דיוור
 * מרשימת הלידים ודיוור מבצע יוצאים כתבנית רגילה, הטקסט
 * שלהם הוא תוכן ההודעה, והם פשוט לא נספרו כדיוור.
 *
 * בדיקת הטקסט נשארה כגיבוי בלבד, בשביל הודעות שנרשמו
 * לפני שהסימון קיים - כדי שההיסטוריה לא תיעלם מהמסך.
 */
export function isBroadcastMessage(message: MessageLike): boolean {
  if (message.direction !== "out") return false;
  if (message.broadcastKind) return true;
  if (message.broadcast === true) return true;
  return (message.bodyText ?? "").startsWith("דיוור:");
}

/**
 * שם הדיוור לתצוגה.
 *
 * "דיוור: רשימת אוקטובר" -> "רשימת אוקטובר".
 * דיוור שיצא כתבנית רגילה -> שם התבנית, כי הטקסט שלו הוא
 * תוכן ההודעה ולא שם הרשימה.
 */
function labelOf(message: MessageLike): string {
  const body = (message.bodyText ?? "").trim();

  if (body.startsWith("דיוור:")) {
    const name = body.replace(/^דיוור:\s*/, "").trim();
    if (name) return name;
  }

  return message.templateName || "דיוור";
}

export type ReplyWindow = {
  /** מתי נשלח הדיוור האחרון */
  broadcastAt: Date;
  /** מה נשלח */
  broadcastLabel: string;
  /** מתי הוא ענה */
  repliedAt: Date;
  /** מה הוא ענה */
  replyText: string;
};

/**
 * מוצא את התגובה הראשונה שאחרי דיוור.
 *
 * מחזיר null אם לא קיבל דיוור, או אם ענה רק **לפני**
 * הדיוור - תגובה ישנה אינה התעניינות בדיוור הנוכחי.
 */
export function replyAfterBroadcast(
  messages: MessageLike[],
  now: Date,
  windowDays = REPLY_WINDOW_DAYS
): ReplyWindow | null {
  const sorted = [...messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const broadcasts = sorted.filter(isBroadcastMessage);
  if (broadcasts.length === 0) return null;

  const last = broadcasts[broadcasts.length - 1];

  const cutoff = new Date(
    last.createdAt.getTime() + windowDays * 24 * 60 * 60 * 1000
  );

  /**
   * התגובה חייבת להיות **אחרי** הדיוור ובתוך החלון.
   *
   * וגם לא בעתיד ביחס לעכשיו - שעון שקפץ לא אמור להכניס
   * אנשים לרשימה.
   */
  const reply = sorted.find(
    (m) =>
      m.direction === "in" &&
      m.createdAt > last.createdAt &&
      m.createdAt <= cutoff &&
      m.createdAt <= now
  );

  if (!reply) return null;

  return {
    broadcastAt: last.createdAt,
    broadcastLabel: labelOf(last),
    repliedAt: reply.createdAt,
    replyText: (reply.bodyText ?? "").slice(0, 300),
  };
}

/**
 * כמה זמן לקח לו לענות - לתצוגה.
 *
 * תגובה תוך שעה היא לקוח חם; תגובה אחרי שבוע היא משהו
 * אחר לגמרי, וכדאי שתראה את ההבדל בלי לחשב בראש.
 */
export function replyDelayLabel(window: ReplyWindow): string {
  const ms = window.repliedAt.getTime() - window.broadcastAt.getTime();
  const minutes = Math.round(ms / 60000);

  if (minutes < 60) return `${Math.max(1, minutes)} דק'`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} שע'`;

  const days = Math.round(hours / 24);
  return `${days} ימים`;
}

/**
 * ============================================================
 *  סדר הרשימה במסך
 * ============================================================
 *
 *  **מי שענה שהוא כבר לקוח יורד לסוף.** אין לו מה לקנות,
 *  והוא כבר קיבל הפניה ל-*2080. הוא נשאר במסך כדי שתראה
 *  את התמונה המלאה של הדיוור, אבל הוא לא תופס את ראש
 *  הרשימה במקום מי שמחכה לשיחה.
 *
 *  בתוך כל קבוצה - התגובה האחרונה קודם.
 */
export type RankedReply = {
  status: string;
  window: ReplyWindow;
};

export function isExistingCustomerStatus(status: string): boolean {
  return status.trim() === "לקוח קיים";
}

export function sortReplies<T extends RankedReply>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aEnd = isExistingCustomerStatus(a.status) ? 1 : 0;
    const bEnd = isExistingCustomerStatus(b.status) ? 1 : 0;

    if (aEnd !== bEnd) return aEnd - bEnd;

    return b.window.repliedAt.getTime() - a.window.repliedAt.getTime();
  });
}
