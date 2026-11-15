import { db } from "./db";
import { listTemplates, parseTemplates } from "./texter";
import { Prisma } from "@prisma/client";

/**
 * ============================================================
 *  סנכרון התבניות מטקסטר
 * ============================================================
 *
 *  **למה זה עבר למקום אחד.** הסנכרון ישב בתוך נתיב ה-API
 *  בלבד, כלומר רץ רק כשלחצת על כפתור. בין לחיצה ללחיצה
 *  הרשימה המקומית התיישנה, והמערכת פעלה לפי מצב שכבר לא
 *  נכון.
 *
 *  **והכשל החמור יותר:** תבנית שנמחקה בטקסטר **נשארה
 *  אצלנו מסומנת כמאושרת לנצח**. הסנכרון רק עדכן את מה
 *  שטקסטר החזירה, ומה שנעלם משם פשוט לא נגעו בו. לכן
 *  המערכת המשיכה לשלוח תבנית שלא קיימת - וזה בדיוק
 *  "חלק מהתבניות הוא שולח וחלק לא".
 *
 *  כאן מה שנעלם מטקסטר מסומן כלא זמין, והמנוע מדלג עליו.
 */

export type SyncResult = {
  ok: boolean;
  /** כמה תבניות חזרו מטקסטר */
  count: number;
  /** כמה סומנו כלא זמינות כי נעלמו משם */
  disabled: number;
  error: string | null;
  /** התשובה הגולמית, לאבחון כשהפענוח נכשל */
  raw?: unknown;
};

export async function syncTemplates(): Promise<SyncResult> {
  const result = await listTemplates();

  if (!result.ok) {
    return {
      ok: false,
      count: 0,
      disabled: 0,
      error: result.error || "לא הצלחנו להתחבר לטקסטר",
      raw: result.raw,
    };
  }

  const templates = parseTemplates(result.raw);

  if (templates.length === 0) {
    /**
     * התחברנו ולא זוהו תבניות. **לא מסמנים כלום כלא
     * זמין** - תשובה שלא הצלחנו לפענח היא לא הוכחה
     * שאין תבניות, וסימון גורף היה משתיק את כל המערכת.
     */
    return {
      ok: false,
      count: 0,
      disabled: 0,
      error: "התחברנו לטקסטר אבל לא זוהו תבניות בתשובה",
      raw: result.raw,
    };
  }

  for (const t of templates) {
    await db.template
      .upsert({
        where: { name: t.name },
        create: {
          name: t.name,
          displayName: t.displayName,
          bodyText: t.bodyText,
          variables: t.variableCount,
          approved: t.approved,
          raw: t.raw as Prisma.InputJsonValue,
        },
        update: {
          displayName: t.displayName,
          bodyText: t.bodyText,
          variables: t.variableCount,
          approved: t.approved,
          raw: t.raw as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
      })
      .catch(() => null);
  }

  /**
   * **מה שנעלם מטקסטר.** אסור להשאיר אותו מאושר: המנוע
   * יבחר אותו בסבב, השליחה תיכשל, והליד יישאר בלי הודעה.
   *
   * לא מוחקים את השורה - היא מקושרת לחוקים ולהודעות
   * היסטוריות, ומחיקה הייתה מוחקת את המדידה איתה.
   */
  const live = templates.map((t) => t.name);

  const disabled = await db.template
    .updateMany({
      where: { name: { notIn: live }, approved: true },
      data: { approved: false, syncedAt: new Date() },
    })
    .catch(() => ({ count: 0 }));

  return {
    ok: true,
    count: templates.length,
    disabled: disabled.count,
    error: null,
  };
}

/** כמה דקות בין סנכרונים אוטומטיים */
export const SYNC_EVERY_MINUTES = 60;

/**
 * סנכרון אוטומטי, אם עבר מספיק זמן.
 *
 * **למה זה רץ מהמנוע.** בלי זה הרשימה מתעדכנת רק בלחיצת
 * כפתור, ותבנית שמטא השהתה אתמול ממשיכה להיבחר היום.
 *
 * כישלון כאן לא עוצר כלום: הוא מוחזר ונרשם, והמנוע
 * ממשיך לעבוד עם מה שיש.
 */
export async function syncTemplatesIfStale(): Promise<SyncResult | null> {
  const newest = await db.template
    .findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } })
    .catch(() => null);

  if (newest) {
    const minutes = (Date.now() - newest.syncedAt.getTime()) / 60000;
    if (minutes < SYNC_EVERY_MINUTES) return null;
  }

  return syncTemplates();
}
