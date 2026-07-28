/**
 * ============================================================
 *  מיפוי ה-webhook של ליד מנגר
 * ============================================================
 *
 *  זה הקובץ היחיד שצריך לגעת בו כשנדע איך באמת נראה
 *  ה-payload שליד מנגר שולח.
 *
 *  התהליך:
 *  1. פורסים את המערכת
 *  2. נותנים לליד מנגר את הכתובת של ה-webhook
 *  3. משנים סטטוס לליד אמיתי
 *  4. נכנסים למסך "יומן קליטה" ורואים בדיוק מה הגיע
 *  5. מעדכנים את רשימות השדות למטה
 *
 *  עד אז - המערכת מנחשת לפי שמות שדות נפוצים, ואם היא
 *  לא מצליחה, הליד עדיין נשמר ומסומן "צריך בדיקה".
 */

/** שמות השדות האפשריים לטלפון, לפי סדר עדיפות */
const PHONE_FIELDS = ["phone", "Phone", "mobile", "telephone", "tel", "phone_number", "phoneNumber", "טלפון", "נייד"];

/** שמות השדות האפשריים לשם פרטי */
const FIRST_NAME_FIELDS = ["first_name", "firstName", "fname", "name", "full_name", "fullName", "שם", "שם_פרטי"];

/** שמות השדות האפשריים לשם משפחה */
const LAST_NAME_FIELDS = ["last_name", "lastName", "lname", "surname", "שם_משפחה"];

/** שמות השדות האפשריים לסטטוס */
const STATUS_FIELDS = ["status", "Status", "lead_status", "leadStatus", "stage", "סטטוס"];

/** שמות השדות האפשריים למקור הליד */
const SOURCE_FIELDS = ["source", "Source", "campaign", "utm_source", "מקור"];

export type MappedLead = {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string | null;
  source: string | null;
};

/** מחפש שדה בתוך אובייקט, כולל אובייקטים מקוננים */
function findField(obj: unknown, candidates: string[], depth = 0): string | null {
  if (depth > 4 || obj === null || typeof obj !== "object") return null;

  const record = obj as Record<string, unknown>;

  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findField(value, candidates, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

export function mapLeadManagerPayload(payload: unknown): MappedLead {
  return {
    phone: findField(payload, PHONE_FIELDS),
    firstName: findField(payload, FIRST_NAME_FIELDS),
    lastName: findField(payload, LAST_NAME_FIELDS),
    status: findField(payload, STATUS_FIELDS),
    source: findField(payload, SOURCE_FIELDS),
  };
}
