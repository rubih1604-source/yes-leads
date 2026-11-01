/**
 * ============================================================
 *  האם האדם הזה נמצא ברשימת דיוור שנשלחה
 * ============================================================
 *
 *  **למה זה קיים.**
 *
 *  הרשימה שנטענת מקובץ יושבת במערכת מרגע השמירה, ויודעת
 *  בדיוק מי נמען דיוור. רישום ההודעה היוצאת הוא מקור שני
 *  לאותו מידע - והוא יכול לחסר, כמו שקרה בפועל: אדם קיבל
 *  את הדיוור, שום הודעה לא נרשמה עליו, והבוט לא ידע שהוא
 *  עונה לדיוור.
 *
 *  כאן שואלים את הרשימה עצמה. הטלפונים בה נשמרים מנורמלים
 *  בדיוק כמו בליד, ולכן ההשוואה מדויקת ולא מנחשת.
 */

/**
 * מתי נשלח הדיוור האחרון לרשימה שהאדם הזה נמצא בה.
 *
 * מחזיר null אם הוא לא בשום רשימה, או שהרשימה שבה הוא
 * נמצא עוד לא נשלחה.
 */
export async function lastListSendFor(
  phone: string
): Promise<Date | null> {
  const { db } = await import("./db");

  const memberships = await db.broadcastContact
    .findMany({
      where: { phone },
      select: { listId: true },
      take: 20,
    })
    .catch(() => []);

  if (memberships.length === 0) return null;

  const send = await db.broadcastSend
    .findFirst({
      where: { listId: { in: memberships.map((m) => m.listId) } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })
    .catch(() => null);

  return send?.createdAt ?? null;
}
