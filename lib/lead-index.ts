/**
 * ============================================================
 *  מסירים את האכיפה של "טלפון אחד = ליד אחד"
 * ============================================================
 *
 *  **למה זה התהפך.**
 *
 *  בניתי כאן אכיפה שאותו מספר יכול להופיע פעם אחת בלבד
 *  בכל ערוץ, והנחתי שזו ההגנה הנכונה. היא לא. היא בדיוק
 *  מה שמנע את מה שהתבקש שוב ושוב:
 *
 *      "כל ליד שנכנס יקבל שורה של ליד מחדש, לא משנה כמה
 *       פעמים הוא נכנס"
 *
 *  אדם שנכנס שלוש פעמים בנובמבר הוא **שלוש הגעות**. כל
 *  אחת שילמה עליה, כל אחת מגיעה כליד חדש, והשנייה
 *  והשלישית נושאות תווית "כפול". אכיפה של שורה אחת
 *  הכריחה את ההגעה השנייה לדרוס את הראשונה - ואיתה את
 *  הסטטוס, התווית וההיסטוריה.
 *
 *  לכן הקובץ הזה כבר לא יוצר אינדקס אלא **מוריד אותו**,
 *  אם הוא קיים במסד מעדכון קודם. בלי זה כל הגעה חוזרת
 *  תיכשל בשקט, וליד ששילמת עליו לא ייכנס.
 */

/** השם שפריזמה הייתה נותנת לאינדקס הזה בעצמה */
export const LEAD_KEY_INDEX = "Lead_phone_channel_key";

export type IndexResult = {
  ok: boolean;
  /** האינדקס הוסר עכשיו */
  removed?: boolean;
  /** כבר לא היה - זו ההצלחה השכיחה */
  absent?: boolean;
  error?: string;
};

/**
 * יוצר את האינדקס הייחודי אם הוא עוד לא קיים.
 *
 * בטוח להריץ בכל סבב: `IF NOT EXISTS` הופך את זה לפעולה
 * ריקה ברגע שהוא קיים.
 */
/**
 * מוריד את האינדקס הייחודי אם הוא קיים.
 *
 * בטוח להריץ בכל סבב: ברגע שהוא לא קיים זו פעולה ריקה.
 * השם נשאר זהה למה שנוצר בעדכונים הקודמים, אחרת לא היה
 * מה להוריד.
 */
export async function ensureLeadIndex(): Promise<IndexResult> {
  const { db } = await import("./db");

  if (!(await leadIndexExists())) {
    return { ok: true, absent: true };
  }

  try {
    await db.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "${LEAD_KEY_INDEX}"`
    );

    return { ok: true, removed: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "שגיאה",
    };
  }
}

/** האם האינדקס הישן עדיין קיים במסד */
export async function leadIndexExists(): Promise<boolean> {
  const { db } = await import("./db");

  try {
    const rows = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Lead' AND indexname = ${LEAD_KEY_INDEX}
    `;

    return rows.length > 0;
  } catch {
    return false;
  }
}
