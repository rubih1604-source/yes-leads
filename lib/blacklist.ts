/**
 * ============================================================
 *  הרשימה השחורה - מקור אמת אחד
 * ============================================================
 *
 *  הרשימה **היא** השדה doNotContact על הליד. אין טבלה
 *  נפרדת ואין רשימה שנייה: כל מי שכותב אליך הופך לליד
 *  במערכת, ולכן הסימון על הליד מכסה את כולם.
 *
 *  למה זה קובץ בפני עצמו: כניסה לרשימה מגיעה משלוש דלתות
 *  (זיהוי ודאי, הסיווג החכם, וסימון ידני), ושלוש דלתות
 *  שכל אחת כותבת למסד בעצמה הן שלוש הזדמנויות לשכוח שדה.
 *  כאן הכתיבה נעשית פעם אחת.
 *
 *  ולמה הקריאה כאן: הדיוור רץ על **אנשי קשר**, לא על
 *  לידים - שתי טבלאות שונות שמחוברות רק דרך הטלפון. מספר
 *  נשמר בפורמטים שונים, ולכן ההצלבה חייבת לעבור נרמול.
 *  הצלבה נאיבית הייתה מחזירה "אף אחד לא ברשימה" ושולחת
 *  לכולם - כלומר בדיוק הכשל שהיא אמורה למנוע.
 */

import { phoneDigits } from "./phone";

/**
 * מכניס ליד לרשימה השחורה.
 *
 * **לא מוציא.** סימון שכבר קיים לא נדרס בסיבה חדשה, כדי
 * שהסיבה המקורית - והתאריך - יישמרו. הוצאה נעשית רק ידנית
 * מהמסך.
 */
export async function addToBlacklist(args: {
  leadId: string;
  reason: string;
  text?: string | null;
}): Promise<boolean> {
  const { db } = await import("./db");

  const lead = await db.lead
    .findUnique({
      where: { id: args.leadId },
      select: { doNotContact: true },
    })
    .catch(() => null);

  if (!lead) return false;
  if (lead.doNotContact) return true;

  const done = await db.lead
    .update({
      where: { id: args.leadId },
      data: {
        doNotContact: true,
        doNotContactAt: new Date(),
        doNotContactReason: args.reason,
        doNotContactText: args.text?.slice(0, 500) ?? null,
      },
    })
    .catch(() => null);

  return Boolean(done);
}

/** מוציא מהרשימה - רק בפעולה ידנית שלך */
export async function removeFromBlacklist(leadId: string): Promise<boolean> {
  const { db } = await import("./db");

  const done = await db.lead
    .update({
      where: { id: leadId },
      data: {
        doNotContact: false,
        doNotContactAt: null,
        doNotContactReason: null,
        doNotContactText: null,
      },
    })
    .catch(() => null);

  return Boolean(done);
}

/**
 * כל הספרות המשמעותיות של מי שברשימה השחורה.
 *
 * מוחזר כ-Set של ספרות בלבד (בלי קידומת ובלי אפס), כי זו
 * הצורה היחידה שבה "052-123-4567", "+972521234567"
 * ו-"0521234567" הם אותו אדם.
 */
export async function blacklistedDigits(): Promise<Set<string>> {
  const { db } = await import("./db");

  const leads = await db.lead
    .findMany({ where: { doNotContact: true }, select: { phone: true } })
    .catch(() => []);

  const out = new Set<string>();

  for (const lead of leads) {
    const digits = digitsOf(lead.phone);
    if (digits) out.add(digits);
  }

  return out;
}

/**
 * הספרות שמשמשות להשוואה.
 *
 * מופרד כפונקציה כדי שהבדיקות יוכלו לאמת שכל צורות
 * הכתיבה מתכנסות לאותו מפתח.
 */
export function digitsOf(phone: string | null | undefined): string {
  if (!phone) return "";

  try {
    return phoneDigits(phone);
  } catch {
    return String(phone).replace(/\D/g, "");
  }
}

/** האם איש הקשר הזה ברשימה השחורה */
export function isBlacklisted(
  phone: string | null | undefined,
  digits: Set<string>
): boolean {
  const key = digitsOf(phone);
  return key.length > 0 && digits.has(key);
}

/**
 * מפריד רשימת נמענים לשניים.
 *
 * טהור בכוונה - בלי מסד - כדי שהחלוקה תהיה מכוסה בבדיקות.
 * זו הנקודה שבה נקבע מי מקבל הודעה ומי לא.
 */
export function splitByBlacklist<T extends { phone: string }>(
  contacts: T[],
  digits: Set<string>
): { allowed: T[]; blocked: T[] } {
  const allowed: T[] = [];
  const blocked: T[] = [];

  for (const contact of contacts) {
    if (isBlacklisted(contact.phone, digits)) blocked.push(contact);
    else allowed.push(contact);
  }

  return { allowed, blocked };
}

/**
 * ============================================================
 *  חסימה ידנית לפי מספר טלפון
 * ============================================================
 *
 *  **למה זה נחוץ.**
 *
 *  חלק מהאנשים מבקשים להפסיק בהקלטה קולית, בשיחה, או
 *  בניסוח שאף זיהוי טקסט לא יתפוס. אין שום דרך אוטומטית
 *  לדעת את זה - ולכן צריכה להיות דרך ידנית, אחרת הם
 *  ימשיכו לקבל דיוור.
 *
 *  **מספר שאינו ליד נשמר בכל זאת.**
 *
 *  הסינון בדיוור קורא את הרשימה השחורה מתוך הלידים, ולכן
 *  מספר שאין לו ליד פשוט לא היה נחסם בפועל. כאן נוצרת
 *  לו רשומה עם בעלות "נמען דיוור" - אותה בעלות שכבר
 *  קיימת לאנשים שאינם לידים שלך, ולכן הוא **לא יופיע
 *  ברשימת הלידים** ולא יזהם אותה.
 */
export async function blockPhone(args: {
  phone: string;
  note?: string | null;
}): Promise<{ ok: boolean; created: boolean; phone: string; error?: string }> {
  const { db } = await import("./db");
  const { normalizePhone } = await import("./phone");
  const { BROADCAST_ORIGIN } = await import("./channel");

  const phone = normalizePhone(args.phone);

  if (!phone) {
    return { ok: false, created: false, phone: "", error: "מספר לא תקין" };
  }

  const existing = await db.lead
    .findUnique({ where: { phone }, select: { id: true } })
    .catch(() => null);

  const reason = "נחסם ידנית";
  const text = args.note?.trim()?.slice(0, 500) || null;

  if (existing) {
    const done = await addToBlacklist({
      leadId: existing.id,
      reason,
      text,
    });
    return { ok: done, created: false, phone };
  }

  const created = await db.lead
    .create({
      data: {
        phone,
        status: "לא מעוניין/אין מענה הודעה",
        origin: BROADCAST_ORIGIN,
        source: reason,
        doNotContact: true,
        doNotContactAt: new Date(),
        doNotContactReason: reason,
        doNotContactText: text,
      },
    })
    .catch(() => null);

  return { ok: Boolean(created), created: true, phone };
}
