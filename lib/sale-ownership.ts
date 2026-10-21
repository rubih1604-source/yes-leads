/**
 * ============================================================
 *  הכלל היחיד שקובע של מי הליד
 * ============================================================
 *
 *  **למה הקובץ הזה קיים.**
 *
 *  היו במערכת שני מנגנוני סיווג מקבילים: "קמפיין מכירה רשום"
 *  (לפי שם) ו"ערוץ" (לפי מזהה טופס). כל מסך הכריע לפי אחד
 *  מהם, והם לא הסכימו ביניהם. התוצאה הייתה שכל תיקון במקום
 *  אחד שבר מקום אחר: המונה נתקע, "חשב הכל מחדש" הוציא לידים
 *  מהמכירה, ומחיקת קמפיין גררה לידים של קונה בחזרה.
 *
 *  מעכשיו ההכרעה יושבת כאן בלבד, והיא פשוטה:
 *
 *      **הטופס קובע את הערוץ. הערוץ קובע הכל.**
 *
 *  שם הקמפיין הוא נתון לתצוגה. הוא לא מכריע בעלות ולא מחיר,
 *  ולכן קמפיין שלא נרשם, או ששמו לא הגיע מפייסבוק, לא יכול
 *  יותר לגרום לליד להיעלם.
 *
 *  הקובץ טהור - בלי מסד - כדי שהכלל יהיה מכוסה בבדיקות.
 *  הוא הדבר היחיד שעומד בין הנתונים שלך לבין פעולה שמוחקת
 *  מכירות.
 */

export type EntryLike = {
  isSale: boolean;
  channelId?: string | null;
  campaign?: string | null;
};

/**
 * האם מותר בכלל לגעת בבעלות של הליד הזה לפי שם קמפיין.
 *
 * כניסה ששייכת לערוץ **מוגנת**: הערוץ הוא ההחלטה, ושם
 * הקמפיין לא יכול לבטל אותה. זו ההגנה שחסרה, וזה מה
 * שגרם לנזק.
 */
export function isProtectedByChannel(
  entries: EntryLike[],
  saleChannelIds: Set<string>
): boolean {
  return entries.some(
    (e) => e.channelId && saleChannelIds.has(e.channelId)
  );
}

/**
 * של מי הליד, לפי הכניסות שלו.
 *
 * כניסה אחת של מכירה מספיקה: "מה שקשור לאלעד שייך אך ורק
 * אליו". זה הכלל שלך, והוא נשמר כאן במילים שלך כדי שלא
 * יתגלגל שוב למשהו אחר.
 */
export function ownerFromEntries(
  entries: EntryLike[],
  saleChannelIds: Set<string>
): "sale" | "mine" {
  if (entries.length === 0) return "mine";

  // ערוץ מכירה מכריע, בלי קשר לשם הקמפיין
  if (isProtectedByChannel(entries, saleChannelIds)) return "sale";

  // אחרת - החותמת שעל הכניסות
  return entries.some((e) => e.isSale) ? "sale" : "mine";
}

/**
 * האם פעולה שמבוססת על שמות קמפיינים רשאית לשנות את הליד.
 *
 * מחזיר false לליד ששייך לערוץ - ואז הפעולה חייבת לדלג
 * עליו ולא לגעת בו בכלל.
 */
export function mayReclassifyByCampaignName(
  entries: EntryLike[],
  saleChannelIds: Set<string>
): boolean {
  return !isProtectedByChannel(entries, saleChannelIds);
}

/**
 * מתרגם את ההכרעה לערך שנשמר בשדה origin.
 *
 * "whatsapp" הוא מצב נפרד ולא נגזר מהכניסות, ולכן הוא
 * נשמר כמו שהוא ולא נדרס.
 */
export function originFor(
  current: string,
  owner: "sale" | "mine"
): string {
  if (current === "whatsapp" && owner === "mine") return "whatsapp";
  return owner === "sale" ? "sale" : "leadmanager";
}
