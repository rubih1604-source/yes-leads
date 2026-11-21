/**
 * ============================================================
 *  לכל קריאה החוצה יש תקרת זמן. בלי יוצא מן הכלל.
 * ============================================================
 *
 *  **הכשל שזה סוגר, וזה היה כשל שהשתיק את כל המערכת.**
 *
 *  `fetch` בלי תקרת זמן לא נכשל - הוא **תלוי לנצח**.
 *  השרת השני לא עונה ולא סוגר, וההבטחה פשוט לא נפתרת.
 *  אין שגיאה, אין לוג, אין התראה. כלום.
 *
 *  במנוע זה היה קטלני: המנוע מסמן "אני רץ" לפני שהוא
 *  מתחיל, ומוריד את הסימון ב-`finally`. קריאה תלויה =
 *  ה-`finally` לא מגיע לעולם = הסימון נשאר דלוק **לנצח**.
 *  מאותו רגע כל סבב חדש ראה "כבר רץ" ודילג.
 *
 *  התוצאה בשטח: שינית סטטוס לעשרות לידים, האוטומציה
 *  נרשמה כמו שצריך, ואף הודעה לא יצאה לאף אחד. המערכת
 *  נראתה תקינה לגמרי - כי שום דבר לא נכשל. הוא רק הפסיק
 *  לקרות.
 *
 *  מהיום: כל קריאה החוצה חייבת להיגמר. נגמר הזמן -
 *  מקבלים שגיאה אמיתית, והמערכת ממשיכה לנשום.
 */

/** ברירת מחדל: מספיק לרשת איטית, רחוק מלתקוע סבב */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * `fetch` שמובטח שייגמר.
 *
 * זורק שגיאה רגילה כשנגמר הזמן, כדי שכל `catch` קיים
 * יטפל בזה בדיוק כמו בכל כשל רשת אחר.
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {};
  const ms = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * שעון משלנו ולא רק `AbortSignal.timeout`.
   *
   * ככה אפשר לכבד גם `signal` שהקורא כבר העביר, בלי
   * לדרוס אותו - ובלי להסתמך על גרסת Node מסוימת.
   */
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), ms);

  const incoming = rest.signal;

  if (incoming) {
    if (incoming.aborted) controller.abort();
    else incoming.addEventListener("abort", () => controller.abort());
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted && !incoming?.aborted) {
      throw new Error(`לא התקבלה תשובה תוך ${Math.round(ms / 1000)} שניות`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
