/**
 * ============================================================
 *  מה בדיוק נשלח לקונה
 * ============================================================
 *
 *  לוגיקה טהורה בלבד - בלי מסד ובלי רשת - כדי שאפשר יהיה
 *  לבדוק אותה. מה שנשלח לקונה הוא מה שהוא משלם עליו, ואסור
 *  שיהיה כאן ניחוש.
 *
 *  לכל קונה יכול להיות מבנה שדות משלו. אלעד מצפה ל-phone,
 *  ספק אחר מצפה ל-telephone. המיפוי הוא מה שמאפשר לחבר
 *  קונה חדש בלי לגעת בקוד - וזה גם מה שהופך את זה למשהו
 *  שאפשר למכור.
 */

export type DeliveryLead = {
  firstName: string | null;
  lastName: string | null;
  phone: string;
  extra: unknown;
  status: string;
};

/** השדות שהמערכת יודעת לשלוח, והתווית שלהם למסך */
export const DELIVERY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "full_name", label: "שם מלא" },
  { key: "first_name", label: "שם פרטי" },
  { key: "last_name", label: "שם משפחה" },
  { key: "phone", label: "טלפון" },
  { key: "email", label: 'דוא"ל' },
  { key: "address", label: "כתובת" },
  { key: "campaign", label: "קמפיין" },
  { key: "ad", label: "מודעה" },
  { key: "form", label: "טופס" },
  { key: "supplier_question", label: "ספק נוכחי" },
  { key: "fb_leadid", label: "מזהה ליד בפייסבוק" },
  { key: "created_at", label: "מועד הכניסה" },
];

function extraOf(extra: unknown): Record<string, string> {
  return extra && typeof extra === "object" && !Array.isArray(extra)
    ? (extra as Record<string, string>)
    : {};
}

/**
 * המטען הבסיסי, לפני מיפוי.
 *
 * שדה ריק נשאר ריק ולא נעלם, כדי שהצד השני יקבל תמיד את
 * אותו מבנה. מערכת שמקבלת פעם 8 שדות ופעם 5 נשברת.
 */
export function buildPayload(
  lead: DeliveryLead,
  at: Date
): Record<string, string> {
  const extra = extraOf(lead.extra);
  const full = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();

  return {
    full_name: full,
    first_name: lead.firstName ?? "",
    last_name: lead.lastName ?? "",
    phone: lead.phone,
    email: extra.email ?? "",
    address: extra.address ?? "",
    campaign: extra.fb_campaign ?? extra.campaign ?? "",
    ad: extra.fb_ad ?? "",
    form: extra.fb_form ?? "",
    supplier_question: extra.supplier_question ?? "",
    fb_leadid: extra.fb_leadid ?? "",
    created_at: at.toISOString(),
  };
}

/**
 * מחיל את מיפוי השדות של הקונה.
 *
 * { "phone": "telephone" } יגרום לכך ש-phone יישלח בשם
 * telephone. שדה שלא מופיע במיפוי נשלח בשמו המקורי.
 *
 * ערך ריק במיפוי פירושו "אל תשלח את השדה הזה" - ככה אפשר
 * להסתיר מידע מקונה מסוים בלי לשנות קוד.
 */
export function applyFieldMap(
  payload: Record<string, string>,
  fieldMap: unknown
): Record<string, string> {
  const map =
    fieldMap && typeof fieldMap === "object" && !Array.isArray(fieldMap)
      ? (fieldMap as Record<string, unknown>)
      : {};

  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    const renamed = map[key];

    // לא מופיע במיפוי - נשלח כמו שהוא
    if (renamed === undefined) {
      out[key] = value;
      continue;
    }

    // מופיע כריק - לא נשלח בכלל
    if (typeof renamed !== "string" || renamed.trim() === "") continue;

    out[renamed.trim()] = value;
  }

  return out;
}

/**
 * ============================================================
 *  מתי לנסות שוב
 * ============================================================
 *
 *  כישלון זמני אצל הקונה (השרת שלו נפל לדקה) לא אמור לעלות
 *  לך בליד. לכן מנסים שוב, אבל בהפרשים גדלים - כדי לא
 *  להפציץ שרת שבאמת שבור.
 *
 *  4xx פירושו שהבקשה עצמה שגויה, וניסיון חוזר ייכשל באותה
 *  צורה. היוצא מהכלל הוא 408 ו-429, שהם בקשה טובה בתזמון רע.
 */
export const MAX_ATTEMPTS = 5;

export function shouldRetry(httpStatus: number | null, attempts: number): boolean {
  if (attempts >= MAX_ATTEMPTS) return false;

  // לא הייתה תשובה בכלל - תקלת רשת, שווה לנסות שוב
  if (httpStatus === null) return true;

  if (httpStatus === 408 || httpStatus === 429) return true;
  if (httpStatus >= 400 && httpStatus < 500) return false;

  return true;
}

/** כמה דקות להמתין לפני הניסיון הבא */
export function retryDelayMinutes(attempts: number): number {
  const steps = [1, 5, 20, 60];
  return steps[Math.min(attempts, steps.length - 1)];
}

/** האם התשובה נחשבת הצלחה */
export function isSuccess(httpStatus: number): boolean {
  return httpStatus >= 200 && httpStatus < 300;
}
