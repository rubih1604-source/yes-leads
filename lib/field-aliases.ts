/**
 * ============================================================
 *  זיהוי שדות מטפסים בעברית
 * ============================================================
 *
 *  **הבאג שזה מתקן.**
 *
 *  טופס שנבנה בעברית בפייסבוק מחזיר שמות שדות בעברית:
 *
 *      "שם_מלא": "שרה פרידמן"
 *      "דוא\"ל": "sorele1916@gmail.com"
 *
 *  המערכת חיפשה שמות באנגלית בלבד, ולכן ליד כזה נכנס **בלי
 *  שם ובלי מייל** - והקונה קיבל שורה ריקה. הטלפון כן עבר,
 *  כי פייסבוק שולחת אותו תמיד כ-phone_number.
 *
 *  הפתרון לא יכול להיות רשימה ארוכה של כל הצורות האפשריות:
 *  בכל טופס חדש שתבנה יופיע נוסח קצת אחר. לכן ההשוואה
 *  מנורמלת - מורידים ניקוד, קו תחתון, רווחים, מרכאות
 *  וסימני שאלה - ואז משווים.
 *
 *  הקובץ טהור כדי שהזיהוי יהיה מכוסה בבדיקות. שדה שלא
 *  מזוהה פירושו ליד שנמכר ריק.
 */

import { splitName } from "./person-name";

export type CanonicalField =
  | "full_name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "address"
  | "supplier_question";

/**
 * מנרמל שם שדה להשוואה.
 *
 * "שם_מלא" · "שם מלא" · "שם-מלא" · "שם מלא?" → "שםמלא"
 */
export function normalizeFieldName(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`״׳]/g, "")
    .replace(/[\s_\-.?:]/g, "")
    .replace(/[֑-ׇ]/g, ""); // ניקוד
}

/**
 * הצורות המוכרות לכל שדה.
 *
 * מספיק שאחת מהן תתאים אחרי נרמול. הסדר לא משנה כי ההשוואה
 * מדויקת, לא חלקית - התאמה חלקית הייתה גורמת ל"שם החברה"
 * להיקלט כשם הלקוח.
 */
const ALIASES: Record<CanonicalField, string[]> = {
  full_name: [
    "full_name",
    "fullname",
    "name",
    "שם מלא",
    "שם_מלא",
    "שםמלא",
    "שם",
    "השם שלך",
    "מה השם שלך",
  ],
  first_name: ["first_name", "firstname", "fname", "שם פרטי", "שם_פרטי"],
  last_name: ["last_name", "lastname", "lname", "surname", "שם משפחה", "שם_משפחה"],
  email: [
    "email",
    "e_mail",
    "email_address",
    "mail",
    'דוא"ל',
    "דואל",
    "דואר אלקטרוני",
    "אימייל",
    "מייל",
    "כתובת מייל",
    "כתובת אימייל",
  ],
  phone: [
    "phone",
    "phone_number",
    "phonenumber",
    "mobile",
    "mobile_number",
    "telephone",
    "tel",
    "טלפון",
    "מספר טלפון",
    "נייד",
    "מספר נייד",
    "טלפון נייד",
  ],
  address: ["address", "street_address", "city", "כתובת", "עיר", "ישוב", "יישוב"],
  supplier_question: [
    "supplier",
    "provider",
    "supplier_question",
    "ספק",
    "ספק נוכחי",
    "מי ספק התקשורת שלכם",
    "מי הספק שלך",
    "חברת הכבלים",
  ],
};

/** טבלת חיפוש מנורמלת, נבנית פעם אחת */
const LOOKUP = new Map<string, CanonicalField>();

for (const [canonical, names] of Object.entries(ALIASES)) {
  for (const name of names) {
    LOOKUP.set(normalizeFieldName(name), canonical as CanonicalField);
  }
}

/**
 * לאיזה שדה מוכר שם השדה הזה מתאים, אם בכלל.
 *
 * מחזיר null לשדה שלא מזוהה - והוא נשמר כמו שהוא בפרטי
 * הליד, כדי שלא יאבד.
 */
export function canonicalFieldOf(name: string): CanonicalField | null {
  const key = normalizeFieldName(name);
  if (!key) return null;

  const exact = LOOKUP.get(key);
  if (exact) return exact;

  /**
   * שאלת הספק היא היחידה שמזוהה גם בהתאמה חלקית.
   *
   * היא מנוסחת אחרת בכל טופס ("מי ספק התקשורת שלכם?",
   * "איזה ספק יש לכם היום?"), ולכן רשימה סגורה לא תחזיק.
   * שאר השדות נשארים בהתאמה מדויקת בכוונה: "שם החברה" לא
   * אמור להיקלט כשם הלקוח.
   */
  if (/ספק|supplier|provider/.test(key)) return "supplier_question";

  return null;
}

/**
 * מוסיף לרשומה את השמות המוכרים, בלי למחוק כלום.
 *
 * השדה המקורי נשאר - גם כדי שתראה בכרטיס בדיוק מה פייסבוק
 * שלחה, וגם כדי שזיהוי שגוי לא ימחק מידע.
 *
 * שדה שכבר קיים בשם המוכר לא נדרס: ערך מפורש תמיד גובר על
 * ערך שנגזר מזיהוי.
 */
export function withCanonicalFields(
  record: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = { ...record };

  for (const [name, value] of Object.entries(record)) {
    if (!value?.trim()) continue;

    const canonical = canonicalFieldOf(name);
    if (!canonical) continue;
    if (out[canonical]?.trim()) continue;

    out[canonical] = value.trim();
  }

  /**
   * שם מלא שמפוצל לשם פרטי ומשפחה.
   *
   * טופס בעברית מחזיר בדרך כלל שדה אחד "שם מלא", והמערכת
   * שומרת שם פרטי ומשפחה בנפרד. בלי הפיצול, השם המלא היה
   * נכנס כשם פרטי והשדה השני היה נשאר ריק.
   *
   * הפיצול עצמו חי ב-person-name, כדי שלא יהיו שני כללי
   * פיצול שונים במערכת.
   */
  const { firstName, lastName } = splitName({
    full: out.full_name,
    first: out.first_name,
    last: out.last_name,
  });

  if (firstName) out.first_name = firstName;
  if (lastName) out.last_name = lastName;

  return out;
}
