/**
 * ============================================================
 *  זיהוי לקוח קיים
 * ============================================================
 *
 *  **הכלל היחיד: שאלת הספק בטופס.**
 *
 *  אם בשאלת הספק מופיע yes / sting / יס / סטינג - בכל צורת
 *  כתיבה שהיא - הליד הוא לקוח קיים.
 *
 *  ------------------------------------------------------------
 *  אזהרה למי שיערוך את הקובץ הזה בעתיד:
 *
 *  אסור לסרוק שדות אחרים. שמות הקמפיינים, העמודים והטפסים
 *  של העסק מכילים את המילה yes כמעט תמיד - "מצטרפים ל-yes",
 *  "yes גיאוגרפי" וכו'. סריקה רחבה סימנה כמעט כל ליד
 *  כלקוח קיים ושברה את כל הפילוחים. זה קרה.
 *  ------------------------------------------------------------
 */

/** השדות שנחשבים שאלת ספק */
const SUPPLIER_KEYS = [
  "supplier_question",
  "supplier",
  "ספק",
  "ספק נוכחי",
  "שאלת ספק",
  "מי הספק",
  "חברה נוכחית",
  "חברת הכבלים",
  "current_provider",
  "provider",
  "company",
];

/**
 * המילה צריכה לעמוד בפני עצמה, אבל כל סימן מפריד מתקבל:
 * רווח, לוכסן, סוגריים, מקף, פסיק, כוכבית, מה שלא יהיה.
 *
 * הגבול נמדד מול אותיות ולא מול רשימת סימנים, כדי שלא
 * נצטרך לנחש איך בדיוק הלקוח כתב. "פיסיקה" לא נתפס כי
 * יס שם בתוך מילה, וכך גם "yesterday".
 */
const LETTER = "a-zA-Z\\u0590-\\u05FF";
const YES_ANSWER = new RegExp(
  `(^|[^${LETTER}])(yes|sting|יס|סטינג)([^${LETTER}]|$)`,
  "i"
);

function supplierAnswerOf(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;

  const record = extra as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) continue;

    const normalized = key.trim().toLowerCase();
    const isSupplierField = SUPPLIER_KEYS.some(
      (k) =>
        normalized === k.toLowerCase() || normalized.includes(k.toLowerCase())
    );

    if (isSupplierField) return value.trim();
  }

  return null;
}

/** התשובה בשאלת הספק, אם קיימת */
export function supplierAnswer(extra: unknown): string | null {
  return supplierAnswerOf(extra);
}

/**
 * האם הליד לקוח קיים.
 *
 * הסטטוס נלקח בחשבון רק כשאין שאלת ספק בכלל - כדי שליד
 * שסימנת ידנית לא ייעלם מהספירה. כשיש שאלת ספק, היא
 * קובעת ולא הסטטוס.
 */
export function isExistingCustomer(
  extra: unknown,
  status?: string | null
): boolean {
  const answer = supplierAnswerOf(extra);
  if (answer) return YES_ANSWER.test(answer);

  return status === "לקוח קיים";
}

/** מה בדיוק גרם לזיהוי - לאבחון */
export function existingCustomerReason(
  extra: unknown,
  status?: string | null
): string | null {
  const answer = supplierAnswerOf(extra);

  if (answer) {
    return YES_ANSWER.test(answer) ? `שאלת ספק: ${answer}` : null;
  }

  return status === "לקוח קיים" ? "סומן ידנית בסטטוס" : null;
}
