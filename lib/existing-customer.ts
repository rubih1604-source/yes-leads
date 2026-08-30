/**
 * ============================================================
 *  זיהוי לקוח קיים - מקור אמת אחד
 * ============================================================
 *
 *  הבעיה שהייתה: כל מסך ספר אחרת. מסך הלידים בדק רק את
 *  הסטטוס, מכירת לידים בדקה גם את שאלת הספק, והדוחות בדקו
 *  משהו שלישי. לכן אותו קמפיין הראה 12 במקום 14.
 *
 *  מהיום כל המערכת קוראת מכאן.
 *
 *  ליד נחשב לקוח קיים אם אחד מאלה נכון:
 *   1. הסטטוס שלו הוא "לקוח קיים"
 *   2. שדה שאלת הספק מכיל yes / סטינג / sting / יס
 *   3. כל שדה אחר שהגיע מהטופס או מקובץ מכיל תשובה כזו
 *
 *  התנאי השלישי חשוב: קבצי CSV מגיעים עם שמות עמודות שונים
 *  בכל פעם, ואי אפשר להסתמך על שם השדה.
 */

/**
 * התשובה חייבת להיות מילה עומדת בפני עצמה.
 * "הוט" לא ייתפס, "yes\\sting" כן, "אין לי yes" כן.
 */
const YES_ANSWER =
  /(^|[\s,\/\\|+&·-])(yes|סטינג|sting|יס)([\s,\/\\|+&·-]|$)/i;

/** שדות שאסור לסרוק - הם מכילים טקסט חופשי שעלול להטעות */
const SKIP_KEYS = /server_response|api|fb_leadid|note|comment|הערה|תגובת/i;

export function isExistingCustomer(
  extra: unknown,
  status?: string | null
): boolean {
  if (status && status.includes("לקוח קיים")) return true;

  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;

  const record = extra as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (SKIP_KEYS.test(key)) continue;
    if (YES_ANSWER.test(value)) return true;
  }

  return false;
}

/** מה בדיוק גרם לזיהוי - לצורך אבחון */
export function existingCustomerReason(
  extra: unknown,
  status?: string | null
): string | null {
  if (status && status.includes("לקוח קיים")) return "לפי הסטטוס";

  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;

  const record = extra as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (SKIP_KEYS.test(key)) continue;
    if (YES_ANSWER.test(value)) return `${key}: ${value}`;
  }

  return null;
}
