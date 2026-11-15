/**
 * ============================================================
 *  מילוי הערוץ ללידים שנוצרו לפני ההפרדה
 * ============================================================
 *
 *  **למה זה חייב לרוץ, ולמה מעצמו.**
 *
 *  עמודת `channel` נוספה לסכימה עם ברירת מחדל "mine". זו
 *  ברירת המחדל הנכונה לליד חדש, אבל היא לא נכונה לעבר:
 *  כל הלידים של המכירה שכבר במסד קיבלו אותה, ולכן ברגע
 *  שהעדכון עולה הם יופיעו ברשימה שלך - בדיוק ההפך ממה
 *  שההפרדה אמורה לתת.
 *
 *  המקור לאמת הוא `origin`, שהוא השדה שהחזיק את הבעלות
 *  עד היום. לכן המילוי הוא משפט אחד: מי ש-origin שלו
 *  "sale" -> הערוץ שלו "sale".
 *
 *  **זה רץ מעצמו.** אחרי העדכון הקודם נשארו לך שלושה
 *  כפתורי תחזוקה שהיית צריך ללחוץ, ואם לא לחצת - שום דבר
 *  לא קרה ולא היה סימן. כאן אין כפתור: הסבב הראשון של
 *  המנוע מריץ את זה, ומסמן את התאריך כדי שלא יחזור.
 *
 *  **אידמפוטנטי לחלוטין.** הרצה שנייה לא תשנה כלום, גם
 *  אם התאריך יימחק - התנאי בודק את המצב עצמו ולא את
 *  ההיסטוריה.
 */

/** מה שהמילוי עשה בפועל, לדיווח במסך התחזוקה */
export type FillResult = {
  ran: boolean;
  moved: number;
  reason?: string;
};

/**
 * מיישר את הערוץ מול origin.
 *
 * `force` מדלג על בדיקת התאריך, לשימוש ידני ממסך תחזוקה.
 */
export async function fillChannels(force = false): Promise<FillResult> {
  const { db } = await import("./db");
  const { SALE_CHANNEL, MINE_CHANNEL, SALE_ORIGIN } = await import("./channel");

  /**
   * אותה שורת הגדרות שכל המערכת משתמשת בה, עם אותו מזהה
   * קבוע. יצירה נפרדת כאן הייתה יכולה להוליד שורה שנייה
   * ולהפוך את ההגדרות לשתי אמיתות.
   */
  const settings = await db.settings
    .upsert({
      where: { id: "main" },
      create: { id: "main" },
      update: {},
      select: { id: true, channelFilledAt: true },
    })
    .catch(() => null);

  if (!force && settings?.channelFilledAt) {
    return { ran: false, moved: 0, reason: "כבר רץ" };
  }

  /**
   * שני הכיוונים, ולא רק אחד.
   *
   * הכיוון השני נראה מיותר - אף ליד לא נולד כ-sale בערוץ
   * הלא נכון - אבל הוא מה שהופך את זה לתיקון של **סתירה**
   * ולא להעתקה חד־פעמית: אם שדה אחד ייפרד מהשני מסיבה
   * כלשהי, הרצה חוזרת תיישר אותו.
   */
  const toSale = await db.lead
    .updateMany({
      where: { origin: SALE_ORIGIN, channel: { not: SALE_CHANNEL } },
      data: { channel: SALE_CHANNEL },
    })
    .catch(() => null);

  const toMine = await db.lead
    .updateMany({
      where: { origin: { not: SALE_ORIGIN }, channel: SALE_CHANNEL },
      data: { channel: MINE_CHANNEL },
    })
    .catch(() => null);

  const moved = (toSale?.count ?? 0) + (toMine?.count ?? 0);

  /**
   * נכשל? לא מסמנים. ככה הסבב הבא ינסה שוב, במקום
   * ש"רץ פעם אחת" יהפוך ל"לא רץ אף פעם" בשקט.
   */
  if (toSale && toMine) {
    await db.settings
      .upsert({
        where: { id: "main" },
        create: { id: "main", channelFilledAt: new Date() },
        update: { channelFilledAt: new Date() },
      })
      .catch(() => null);
  }

  return { ran: true, moved };
}
