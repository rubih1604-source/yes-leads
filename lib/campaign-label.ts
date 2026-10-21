/**
 * ============================================================
 *  שם הקמפיין שמוצג על הליד
 * ============================================================
 *
 *  **הבעיה שזה פותר**
 *
 *  ליד שמגיע מליד מנגר נושא שם קמפיין. ליד שמגיע מהחיבור
 *  הישיר לפייסבוק לא בהכרח: ההתראה מפייסבוק מכילה מזהים
 *  בלבד, ואת השמות צריך למשוך מ-Graph. משיכת **שם הקמפיין**
 *  דורשת הרשאה על חשבון המודעות; משיכת **שם הטופס** דורשת
 *  רק הרשאה על הדף.
 *
 *  לכן, כשחשבון המודעות לא משויך, שם הקמפיין לא זמין אבל
 *  שם הטופס כן - וליד בלי שום שיוך נראה כאילו הוא לא שייך
 *  לאף אחד. שם הטופס הוא שיוך אמיתי ושימושי, ולכן הוא
 *  הגיבוי.
 *
 *  הקובץ טהור בכוונה: סדר הנפילה הזה קובע מה נספר ואיפה,
 *  ולכן הוא חייב להיות מכוסה בבדיקות.
 */

export type LabelSources = {
  /** שם הקמפיין מפייסבוק - זמין רק עם הרשאת חשבון מודעות */
  fbCampaign?: string | null;
  /** שם קמפיין שהגיע בשם אחר (ליד מנגר) */
  campaign?: string | null;
  /** שם הטופס - זמין עם הרשאת הדף בלבד */
  formName?: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * סדר הנפילה: שם קמפיין אמיתי, אחר כך שם הטופס.
 *
 * מחזיר null כששום שם לא זמין - ואז התצוגה נופלת לשם
 * הערוץ, שנקבע במקום אחר.
 */
export function campaignLabel(sources: LabelSources): string | null {
  const fb = clean(sources.fbCampaign);
  if (fb) return fb;

  const plain = clean(sources.campaign);
  if (plain) return plain;

  const form = clean(sources.formName);
  if (form) return form;

  return null;
}

/**
 * האם השם שנבחר הוא שם קמפיין אמיתי או גיבוי משם הטופס.
 *
 * משמש כדי לא להתייחס לשם טופס כאילו הוא קמפיין בהתאמות
 * אוטומטיות - התאמה לפי שם צריכה להיות על שם אמיתי בלבד.
 */
export function isRealCampaignName(sources: LabelSources): boolean {
  return Boolean(clean(sources.fbCampaign) || clean(sources.campaign));
}
