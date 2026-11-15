/**
 * ============================================================
 *  איך מוצאים ליד לפי טלפון, אחרי ההפרדה
 * ============================================================
 *
 *  **מה שהשתנה, ולמה זה קובץ בפני עצמו.**
 *
 *  עד כאן טלפון היה ייחודי במסד, ולכן `findUnique({ phone })`
 *  היה שאלה חד־משמעית: יש שורה אחת, והיא התשובה. מהרגע
 *  שהמפתח הוא **טלפון + ערוץ**, אותו מספר יכול להחזיר שתי
 *  שורות - אחת שלך ואחת של המכירה - ו"תביא לי את הליד"
 *  מפסיקה להיות שאלה שלמה. חייבים לומר **באיזה עולם**.
 *
 *  הקובץ הזה הוא המקום היחיד שעונה על זה, כדי ששמונה
 *  מקומות שונים במערכת לא יענו שמונה תשובות שונות - זה
 *  בדיוק מה שגרם לליד להיעלם.
 *
 *  **ברירת המחדל היא שלך.** כל מה שאינו קליטה של כניסה -
 *  הודעת וואטסאפ נכנסת, רשימה שחורה, דיוור, בוט - נוגע
 *  בעולם שלך בלבד. מה שקורה אצל המכירה לא נוגע בך, וגם
 *  ההפך: הודעה שנכנסת לא "תופסת" ליד של המכירה ולא
 *  מפעילה עליו אוטומציות שלך.
 */

import { MINE_CHANNEL, SALE_CHANNEL, type Channel } from "./channel";

/**
 * ============================================================
 *  תנאי החיפוש: טלפון **וגם** ערוץ, תמיד שניהם
 * ============================================================
 *
 *  **למה זה תנאי רגיל ולא מפתח של פריזמה.**
 *
 *  הייחודיות של טלפון+ערוץ נאכפת על המסד ישירות ולא דרך
 *  `@@unique` בסכימה - ראה את ההסבר המלא ב-`lead-index.ts`
 *  (בקצרה: `db push` מסרב ליצור אינדקס ייחודי חדש בלי דגל
 *  מסוכן שנשאר בפקודת הבנייה לתמיד). פריזמה לא יודעת שזה
 *  מפתח, ולכן משתמשים ב-`findFirst` עם התנאי הזה.
 *
 *  ההגנה במסד זהה לחלוטין. מה שמשתנה זו רק המילה שבה
 *  קוראים לה בקוד.
 *
 *  חישוב טהור, בלי מסד - כדי שהבדיקות יוכלו לאמת את הצורה
 *  בלי להתקין את הלקוח של פריזמה.
 */
export function phoneChannel(phone: string, channel: Channel) {
  return { phone, channel };
}

/** המפתח של הליד שלך */
export function mineKey(phone: string) {
  return phoneChannel(phone, MINE_CHANNEL);
}

/** המפתח של הליד של המכירה */
export function saleKey(phone: string) {
  return phoneChannel(phone, SALE_CHANNEL);
}

/**
 * הליד בערוץ מסוים. אין כאן ניחוש ואין נפילה לערוץ השני:
 * מי ששואל על ערוץ מקבל תשובה על אותו ערוץ בלבד.
 */
export async function leadInChannel<T = { id: string }>(
  phone: string,
  channel: Channel,
  select?: Record<string, boolean>
): Promise<T | null> {
  const { db } = await import("./db");

  const args: Record<string, unknown> = {
    where: phoneChannel(phone, channel),
  };

  if (select) args.select = select;

  return (await (db.lead.findFirst as (a: unknown) => Promise<unknown>)(args)
    .catch(() => null)) as T | null;
}

/** הליד שלך. זו הברירה כמעט בכל מקום במערכת */
export async function myLead<T = { id: string }>(
  phone: string,
  select?: Record<string, boolean>
): Promise<T | null> {
  return leadInChannel<T>(phone, MINE_CHANNEL, select);
}

/**
 * כל השורות של המספר, בשני הערוצים.
 *
 * זה לא כלי עבודה יומיומי - הוא קיים לאבחון ולרשימה
 * השחורה, ששתיהן באמת צריכות לראות את התמונה המלאה.
 */
export async function allLeadsForPhone<T = { id: string }>(
  phone: string,
  select?: Record<string, boolean>
): Promise<T[]> {
  const { db } = await import("./db");

  const args: Record<string, unknown> = {
    where: { phone },
    /** "mine" לפני "sale" - סדר יציב ולא אקראי */
    orderBy: { channel: "asc" },
  };

  if (select) args.select = select;

  return (await (db.lead.findMany as (a: unknown) => Promise<unknown>)(args)
    .catch(() => [])) as T[];
}
