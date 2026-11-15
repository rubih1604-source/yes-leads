/**
 * ============================================================
 *  אכיפת הייחודיות של טלפון + ערוץ, על המסד עצמו
 * ============================================================
 *
 *  **למה זה קיים בקובץ נפרד ולא בסכימה.**
 *
 *  הסכימה מועלית עם `prisma db push`, ופריזמה מסרבת
 *  ליצור אינדקס ייחודי **חדש** בלי `--accept-data-loss`.
 *  היא מסרבת לפני שהיא בודקת אם יש כפילויות בכלל, ולכן
 *  הבנייה נכשלה אפילו שאין אף כפילות.
 *
 *  הדגל הזה הוא לא פתרון: הוא נשאר בפקודת הבנייה לתמיד,
 *  וביום שבו תהיה טעות אמיתית בסכימה הוא ימחק עמודה עם
 *  כל הנתונים שבה **בלי לשאול ובלי להודיע**. מערכת חיה
 *  לא מקבלת דגל כזה בשביל נוחות של פעם אחת.
 *
 *  ============================================================
 *   מה שקורה כאן במקום
 *  ============================================================
 *
 *  המסד מקבל את האינדקס הייחודי ישירות, בפקודה אחת
 *  אידמפוטנטית שרצה מהמנוע. התוצאה במסד **זהה** לחלוטין
 *  למה ש-`@@unique` היה יוצר - אותה הגנה, אותו שם, אותה
 *  התנהגות - רק בלי לתת לפקודת הבנייה רישיון למחוק.
 *
 *  **למה בכלל צריך אותו.** ליד מנגר והחיבור הישיר
 *  לפייסבוק מוסרים את אותה הגשה בהפרש של שניות. בלי
 *  אכיפה במסד, שתי הקליטות יכולות לבדוק "קיים?" באותו
 *  רגע, שתיהן לקבל "לא", ושתיהן ליצור ליד - ואז אותו
 *  אדם מופיע אצלך פעמיים. האינדקס הוא מה שהופך את זה
 *  לבלתי אפשרי.
 */

/** השם שפריזמה הייתה נותנת לאינדקס הזה בעצמה */
export const LEAD_KEY_INDEX = "Lead_phone_channel_key";

export type IndexResult = {
  ok: boolean;
  created?: boolean;
  /** כבר היה קיים - זו ההצלחה השכיחה */
  existed?: boolean;
  /** יש כפילויות שמונעות את האכיפה */
  duplicates?: number;
  error?: string;
};

/**
 * יוצר את האינדקס הייחודי אם הוא עוד לא קיים.
 *
 * בטוח להריץ בכל סבב: `IF NOT EXISTS` הופך את זה לפעולה
 * ריקה ברגע שהוא קיים.
 */
export async function ensureLeadIndex(): Promise<IndexResult> {
  const { db } = await import("./db");

  /**
   * בודקים קודם אם יש כפילויות.
   *
   * בלי הבדיקה הזו ניסיון היצירה פשוט נכשל בשגיאה סתומה
   * בכל דקה, לנצח, בלי שאף אחד ידע למה. עדיף לדעת את
   * המספר ולדווח עליו.
   */
  try {
    const dups = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT phone, channel
        FROM "Lead"
        GROUP BY phone, channel
        HAVING COUNT(*) > 1
      ) d
    `;

    const count = Number(dups?.[0]?.n ?? 0);

    if (count > 0) {
      return { ok: false, duplicates: count };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "שגיאה",
    };
  }

  try {
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${LEAD_KEY_INDEX}" ON "Lead"("phone", "channel")`
    );

    return { ok: true, created: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "שגיאה",
    };
  }
}

/** האם האכיפה פעילה במסד ברגע זה - לדיווח במסך האבחון */
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
