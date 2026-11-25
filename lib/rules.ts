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
  /**
   * ============================================================
   *  כל יציאה מהפונקציה הזו נרשמת
   * ============================================================
   *
   *  **זה התיקון האמיתי, ולא עוד תיקון נקודתי.**
   *
   *  עד עכשיו היו כאן חמש דרכים לצאת בלי לשלוח כלום,
   *  וארבע מהן לא השאירו שום עקבה: ליד של מכירה, אין
   *  חוק, החוק כבוי, והכי גרוע - `catch` ריק סביב יצירת
   *  המשימה, שבלע כל תקלה בלי מילה.
   *
   *  **התוצאה בשטח הייתה תמיד אותה תוצאה:** שינית סטטוס,
   *  לא קרה כלום, ואף אחד לא ידע להגיד למה. לא אתה, ולא
   *  המערכת. זו הסיבה שהנושא הזה חוזר כבר חודשיים - לא
   *  כי התיקון לא עבד, אלא כי לא היה מה לבדוק.
   *
   *  מעכשיו כל החלטה נרשמת על הליד עצמו. אם לא נשלח
   *  כלום - הסיבה כתובה שם, בשורה אחת, במקום שבו אתה
   *  כבר עומד.
   */
  const decisions: string[] = [];
  let created = 0;

  const receipt = async (conclusion: string) => {
    await db.leadEvent
      .create({
        data: {
          leadId,
          type: "rules_evaluated",
          toStatus: status,
          actor,
          payload: { conclusion, decisions, created },
        },
      })
      .catch(() => null);
  };

  // ליד מכירה לא מקבל שום אוטומציה, מאיזה מסלול שלא יגיע
  const owner = await db.lead.findUnique({
    where: { id: leadId },
    select: { origin: true, channel: true },
  });

  if (owner?.origin === "sale") {
    /**
     * **הסתירה הזו כבר קרתה.** ליד שיושב ברשימה שלך
     * (channel "mine") אבל נושא origin של מכירה נראה
     * לגמרי רגיל במסך - ושקט לחלוטין באוטומציות.
     *
     * זה בדיוק המקרה שאי אפשר היה לאבחן בלי השורה הזו.
     */
    const contradiction = owner.channel !== "sale";

    await receipt(
      contradiction
        ? `הליד מסומן origin="sale" אבל יושב בערוץ "${owner.channel}" - סתירה. בגללה הוא לא מקבל אוטומציות למרות שהוא ברשימה שלך.`
        : "ליד של מכירת לידים - לא מקבל אוטומציות בכוונה."
    );

    if (contradiction) {
      await db.alert
        .create({
          data: {
            leadId,
            title: "ליד ברשימה שלך שלא יקבל אף הודעה",
            body: `הליד מסומן כליד מכירה (origin) אבל יושב בערוץ "${owner.channel}". כל שינוי סטטוס שלו לא ישלח כלום. תחזוקה → "תיקון שיוך לידים".`,
          },
        })
        .catch(() => null);
    }

    return 0;
  }

  const rules = await db.rule.findMany({
    where: { triggerStatus: status },
    orderBy: { stepIndex: "asc" },
  });

  if (rules.length === 0) {
    await receipt(`אין אף חוק מוגדר לסטטוס "${status}".`);
    return 0;
  }

  /**
   * ============================================================
   *  חוק כבוי הוא סיבה, לא "אין חוק"
   * ============================================================
   *
   *  קודם השאילתה סיננה `active: true`, ולכן חוק כבוי
   *  נראה בדיוק כמו חוק שלא קיים - ושניהם יצאו בשקט.
   *
   *  **זו הטעות הכי יקרה כאן**, כי חוקי ברירת המחדל של
   *  "נשלחה הצעת מחיר" נכנסים כבויים בכוונה: מערכת
   *  שעובדת לא אמורה להתחיל לשלוח הודעות בגלל פעולת
   *  תחזוקה. אבל אם אף אחד לא אומר לך שהם כבויים, אתה
   *  מחכה להודעה שלא תגיע לעולם.
   */
  const off = rules.filter((r) => !r.active);
  const active = rules.filter((r) => r.active);

  if (active.length === 0) {
    await receipt(
      `יש ${off.length} חוקים לסטטוס "${status}" וכולם כבויים. הדלק אותם במסך "חוקים" כדי שישלחו.`
    );

    await db.alert
      .create({
        data: {
          leadId,
          title: `הסטטוס "${status}" לא שולח כלום - החוקים כבויים`,
          body: `${off.map((r) => r.note).join(" · ")}. מסך "חוקים" → להדליק.`,
        },
      })
      .catch(() => null);

    return 0;
  }

  if (off.length > 0) {
    decisions.push(
      `${off.length} חוקים כבויים ולכן לא רצים: ${off.map((r) => r.note).join(" · ")}`
    );
  }

  const now = Date.now();

  /**
   * האם נוצרה משימה שזמנה **עכשיו**.
   *
   * זה מה שמאפשר להריץ אותה מיד במקום לחכות לטיימר, וזו
   * הייתה הסיבה שהודעה עם עיכוב 0 יצאה אחרי כמה דקות.
   */
  let dueNow = false;

  /**
   * ============================================================
   *  אילו תבניות באמת ניתנות לשליחה
   * ============================================================
   *
   *  **הכשל שזה סוגר:** "חלק מהתבניות הוא שולח וחלק לא."
   *
   *  בנק של שלוש תבניות מתחלף בסבב, ואם אחת לא קיימת
   *  בטקסטר או לא מאושרת - כל ליד שלישי לא קיבל כלום.
   *  הדפוס נראה אקראי כי הוא תלוי רק במונה הסבב.
   *
   *  נטען פעם אחת לכל הקריאה ולא פעם לכל חוק.
   */
  const templateRows = await db.template
    .findMany({ select: { name: true, approved: true } })
    .catch(() => []);

  const usableNames = new Set(
    templateRows.filter((t) => t.approved).map((t) => t.name)
  );

  /**
   * טבלה ריקה פירושה שהתבניות עוד לא סונכרנו, ולא
   * שכולן שבורות. במצב כזה לא חוסמים כלום - אחרת
   * סנכרון שלא רץ היה משתיק את כל המערכת.
   */
  const isUsable = (name: string) =>
    templateRows.length === 0 ? true : usableNames.has(name);

  for (const rule of active) {
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
    const picked = templateForRule(rule, rule.poolCursor, isUsable);
    const chosen = picked.chosen;

    /**
     * תבנית שדולגה היא תקלה שצריך לתקן, ולכן היא מתועדת -
     * אחרת החלפנו כשל גלוי בכשל שקט.
     */
    if (picked.skipped.length > 0) {
      decisions.push(
        `שלב ${rule.stepIndex}: דולגו תבניות ${picked.skipped.join(", ")}, נבחרה ${chosen ?? "—"}`
      );

      await db.leadEvent
        .create({
          data: {
            leadId,
            type: "template_skipped",
            actor: "system",
            payload: {
              status: rule.triggerStatus,
              skipped: picked.skipped,
              used: chosen,
            },
          },
        })
        .catch(() => null);
    }

    /**
     * אין אף תבנית תקינה בחוק הזה. **לא שולחים שבורה** -
     * זה ייכשל ממילא ויסתיר את הסיבה. מתריעים בשם
     * הסטטוס ובשם התבניות, וממשיכים לחוק הבא.
     */
    if (rule.action === "send_template" && !chosen) {
      decisions.push(
        `שלב ${rule.stepIndex}: אין אף תבנית תקינה (${picked.skipped.join(", ")}) - לא נשלח כלום`
      );

      await db.alert
        .create({
          data: {
            leadId,
            title: `אין תבנית תקינה לסטטוס "${rule.triggerStatus}"`,
            body: `התבניות ${picked.skipped.join(", ")} לא קיימות בטקסטר או לא מאושרות. אבחון → "למה סטטוס לא שולח".`,
          },
        })
        .catch(() => null);
      continue;
    }

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
      decisions.push(
        `שלב ${rule.stepIndex}: תוזמן ל-${runAt.toLocaleString("he-IL", {
          timeZone: "Asia/Jerusalem",
        })}${chosen ? ` · ${chosen}` : ""}`
      );
      if (runAt.getTime() <= now) dueNow = true;
    } catch (err) {
      /**
       * ============================================================
       *  כאן היה `catch` ריק
       * ============================================================
       *
       *  **זה היה הכשל הכי שקט במערכת.** אם יצירת המשימה
       *  נכשלה - חיבור שנפל, התנגשות, כל דבר - השגיאה
       *  נבלעה, הלולאה המשיכה, והליד נשאר בלי שום משימה
       *  ובלי שום סימן שמשהו קרה.
       *
       *  שינית סטטוס, לא הגיעה הודעה, ולא היה שום מקום
       *  לבדוק בו. מעכשיו זה נרשם ומתריע.
       */
      const message = err instanceof Error ? err.message : String(err);

      decisions.push(`שלב ${rule.stepIndex}: התזמון נכשל - ${message}`);

      await db.alert
        .create({
          data: {
            leadId,
            title: `תזמון נכשל בסטטוס "${status}"`,
            body: `שלב ${rule.stepIndex} (${rule.note}) לא תוזמן: ${message}. ההודעה הזו לא תצא בלי התערבות.`,
          },
        })
        .catch(() => null);
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

  /**
   * הקבלה: מה הוחלט, ולמה. נרשמת תמיד, גם כשהכל עבד -
   * כי "עבד" שאי אפשר להוכיח הוא בדיוק מה שהחזיר אותנו
   * לכאן שוב ושוב.
   */
  await receipt(
    created > 0
      ? `תוזמנו ${created} משימות לסטטוס "${status}".`
      : `לא תוזמנה אף משימה לסטטוס "${status}" למרות ש-${active.length} חוקים פעילים.`
  );

  if (created === 0) {
    await db.alert
      .create({
        data: {
          leadId,
          title: `שינוי סטטוס שלא יצר שום פעולה`,
          body: `הסטטוס שונה ל"${status}", יש ${active.length} חוקים פעילים, ולא נוצרה אף משימה. ${decisions.join(" · ")}`,
        },
      })
      .catch(() => null);
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
