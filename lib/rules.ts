/**
 * ============================================================
 *  מנוע החוקים
 * ============================================================
 *
 *  הרעיון: כל שינוי סטטוס - לא משנה מי עשה אותו - עובר דרך כאן.
 *  קודם מבטלים כל מה שהיה מתוזמן לליד, ואז מתזמנים מחדש לפי
 *  החוקים של הסטטוס החדש.
 */

import { db } from "./db";
import { shiftToWorkingHours } from "./working-hours";
import { queueForCallback } from "./callback-list";
import { parsePool, templateForRule } from "./template-pool";

/** מבטל את כל המשימות הממתינות של ליד. נקרא בכל שינוי ובכל תגובה. */
export async function cancelPendingJobs(leadId: string, reason: string) {
  const result = await db.scheduledJob.updateMany({
    where: { leadId, state: "pending" },
    data: { state: "cancelled", lastError: reason },
  });
  return result.count;
}

/**
 * מתזמן את כל הצעדים של הסטטוס החדש.
 * כל צעד נדחה לשעות הפעילות אם הוא נופל מחוץ להן.
 */
export async function scheduleForStatus(
  leadId: string,
  status: string,
  /**
   * מי גרם לשינוי.
   *
   * "user" - אתה שינית סטטוס בעצמך. אתה עובד עכשיו, ולכן
   * ההודעה יוצאת בדיוק אחרי העיכוב שהגדרת בחוק, גם ב-22:00.
   *
   * "bot" / "system" - שינוי אוטומטי. כאן כן מכבדים שעות
   * עבודה, כדי שרצף לא יתעורר באמצע הלילה.
   */
  actor: "user" | "system" | "bot" = "system"
) {
  // ליד מכירה לא מקבל שום אוטומציה, מאיזה מסלול שלא יגיע
  const owner = await db.lead.findUnique({
    where: { id: leadId },
    select: { origin: true },
  });
  if (owner?.origin === "sale") return 0;

  const rules = await db.rule.findMany({
    where: { triggerStatus: status, active: true },
    orderBy: { stepIndex: "asc" },
  });

  if (rules.length === 0) return 0;

  const now = Date.now();
  let created = 0;

  /**
   * האם נוצרה משימה שזמנה **עכשיו**.
   *
   * זה מה שמאפשר להריץ אותה מיד במקום לחכות לטיימר, וזו
   * הייתה הסיבה שהודעה עם עיכוב 0 יצאה אחרי כמה דקות.
   */
  let dueNow = false;

  for (const rule of rules) {
    const rawRunAt = new Date(now + rule.delayMinutes * 60000);

    /**
     * ============================================================
     *  איזו תבנית מהבנק יוצאת ללקוח הזה
     * ============================================================
     *
     *  **הבחירה נעשית עכשיו, לא ברגע השליחה.** המשימה
     *  המתוזמנת נושאת את השם הסופי, ולכן אפשר לראות
     *  מראש מה ייצא למי - במסך המשימות ובאבחון. אם
     *  הבחירה הייתה נדחית לרגע השליחה, היא הייתה נעשית
     *  במקום שני במערכת, וזה בדיוק מה שאנחנו לא עושים.
     *
     *  המונה מתקדם בכל שימוש ולכן החלוקה שווה: תבנית
     *  ראשונה, שנייה, שלישית, ושוב מהתחלה.
     */
    const pool = parsePool(rule.templatePool);
    const chosen = templateForRule(rule, rule.poolCursor);

    if (pool.length > 1) {
      await db.rule
        .update({
          where: { id: rule.id },
          data: { poolCursor: { increment: 1 } },
        })
        .catch(() => null);
    }

    /**
     * שינוי שאתה עשית יוצא בדיוק לפי העיכוב בחוק.
     * בלי דחייה לשעות פעילות ובלי הפתעות.
     */
    const runAt = actor === "user" ? rawRunAt : shiftToWorkingHours(rawRunAt);

    try {
      await db.scheduledJob.upsert({
        where: {
          leadId_ruleId_stepIndex: {
            leadId,
            ruleId: rule.id,
            stepIndex: rule.stepIndex,
          },
        },
        create: {
          leadId,
          ruleId: rule.id,
          stepIndex: rule.stepIndex,
          action: rule.action,
          templateName: chosen,
          targetStatus: rule.targetStatus,
          runAt,
        },
        update: {
          // תזמון מחדש אחרי שהסטטוס חזר לאותו ערך
          action: rule.action,
          templateName: chosen,
          targetStatus: rule.targetStatus,
          runAt,
          state: "pending",
          attempts: 0,
          lastError: null,
        },
      });
      created++;
      if (runAt.getTime() <= now) dueNow = true;
    } catch {
      // אם התזמון נכשל - ממשיכים לשאר הצעדים
    }
  }

  /**
   * ============================================================
   *  עיכוב 0 פירושו עכשיו, לא "בסבב הבא"
   * ============================================================
   *
   *  המשימה נוצרה עם זמן של עכשיו, אבל מי שמריץ אותה הוא
   *  טיימר שמתעורר כל דקה - ואחרי פריסה או התעוררות של
   *  השרת, גם הסבב הראשון מתעכב. התוצאה: "מיידי" שהגיע
   *  אחרי שלוש דקות.
   *
   *  כאן מריצים את אותו מנוע בדיוק, פעם אחת, מיד. לא
   *  מנגנון שני - אותה פונקציה שהטיימר קורא לה.
   *
   *  הייבוא דינמי כי runner מייבא את הקובץ הזה, וייבוא
   *  רגיל היה יוצר מעגל.
   */
  if (dueNow) {
    try {
      const { runDueJobs } = await import("./runner");
      await runDueJobs();
    } catch {
      // נכשל - הטיימר יתפוס את זה בסבב הבא
    }
  }

  return created;
}

