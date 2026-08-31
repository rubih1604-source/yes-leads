/**
 * ============================================================
 *  זיהוי לקוח קיים
 * ============================================================
 *
 *  **הכלל היחיד: שאלת הספק בטופס.**
 *
 *  ליד הוא לקוח קיים אם ורק אם בשאלת הספק כתוב
 *  yes / sting / Yes / Sting / יס / סטינג.
 *
 *  ------------------------------------------------------------
 *  אזהרה למי שיערוך את הקובץ הזה בעתיד:
 *
 *  אסור לסרוק שדות אחרים. שמות הקמפיינים, העמודים והטפסים
 *  של העסק מכילים את המילה yes כמעט תמיד - "מצטרפים ל-yes",
 *  "yes גיאוגרפי" וכו'. סריקה רחבה מסמנת כמעט כל ליד
 *  כלקוח קיים. זה קרה, וזה שבר את כל הפילוחים.
 *  ------------------------------------------------------------
 */

/** רק שדות שהם באמת שאלת הספק */
const SUPPLIER_KEYS = [
  "supplier_question",
  "supplier",
  "ספק",
  "ספק נוכחי",
  "שאלת ספק",
  "חברה נוכחית",
  "current_provider",
  "provider",
];

/**
 * התשובה חייבת להיות המילה עצמה, לא חלק ממשפט ארוך.
 * "yes\\sting" נתפס. "מצטרפים ל-yes" לא רלוונטי כי
 * הוא לעולם לא יגיע משדה ספק.
 */
const YES_ANSWER = /(^|[\s,\/\\|+&·־-])(yes|sting|יס|סטינג)([\s,\/\\|+&·־-]|$)/i;

function supplierAnswerOf(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;

  const record = extra as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) continue;

    const normalized = key.trim().toLowerCase();
    const isSupplierField = SUPPLIER_KEYS.some(
      (k) => normalized === k.toLowerCase() || normalized.includes(k.toLowerCase())
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
 * הסטטוס נלקח בחשבון רק כדי שליד שסימנת ידנית לא ייעלם
 * מהספירה - אבל הוא לעולם לא הופך ליד לקיים מעצמו אם
 * שאלת הספק אומרת אחרת.
 */
export function isExistingCustomer(
  extra: unknown,
  status?: string | null
): boolean {
  const answer = supplierAnswerOf(extra);
  if (answer) return YES_ANSWER.test(answer);

  // אין שאלת ספק בכלל - נסמכים על מה שקבעת ידנית
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
