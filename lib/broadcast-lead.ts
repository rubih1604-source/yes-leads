import { normalizePhone } from "./phone";
import { BROADCAST_ORIGIN } from "./channel";

/**
 * ============================================================
 *  נמען דיוור הופך לרשומה במערכת
 * ============================================================
 *
 *  **זה השורש של כל מה שלא עבד בדיוור.**
 *
 *  רשימת דיוור שנטענת מקובץ יושבת בטבלה נפרדת של אנשי קשר,
 *  בלי שום קשר ללידים. כששלחנו להם, ההודעה היוצאת פשוט לא
 *  נרשמה בשום מקום - לא היה למי לרשום אותה.
 *
 *  ואז הם ענו, והמערכת ראתה אדם שכותב לה בלי שום היסטוריה:
 *  הבוט לא ידע שהוא עונה לדיוור, מסך ההתעניינות לא הראה
 *  אותו, ו"הסר" ממנו לא היה נרשם על כלום.
 *
 *  מעכשיו כל נמען מקבל רשומה **לפני** השליחה, וההודעה
 *  נרשמת עליה. מכאן כל השרשרת עובדת מעצמה.
 *
 *  **הוא לא נכנס לרשימת הלידים.** הבעלות שלו היא
 *  "broadcast", והרשימה מסננת אותה החוצה - בדיוק כמו
 *  וואטסאפ. הוא כן נמצא בדאטה, וכן יופיע במסך ההתעניינות
 *  אם יענה. זה מה שביקשת.
 */

export type ContactLike = {
  phone: string;
  firstName?: string | null;
};

/**
 * מחזיר את מזהה הליד של הנמען, ויוצר אותו אם אינו קיים.
 *
 * מחזיר null רק אם הטלפון לא תקין - נמען כזה לא יכול
 * לקבל הודעה בכל מקרה.
 */
export async function ensureLeadForContact(
  contact: ContactLike
): Promise<string | null> {
  const { db } = await import("./db");

  const phone = normalizePhone(contact.phone);
  if (!phone) return null;

  const existing = await db.lead
    .findUnique({ where: { phone }, select: { id: true, firstName: true } })
    .catch(() => null);

  if (existing) {
    /**
     * ליד קיים **לא משנה בעלות**.
     *
     * אדם שכבר ליד שלך, או שכבר של אלעד, לא הופך ל"נמען
     * דיוור" רק כי שלחת לו הודעה. דיוור הוא פעולה עליו,
     * לא מקור שלו.
     */
    if (!existing.firstName && contact.firstName?.trim()) {
      await db.lead
        .update({
          where: { id: existing.id },
          data: { firstName: contact.firstName.trim() },
        })
        .catch(() => null);
    }

    return existing.id;
  }

  const created = await db.lead
    .create({
      data: {
        phone,
        firstName: contact.firstName?.trim() || null,
        origin: BROADCAST_ORIGIN,

        /**
         * סטטוס נפרד, כדי שלא יתערבב עם "חדש" שהוא ליד
         * אמיתי שמחכה לטיפול. מי שיענה יקבל סטטוס אמיתי
         * דרך הבוט או דרכך.
         */
        status: "נמען דיוור",
      },
      select: { id: true },
    })
    .catch(() => null);

  return created?.id ?? null;
}
