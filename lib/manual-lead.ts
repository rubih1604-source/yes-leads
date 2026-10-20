/**
 * ============================================================
 *  הוספת ליד ידני
 * ============================================================
 *
 *  עד עכשיו הדרך היחידה שליד נכנס למערכת הייתה דרך webhook.
 *  זה אומר שלא היה אפשר לבדוק שום דבר מקצה לקצה בלי לחכות
 *  לליד אמיתי מפייסבוק - וזו הייתה חסימה אמיתית.
 *
 *  הקובץ טהור בכוונה (בלי מסד) כדי שכל הכללים יהיו מכוסים
 *  בבדיקות. ליד ידני נכנס לאותן רשימות ולאותם חישובים כמו
 *  ליד אמיתי, ולכן טעות כאן מזהמת את הנתונים.
 */

import { normalizePhone } from "./phone";

export type ManualInput = {
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  address?: string | null;
  campaign?: string | null;
  supplier?: string | null;
  /** הערוץ שאליו הליד נכנס. ריק = הליד נשאר שלך. */
  channelId?: string | null;
};

export type ManualPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      phone: string;
      firstName: string | null;
      lastName: string | null;
      extra: Record<string, string>;
      channelId: string | null;
    };

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * מתרגם את מה שהוקלד בטופס לליד שאפשר לשמור.
 *
 * מחזיר שגיאה בעברית במקום לזרוק, כדי שהמסך יוכל להציג
 * אותה כמו שהיא.
 */
export function planManualLead(input: ManualInput): ManualPlan {
  const rawPhone = clean(input.phone);

  if (!rawPhone) {
    return { ok: false, error: "חייב טלפון" };
  }

  const phone = normalizePhone(rawPhone);

  if (!phone) {
    return { ok: false, error: "הטלפון לא תקין" };
  }

  /**
   * השם לא חובה.
   *
   * ליד אמיתי מפייסבוק מגיע לפעמים בלי שם, ואם נדרוש שם
   * כאן אז ליד ידני יתנהג אחרת מליד אמיתי - וזה בדיוק מה
   * שהופך בדיקה לחסרת ערך.
   */
  const firstName = clean(input.firstName) || null;
  const lastName = clean(input.lastName) || null;

  /**
   * extra נשמר באותם מפתחות שהוובוק מייצר, כדי ששדות
   * השליחה (email, address, קמפיין, ספק) ימצאו את הערכים
   * באותו מקום בשני המסלולים.
   */
  const extra: Record<string, string> = {};

  const email = clean(input.email);
  if (email) extra.email = email;

  const address = clean(input.address);
  if (address) extra.address = address;

  const campaign = clean(input.campaign);
  if (campaign) extra.fb_campaign = campaign;

  const supplier = clean(input.supplier);
  if (supplier) extra.supplier_question = supplier;

  extra.manual = "1"; // סימון שזה ליד שהוזן ביד, לא מפייסבוק

  return {
    ok: true,
    phone,
    firstName,
    lastName,
    extra,
    channelId: clean(input.channelId) || null,
  };
}

/**
 * מה לעשות כשהטלפון כבר קיים במערכת.
 *
 * **לא** מאחדים ולא דורסים. נרשמת כניסה נוספת לליד הקיים,
 * בדיוק כמו הגעה חוזרת מפייסבוק - ולכן התווית "ליד כפול"
 * תופיע עליו, וזה נכון: הוא באמת נכנס פעמיים.
 *
 * זה הכלל שחזר ונשבר כל גרסה, ולכן הוא כתוב כאן במפורש
 * ומכוסה בבדיקה.
 */
export function duplicateAction(leadExists: boolean): "create" | "add_entry" {
  return leadExists ? "add_entry" : "create";
}

/**
 * הבעלות על הליד נקבעת לפי הערוץ, ולא לפי מי הקליד.
 *
 * ליד שהוזן ידנית לערוץ מכירה הוא **של הקונה בלבד** ויוצא
 * מהרשימה האישית - בדיוק כמו ליד שנכנס מקמפיין מכירה.
 */
export function originFor(isSaleChannel: boolean): "sale" | "leadmanager" {
  /**
   * ליד אישי מקבל "leadmanager" ולא origin חדש משלו.
   *
   * לא מטעמי יופי: יש במערכת שאילתות שמסננות במפורש
   * origin: "leadmanager" - דוחות, ספירות, איתור כפולים
   * וייבוא. origin חדש כמו "manual" היה גורם לליד הידני
   * להיעלם מכולן, והיית בודק מערכת שמתנהגת אחרת מהאמת.
   *
   * שהליד הוזן ביד מסומן ב-source וב-extra.manual.
   */
  return isSaleChannel ? "sale" : "leadmanager";
}

/** מה שנרשם בשדה המקור, כדי שיהיה ברור שהליד לא מפייסבוק */
export const MANUAL_SOURCE = "הוזן ידנית";
