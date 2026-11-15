/**
 * ============================================================
 *  העברת ליד בין הערוצים - דלת אחת, ועם בדיקת התנגשות
 * ============================================================
 *
 *  **למה זה קיים עכשיו ולא היה קיים קודם.**
 *
 *  כל עוד לכל טלפון הייתה שורה אחת, "להעביר ליד למכירה"
 *  היה פשוט לכתוב `origin: "sale"` על השורה. חמישה מקומות
 *  שונים במערכת עשו בדיוק את זה, כל אחד לבד.
 *
 *  מרגע שהמפתח הוא **טלפון + ערוץ**, כתיבה כזו היא שינוי
 *  של המפתח עצמו, ויש לה מצב שלא היה קיים קודם: ייתכן
 *  שלאותו אדם **כבר יש שורה בצד השני**. כתיבה עיוורת שם
 *  מפילה את הפעולה בשגיאת ייחודיות.
 *
 *  לכן יש כאן פונקציה אחת. היא בודקת קודם, ואם יש כבר
 *  שורה בצד השני היא **לא מפילה כלום** - היא מחזירה
 *  "כבר קיים שם" כדי שהמסך יוכל להגיד לך את זה בעברית
 *  במקום להיכשל בשקט.
 */

import { MINE_CHANNEL, SALE_CHANNEL, type Channel } from "./channel";

export type MoveResult = {
  moved: boolean;
  /** כבר היה בערוץ הזה - אין מה לעשות, וזו לא שגיאה */
  alreadyThere?: boolean;
  /** קיימת כבר שורה של אותו מספר בערוץ היעד */
  collision?: boolean;
  reason?: string;
};

/** ה-origin שתואם לערוץ. השניים נכתבים תמיד יחד */
export function originForChannel(channel: Channel): string {
  return channel === SALE_CHANNEL ? "sale" : "leadmanager";
}

/**
 * מעביר ליד לערוץ אחר.
 *
 * origin והערוץ נכתבים **באותה פעולה**, כדי ששדה אחד לא
 * יישאר מאחור ויסתור את השני - זה בדיוק סוג הסתירה שגרם
 * לליד להופיע במסך אחד ולא באחר.
 */
export async function moveLeadToChannel(
  leadId: string,
  target: Channel
): Promise<MoveResult> {
  const { db } = await import("./db");

  const lead = await db.lead
    .findUnique({
      where: { id: leadId },
      select: { id: true, phone: true, channel: true },
    })
    .catch(() => null);

  if (!lead) return { moved: false, reason: "הליד לא נמצא" };
  if (lead.channel === target) return { moved: false, alreadyThere: true };

  const taken = await db.lead
    .findFirst({
      where: { phone: lead.phone, channel: target },
      select: { id: true },
    })
    .catch(() => null);

  if (taken) {
    return {
      moved: false,
      collision: true,
      reason:
        target === SALE_CHANNEL
          ? "למספר הזה כבר יש ליד במכירה. שני הלידים נשארים כמו שהם."
          : "למספר הזה כבר יש ליד אצלך. שני הלידים נשארים כמו שהם.",
    };
  }

  const done = await db.lead
    .update({
      where: { id: leadId },
      data: { channel: target, origin: originForChannel(target) },
    })
    .catch(() => null);

  if (!done) return { moved: false, reason: "העדכון נכשל" };

  return { moved: true };
}

/** קיצור קריא לשני הכיוונים */
export function toSaleChannel(leadId: string) {
  return moveLeadToChannel(leadId, SALE_CHANNEL);
}

export function toMyChannel(leadId: string) {
  return moveLeadToChannel(leadId, MINE_CHANNEL);
}