/**
 * נקודת הכניסה היחידה לשינוי סטטוס.
 * משנה, מתעד, מבטל מה שהיה ומתזמן מחדש.
 */
export async function applyStatusChange(params: {
  leadId: string;
  toStatus: string;
  actor: "user" | "system" | "bot";
  note?: string;
}) {
  const lead = await db.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) return null;
  if (lead.status === params.toStatus) return lead;

  const fromStatus = lead.status;

  const updated = await db.lead.update({
    where: { id: lead.id },
    data: { status: params.toStatus },
  });

  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "status_changed",
      fromStatus,
      toStatus: params.toStatus,
      actor: params.actor,
      payload: params.note ? { note: params.note } : undefined,
    },
  });

  await cancelPendingJobs(lead.id, `הסטטוס שונה ל${params.toStatus}`);

  /**
   * סטטוס שמוגדר כמעביר לקונה מוכר את הליד כאן.
   *
   * רץ **לפני** תזמון האוטומציות, כדי שליד שעבר לקונה לא
   * יקבל ממך הודעה שנקבעה שנייה לפני ההעברה.
   */
  const { transferOnStatus } = await import("./transfer");
  const transfer = await transferOnStatus(lead.id, params.toStatus).catch(
    () => null
  );

  /**
   * וובוק יוצא, אם הוגדר לסטטוס הזה.
   *
   * שולח בלבד - לא מוכר ולא מזיז את הליד. רץ גם על ליד
   * שהועבר לקונה, כי עדכון למערכת חיצונית נכון בשני
   * המקרים.
   */
  const { fireStatusHook } = await import("./status-hook");
  await fireStatusHook(lead.id, params.toStatus).catch(() => null);

  if (transfer?.transferred) {
    // ליד של הקונה לא נכנס לאוטומציות שלך ולא לרשימת החזרה
    return updated;
  }

  await scheduleForStatus(lead.id, params.toStatus, params.actor);

  // ליד בסטטוס שדורש חזרה נכנס לרשימה של פעמיים ביום
  await queueForCallback(params.leadId, params.toStatus);

  return updated;
}

