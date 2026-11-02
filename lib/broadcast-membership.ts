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

/**
 * ============================================================
 *  אותה שאלה, להרבה אנשים בבת אחת
 * ============================================================
 *
 *  **למה זה קיים.**
 *
 *  מסך ההתעניינות עובר על אלף לידים. שאילתה לכל אחד
 *  מהם הייתה הופכת את המסך לבלתי שמיש, ולכן הוא פשוט
 *  לא שאל - והתוצאה היא שכל מי שקיבל דיוור מרשימה
 *  שנטענה, ואין עליו רישום הודעה יוצאת, לא הופיע שם
 *  בכלל. בדיוק הלידים החמים ביותר.
 *
 *  כאן אותה תשובה בדיוק, בשתי שאילתות לכל הרשימה.
 */
export async function lastListSendForMany(
  phones: string[]
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (phones.length === 0) return out;

  const { db } = await import("./db");

  const memberships = await db.broadcastContact
    .findMany({
      where: { phone: { in: phones } },
      select: { phone: true, listId: true },
    })
    .catch(() => [] as Array<{ phone: string; listId: string }>);

  if (memberships.length === 0) return out;

  const listIds = [...new Set(memberships.map((m) => m.listId))];

  const sends = await db.broadcastSend
    .findMany({
      where: { listId: { in: listIds } },
      orderBy: { createdAt: "desc" },
      select: { listId: true, createdAt: true },
    })
    .catch(() => [] as Array<{ listId: string; createdAt: Date }>);

  /** השליחה האחרונה של כל רשימה */
  const lastByList = new Map<string, Date>();
  for (const send of sends) {
    if (!lastByList.has(send.listId)) lastByList.set(send.listId, send.createdAt);
  }

  /** ולכל אדם - המאוחרת מבין הרשימות שהוא נמצא בהן */
  for (const m of memberships) {
    const at = lastByList.get(m.listId);
    if (!at) continue;

    const current = out.get(m.phone);
    if (!current || at.getTime() > current.getTime()) out.set(m.phone, at);
  }

  return out;
}
