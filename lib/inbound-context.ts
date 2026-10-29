/**
 * ============================================================
 *  מה ההודעה הזו, ומה צריך לקרות איתה
 * ============================================================
 *
 *  **למה הקובץ הזה קיים.**
 *
 *  עד כה כל חלק במערכת הכריע לבד: הבוט בדק אם זו תגובה
 *  לדיוור, המסך בדק משהו דומה, והדיוור סימן הודעות בלי
 *  לדעת מי יקרא את הסימון. כל אחד ראה חוט אחד ולא את
 *  השרשרת - ולכן יצא שלקוח שקיבל הצעת מחיר בשבוע שעבר
 *  נשאל "האם אתה לקוח קיים של yes?".
 *
 *  כאן ההכרעה נעשית **פעם אחת**, ממקום שרואה את כל התמונה:
 *  מאיפה האדם הגיע, מה נשלח אליו, ומי הוא ביחס אליך.
 *  הבוט לא מחליט - הוא מבצע את מה שנקבע כאן.
 *
 *  טהור בכוונה: בלי מסד ובלי רשת, כדי שההכרעה שמנווטת
 *  לקוחות תהיה מכוסה בבדיקות.
 */

import {
  isBroadcastMessage,
  replyAfterBroadcast,
  type MessageLike,
  type ReplyWindow,
} from "./broadcast-replies";

/** דיוור לדאטה שנטענה - אנשים שאיננו מכירים */
export const KIND_DATA = "data";

/** דיוור ללידים שלך לפי סטטוס, או מבצע */
export const KIND_LEADS = "leads";

export type InboundDecision = {
  /** האם זו תגובה לדיוור כלשהו - מה שמכניס למסך ההתעניינות */
  isBroadcastReply: boolean;
  /** האם מותר לשאול את שאלת הסינון */
  askSupplier: boolean;
  /** החלון עצמו, אם זו תגובה לדיוור */
  window: ReplyWindow | null;
  /** למה הוחלט ככה - נרשם ומוצג באבחון */
  reason: string;
};

export type InboundInput = {
  /** כל ההודעות של הליד, בכל סדר */
  messages: MessageLike[];
  /** הבעלות של הליד */
  origin: string;
  /** האם כבר נשאל בעבר */
  alreadyAsked: boolean;
  /** האם הוא ברשימה השחורה */
  blacklisted: boolean;
  now: Date;
};

/**
 * סוג הדיוור האחרון שנשלח אליו.
 *
 * שורות שנרשמו לפני שהשדה קיים נושאות רק את הסימון
 * הבוליאני. הן נחשבות "leads" - השמרני מבין השניים, כי
 * שאלת סינון שנשלחת בטעות ללקוח אמיתי מזיקה, ואילו שאלה
 * שלא נשלחה סתם לא נשלחה.
 */
export function lastBroadcastKind(messages: MessageLike[]): string | null {
  const broadcasts = messages
    .filter(isBroadcastMessage)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const last = broadcasts[broadcasts.length - 1];
  if (!last) return null;

  if (last.broadcastKind === KIND_DATA) return KIND_DATA;
  if (last.broadcastKind === KIND_LEADS) return KIND_LEADS;

  return KIND_LEADS;
}

/**
 * ההכרעה היחידה על הודעה נכנסת.
 */
export function decideInbound(input: InboundInput): InboundDecision {
  const window = replyAfterBroadcast(input.messages, input.now);

  if (!window) {
    return {
      isBroadcastReply: false,
      askSupplier: false,
      window: null,
      reason: "לא תגובה לדיוור",
    };
  }

  const kind = lastBroadcastKind(input.messages);

  if (input.blacklisted) {
    return {
      isBroadcastReply: true,
      askSupplier: false,
      window,
      reason: "ברשימה השחורה - לא פונים אליו",
    };
  }

  if (input.alreadyAsked) {
    return {
      isBroadcastReply: true,
      askSupplier: false,
      window,
      reason: "שאלת הסינון כבר נשלחה אליו",
    };
  }

  /**
   * **הכלל שחסר והזיק.**
   *
   * דיוור ללידים שלך נשלח לפי סטטוס - כלומר לאנשים שכבר
   * דיברת איתם, שיש להם היסטוריה, ושחלקם קיבלו ממך הצעת
   * מחיר. לשאול אותם "האם אתם לקוחות yes?" זה לגלות
   * שאינך זוכר מי הם.
   *
   * השאלה נועדה לדאטה שנטענה מקובץ - אנשים שבאמת איננו
   * יודעים עליהם כלום.
   */
  if (kind !== KIND_DATA) {
    return {
      isBroadcastReply: true,
      askSupplier: false,
      window,
      reason:
        "דיוור ללידים שלך - הוא כבר מוכר לך, ולכן לא נשאלת שאלת סינון",
    };
  }

  return {
    isBroadcastReply: true,
    askSupplier: true,
    window,
    reason: "תגובה לדיוור מדאטה שנטענה",
  };
}
