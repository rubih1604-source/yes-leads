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
import { SALE_ORIGIN } from "./sales-campaigns";

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
   * ההודעה יוצאת מיד, גם ב-22:00. זו החלטה שלך.
   *
   * "bot" / "system" - השינוי קרה אוטומטית. כאן כן מכבדים
   * שעות עבודה, כדי שרצף לא יתעורר באמצע הלילה.
   */
  actor: "user" | "system" | "bot" = "system"
) {
  /**
   * ליד מכירה לא מקבל שום אוטומציה. אף פעם.
   *
   * החסימה כאן ולא רק בקליטה, כי שינוי סטטוס יכול להגיע
   * מהמסך, מייבוא, מדוח מכירות או מתיקון - וכל אחד מהם
   * היה מתזמן הודעות ללקוחות של הקונה.
   */
  const owner = await db.lead.findUnique({
    where: { id: leadId },
    select: { origin: true },
  });

  if (owner?.origin === SALE_ORIGIN) return;

  const rules = await db.rule.findMany({
    where: { triggerStatus: status, active: true },
    orderBy: { stepIndex: "asc" },
  });

  if (rules.length === 0) return 0;

  const now = Date.now();
  let created = 0;

  for (const rule of rules) {
    const rawRunAt = new Date(now + rule.delayMinutes * 60000);
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
          templateName: rule.templateName,
          targetStatus: rule.targetStatus,
          runAt,
        },
        update: {
          // תזמון מחדש אחרי שהסטטוס חזר לאותו ערך
          action: rule.action,
          templateName: rule.templateName,
          targetStatus: rule.targetStatus,
          runAt,
          state: "pending",
          attempts: 0,
          lastError: null,
        },
      });
      created++;
    } catch {
      // אם התזמון נכשל - ממשיכים לשאר הצעדים
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
   * ה-actor עובר הלאה: שינוי שאתה עשית יוצא מיד,
   * שינוי אוטומטי מכבד שעות עבודה.
   */
  await scheduleForStatus(lead.id, params.toStatus, params.actor);

  // ליד בסטטוס שדורש חזרה נכנס לרשימה של פעמיים ביום
  await queueForCallback(lead.id, params.toStatus);

  return updated;
}

/** חוקי ברירת המחדל, לפי מה שהוגדר */
export const DEFAULT_RULES: Array<{
  triggerStatus: string;
  stepIndex: number;
  delayMinutes: number;
  action: string;
  templateName?: string;
  targetStatus?: string;
  note: string;
  active: boolean;
}> = [
  {
    triggerStatus: "אין מענה",
    stepIndex: 0,
    delayMinutes: 5,
    action: "send_template",
    templateName: "inbox_marketing_1",
    note: "אחרי 5 דקות שולח את תבנית 'אין מענה'",
    active: true,
  },
  {
    triggerStatus: "אין מענה",
    stepIndex: 1,
    delayMinutes: 60,
    action: "notify",
    note: "אחרי שעה מתריע לך לנסות להשיג את הלקוח שוב",
    active: true,
  },
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
  {
    triggerStatus: "קיבל הצעה/פולואפ",
    stepIndex: 1,
    delayMinutes: 52 * 60,
    action: "send_template",
    templateName: "FOLLOWUP_2_TBD",
    note: "פולואפ שני אחרי 52 שעות - כבוי עד שתיצור את התבנית",
    active: false,
  },
  {
    triggerStatus: "קיבל הצעה/פולואפ",
    stepIndex: 2,
    delayMinutes: 53 * 60,
    action: "set_status",
    targetStatus: "אין מענה לאחר הצעת מחיר",
    note: "אם אין תגובה - מעביר לסטטוס 'אין מענה לאחר הצעת מחיר'",
    active: false,
  },
  {
    triggerStatus: "לא מעוניין",
    stepIndex: 0,
    delayMinutes: 30 * 24 * 60,
    action: "send_template",
    templateName: "REENGAGE_30D_TBD",
    note: "ריאקטיבציה אחרי 30 יום - כבוי עד שתיצור את התבנית",
    active: false,
  },
];
