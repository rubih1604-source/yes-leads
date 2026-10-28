/**
 * ============================================================
 *  פיצול שם לשם פרטי ושם משפחה
 * ============================================================
 *
 *  **הבאג שזה מתקן: "יאיר סרוסי סרוסי".**
 *
 *  הטופס שולח שני שדות שחופפים - שם מלא ושם משפחה:
 *
 *      full_name:  "יאיר סרוסי"
 *      last_name:  "סרוסי"
 *
 *  המיפוי לקח את השם המלא כ**שם פרטי**, ואת שם המשפחה
 *  כשם משפחה. התצוגה מחברת את השניים, ויצא השם פעמיים.
 *
 *  זה גם מה שראית אצל הקונה: full_name "אורנה לוי לוי".
 *
 *  היה כאן פיצול בשני מקומות נפרדים - אחד בזיהוי השדות
 *  ואחד במיפוי של ליד מנגר. עכשיו יש אחד, כאן, ושניהם
 *  קוראים לו. כלל פיצול שחי בשני מקומות הוא כלל שיתפצל
 *  שוב בפעם הבאה שמישהו יתקן רק אחד מהם.
 */

export type NameParts = {
  firstName: string | null;
  lastName: string | null;
};

/** רווחים כפולים, רווחים בקצוות, ושורות - לצורה אחת */
function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * מסיר את שם המשפחה מסוף השם הפרטי.
 *
 * ההסרה היא על גבול מילה בלבד: "דני" ו"ני" לא מצטמצמים,
 * ו"אבי רוזן" עם משפחה "רוזנברג" נשאר כמו שהוא.
 *
 * בלולאה, כי ליד שנשמר כבר פעמיים שבור ("יאיר סרוסי
 * סרוסי") צריך להתנקות עד הסוף.
 */
function stripRepeatedSurname(first: string, last: string): string {
  let out = first;

  // זהים לגמרי - אין מה להסיר, זה פשוט השם
  while (out !== last && out.endsWith(` ${last}`)) {
    const rest = out.slice(0, -(last.length + 1)).trim();

    // הסרה שמרוקנת את השם הפרטי היא הסרה שגויה
    if (!rest) break;

    out = rest;
  }

  return out;
}

/**
 * ההכרעה היחידה במערכת על שם פרטי ומשפחה.
 *
 * שם פרטי מפורש תמיד גובר: אם הטופס אמר "שם פרטי", לא
 * מנחשים מתוך השם המלא.
 */
export function splitName(input: {
  full?: string | null;
  first?: string | null;
  last?: string | null;
}): NameParts {
  const full = clean(input.full);
  let first = clean(input.first);
  let last = clean(input.last);

  /**
   * אין שם פרטי מפורש - מפצלים את השם המלא.
   *
   * המילה הראשונה היא השם הפרטי, והשאר שם המשפחה. זה לא
   * מושלם עבור "בן דוד", אבל זו ההתנהגות שהמערכת מתנהגת
   * לפיה מאז ומתמיד, ואין בטופס מידע שיכריע אחרת.
   */
  if (!first && full) {
    const parts = full.split(" ");
    first = parts[0];
    if (!last && parts.length > 1) last = parts.slice(1).join(" ");
  }

  if (first && last) first = stripRepeatedSurname(first, last);

  return {
    firstName: first || null,
    lastName: last || null,
  };
}

/**
 * השם כפי שהוא מוצג ונשלח לקונה.
 *
 * אותה הרכבה שהתצוגה והמטען עושים, במקום אחד - כדי
 * שבדיקה על כפילות תבדוק את מה שבאמת יוצא.
 */
export function joinName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return clean(`${firstName ?? ""} ${lastName ?? ""}`);
}

/**
 * האם השם השמור שבור - שם המשפחה מופיע בו פעמיים.
 *
 * משמש גם את פעולת התחזוקה שמתקנת לידים שכבר נשמרו כך.
 */
export function hasRepeatedSurname(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): boolean {
  const first = clean(firstName);
  const last = clean(lastName);

  if (!first || !last) return false;

  return stripRepeatedSurname(first, last) !== first;
}