/** חוקי ברירת המחדל, לפי מה שהוגדר */
export const DEFAULT_RULES: Array<{
  triggerStatus: string;
  stepIndex: number;
  delayMinutes: number;
  action: string;
  templateName?: string;
  /** בנק תבניות מתחלפות, מופרדות בפסיק */
  templatePool?: string;
  targetStatus?: string;
  note: string;
  active: boolean;
}> = [
  /**
   * ============================================================
   *  אין מענה - ניסיון ראשון
   * ============================================================
   *
   *  שלוש תבניות בסבב שווה. הן לא אומרות אותו דבר: אחת
   *  מציעה לחזור, אחת שואלת אם רלוונטי, ואחת מזכירה
   *  שהוא השאיר פרטים. הסבב השווה הוא מה שיאפשר לדעת
   *  מי מהן מביאה יותר תגובות.
   */
  {
    triggerStatus: "אין מענה",
    stepIndex: 0,
    delayMinutes: 5,
    action: "send_template",
    templatePool: "noanswer_1,noanswer_2,noanswer_3",
    note: "שלוש תבניות מתחלפות בסבב שווה",
    active: false,
  },
  {
    triggerStatus: "אין מענה",
    stepIndex: 1,
    delayMinutes: 30,
    action: "notify",
    note: "להתקשר שוב · ניסיון 2",
    active: true,
  },

  /**
   * ============================================================
   *  אין מענה 2 - ניסיון שני
   * ============================================================
   *
   *  שתי תבניות: אחת נותנת מועד סגירה, אחת מוותרת על
   *  השיחה ומציעה להמשיך בכתב. שני מסרים שונים לגמרי,
   *  ולכן שווה למדוד מי מהם עובד.
   */
  {
    triggerStatus: "אין מענה 2",
    stepIndex: 0,
    delayMinutes: 5,
    action: "send_template",
    templatePool: "noanswer2_1,noanswer2_2",
    note: "שתי תבניות מתחלפות בסבב שווה",
    active: false,
  },
  {
    triggerStatus: "אין מענה 2",
    stepIndex: 1,
    delayMinutes: 45,
    action: "notify",
    note: "להתקשר שוב · ניסיון 3 - אחרון לפני שחרור",
    active: true,
  },

  /**
   * ============================================================
   *  פולואפ אחרי הצעת מחיר
   * ============================================================
   *
   *  **זה רצף, לא סבב.** שלוש התבניות לא מתחרות זו בזו -
   *  הן שלושה צעדים אחרי אותו לקוח: באותו יום, אחרי
   *  יומיים, ואחרי חמישה. לכן כל אחת היא צעד משלה.
   *
   *  כל צעד מתבטל ברגע שהלקוח עונה.
   */
  {
    triggerStatus: "נשלחה הצעת מחיר",
    stepIndex: 0,
    delayMinutes: 6 * 60,
    action: "send_template",
    templateName: "quote_followup_1",
    note: "אחרי 6 שעות · האם הספקת לעבור על ההצעה",
    active: false,
  },
  {
    triggerStatus: "נשלחה הצעת מחיר",
    stepIndex: 1,
    delayMinutes: 2 * 24 * 60,
    action: "send_template",
    templateName: "quote_followup_2",
    note: "אחרי יומיים · מוודא שההצעה הגיעה",
    active: false,
  },
  {
    triggerStatus: "נשלחה הצעת מחיר",
    stepIndex: 2,
    delayMinutes: 5 * 24 * 60,
    action: "send_template",
    templateName: "quote_followup_3",
    note: "אחרי 5 ימים · נתקדם או שאסגור",
    active: false,
  },
  {
    /**
     * **ההתראה היא למכירה, לא לתיעוד.**
     *
     * מי שקיבל הצעת מחיר הוא הליד הכי שווה שיש לך
     * באותו רגע. שעתיים אחרי ההצעה הוא עדיין בעניין,
     * ושיחה שלך שם שווה יותר מכל הודעה.
     */
    triggerStatus: "נשלחה הצעת מחיר",
    stepIndex: 3,
    delayMinutes: 2 * 60,
    action: "notify",
    note: "להתקשר · קיבל הצעת מחיר היום, הזמן הכי טוב לסגור",
    active: true,
  },

  /**
   * ============================================================
   *  לא מעוניין
   * ============================================================
   *
   *  **סגירה יפה היא השקעה.** לקוח שנפרד בטוב חוזר בעוד
   *  חודש; לקוח שנלחץ מבקש הסרה. לכן הצעד הראשון סוגר,
   *  והשני פותח מחדש רק אחרי שעבר מספיק זמן.
   *
   *  התבנית השלישית (notinterested_3) לא נמצאת כאן
   *  בכוונה: היא נשלחת כשיוצא מבצע חדש, ולא לפי שעון.
   */
  {
    triggerStatus: "לא מעוניין",
    stepIndex: 0,
    delayMinutes: 5,
    action: "send_template",
    templateName: "notinterested_1",
    note: "סוגר את הפנייה יפה ומשאיר דלת פתוחה",
    active: false,
  },
  {
    triggerStatus: "לא מעוניין",
    stepIndex: 1,
    delayMinutes: 30 * 24 * 60,
    action: "send_template",
    templateName: "notinterested_2",
    note: "אחרי 30 יום · בדיקה חוזרת",
    active: false,
  },

  /* ---------- חוקים קיימים ---------- */
  {
    triggerStatus: "לקוח קיים",
    stepIndex: 0,
    delayMinutes: 5,
    action: "send_template",
    templateName: "inbox_marketing_13",
    note: "אחרי 5 דקות שולח את תבנית 'לקוח קיים'",
    active: true,
  },
  {
    triggerStatus: "קיבל הצעה/פולואפ",
    stepIndex: 0,
    delayMinutes: 28 * 60,
    action: "send_template",
    templateName: "inbox_marketing_15",
    note: "אחרי 28 שעות שולח את הפולואפ",
    active: true,
  },
];
