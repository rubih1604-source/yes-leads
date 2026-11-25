/**
 * ============================================================
 *  הסוכן הבודק - "מה שהוגדר, באמת קרה?"
 * ============================================================
 *
 *  **למה זה קיים.**
 *
 *  כל התקלות הכואבות במערכת הזו חלקו תכונה אחת: הן לא
 *  נכשלו. הן **פשוט לא קרו**. חוק הוגדר כמו שצריך, המשימה
 *  נרשמה כמו שצריך, המסך הראה מצב תקין - ואף הודעה לא
 *  יצאה. אין שגיאה, אין לוג אדום, אין למה להסתכל.
 *
 *  בדיקה שמסתכלת על **ההגדרות** לא תתפוס את זה לעולם, כי
 *  ההגדרות תקינות. רק בדיקה שמסתכלת על **העובדות** תתפוס:
 *  יש חוק שאומר "אחרי 5 שעות שלח" - האם לפני 5 שעות ומשהו
 *  באמת יצאה הודעה?
 *
 *  ============================================================
 *   שלושה כללים שהסוכן הזה בנוי לפיהם
 *  ============================================================
 *
 *  **1. הוא בודק תוצאות, לא כוונות.** כל בדיקה שואלת על
 *  משהו שאפשר למדוד במסד: משימה שעבר זמנה, סטטוס שהשתנה
 *  בלי שנוצרה לו משימה, מנוע ששותק.
 *
 *  **2. הוא מתקן דרך אותן פונקציות.** הוא לא שולח הודעות
 *  בעצמו ולא יוצר משימות בעצמו - הוא קורא בדיוק לאותו
 *  קוד שהמערכת קוראת לו. סוכן שמתקן במסלול משלו הוא
 *  מנגנון שני, וזה בדיוק מה שיצר את הבעיות מלכתחילה.
 *
 *  **3. מה שהוא לא יכול לתקן, הוא צועק.** בשקט אין ערך.
 *  תקלה שהוא לא יודע לפתור נכנסת לפעמון עם שם, מספר
 *  והסבר - פעם ביום, כדי שלא יהפוך לרעש.
 */

export type Severity = "high" | "medium" | "low";

export type Finding = {
  /** מזהה קבוע לבדיקה, לדה-דופליקציה של התראות */
  code: string;
  title: string;
  detail: string;
  severity: Severity;
  /** כמה פריטים נמצאו */
  count: number;
  /** מה הסוכן עשה בפועל */
  fixed: number;
  /** האם נדרשת התערבות שלך */
  needsYou: boolean;
};

export type WatchdogResult = {
  at: Date;
  checked: number;
  findings: Finding[];
  error?: string;
};

/** משימה שעבר זמנה ביותר מזה נחשבת תקועה */
const JOB_LATE_MINUTES = 10;

/** מנוע ששותק יותר מזה אינו עובד */
const ENGINE_SILENT_MINUTES = 15;

/** שליחה לקונה שתקועה יותר מזה */
const DELIVERY_LATE_MINUTES = 30;

/* ============================================================
 *  1. משימות שעבר זמנן ולא רצו
 * ========================================================= */

/**
 * **זו הבדיקה המרכזית, וזה המקרה שלך בדיוק.**
 *
 * שינית סטטוס ל"נשלחה הצעת מחיר", החוק אמר לשלוח אחרי 5
 * שעות, המשימה נרשמה - ואז שום דבר. המשימה יושבת במסד
 * במצב `pending` עם זמן שעבר, ואף אחד לא מסתכל.
 *
 * התיקון הוא להריץ את המנוע. לא לשלוח ישירות - **להריץ
 * את אותו מנוע** שהיה אמור לרוץ.
 */
async function checkLateJobs(): Promise<Finding | null> {
  const { db } = await import("./db");

  const cutoff = new Date(Date.now() - JOB_LATE_MINUTES * 60_000);

  const late = await db.scheduledJob
    .findMany({
      where: { state: "pending", runAt: { lte: cutoff } },
      select: { id: true, action: true, templateName: true, runAt: true },
      orderBy: { runAt: "asc" },
      take: 200,
    })
    .catch(() => []);

  if (late.length === 0) return null;

  /** מריצים את המנוע - אותה דלת, לא מסלול עוקף */
  let fixed = 0;

  try {
    const { runDueJobs } = await import("./runner");
    const summary = await runDueJobs(200);
    fixed = summary.sent + summary.statusChanged + summary.notified;
  } catch {
    /** נכשל - נדווח, וזה מה שחשוב */
  }

  const stillLate = await db.scheduledJob
    .count({ where: { state: "pending", runAt: { lte: cutoff } } })
    .catch(() => late.length);

  const oldest = late[0]?.runAt;

  const minutes = oldest
    ? Math.round((Date.now() - oldest.getTime()) / 60_000)
    : 0;

  return {
    code: "late_jobs",
    title: `${late.length} משימות שעבר זמנן`,
    detail:
      `הוותיקה מחכה ${minutes} דקות.` +
      (fixed > 0 ? ` הרצתי את המנוע: ${fixed} בוצעו.` : "") +
      (stillLate > 0
        ? ` ${stillLate} עדיין תקועות - כנראה תבנית שבורה או טקסטר לא מגיב.`
        : " הכל השלים."),
    severity: stillLate > 0 ? "high" : "low",
    count: late.length,
    fixed: late.length - stillLate,
    needsYou: stillLate > 0,
  };
}

/* ============================================================
 *  2. סטטוס שיש לו חוק, ולא נוצרה לו משימה
 * ========================================================= */

/**
 * השלב שלפני הקודם: לא "המשימה לא רצה" אלא **"המשימה לא
 * נוצרה בכלל"**.
 *
 * זה קורה כשהתזמון נכשל בשקט - למשל כי לא הייתה תבנית
 * תקינה, או כי משהו באמצע זרק שגיאה. מבחוץ זה נראה זהה:
 * שינית סטטוס, כלום לא קרה.
 *
 * התיקון: לקרוא ל-`scheduleForStatus` - בדיוק מה שהיה
 * אמור לקרות.
 */
async function checkMissingJobs(): Promise<Finding | null> {
  const { db } = await import("./db");

  const rules = await db.rule
    .findMany({
      where: { active: true },
      select: { triggerStatus: true },
      distinct: ["triggerStatus"],
    })
    .catch(() => []);

  if (rules.length === 0) return null;

  const statuses = rules.map((r) => r.triggerStatus);

  /**
   * רק לידים שהסטטוס שלהם השתנה ביממה האחרונה.
   *
   * אחורה מזה זו היסטוריה, ותזמון רטרואקטיבי שלה היה
   * מציף לקוחות ישנים בהודעות. זו בדיקה, לא מכונת זמן.
   */
  const since = new Date(Date.now() - 24 * 60 * 60_000);

  const { MINE_CHANNEL } = await import("./channel");

  const leads = await db.lead
    .findMany({
      where: {
        status: { in: statuses },
        channel: MINE_CHANNEL,
        updatedAt: { gte: since },
      },
      select: { id: true, status: true },
      take: 300,
    })
    .catch(() => []);

  const missing: Array<{ id: string; status: string }> = [];

  for (const lead of leads) {
    const has = await db.scheduledJob
      .count({ where: { leadId: lead.id } })
      .catch(() => 1);

    if (has === 0) missing.push(lead);
  }

  if (missing.length === 0) return null;

  let fixed = 0;

  try {
    const { scheduleForStatus } = await import("./rules");

    for (const lead of missing) {
      const created = await scheduleForStatus(lead.id, lead.status).catch(
        () => 0
      );
      if (created > 0) fixed++;
    }
  } catch {
    /** נדווח */
  }

  return {
    code: "missing_jobs",
    title: `${missing.length} לידים בסטטוס עם חוק, בלי משימה`,
    detail:
      `הסטטוס שלהם מפעיל חוק, אבל לא נוצרה להם שום משימה.` +
      (fixed > 0
        ? ` תוזמנו מחדש: ${fixed}.`
        : " התזמון מחדש לא הצליח - כנראה אין תבנית תקינה לחוק."),
    severity: fixed === missing.length ? "low" : "high",
    count: missing.length,
    fixed,
    needsYou: fixed < missing.length,
  };
}

/* ============================================================
 *  3. המנוע שותק
 * ========================================================= */

/**
 * אם המנוע לא השלים סבב בזמן סביר, **כל** האוטומציות
 * מתות - לא רק אחת. זו הבדיקה שהייתה תופסת את התקיעה
 * שהשתיקה את המערכת.
 */
async function checkEngineAlive(): Promise<Finding | null> {
  const { db } = await import("./db");

  /**
   * `engineRanAt` נרשם בסוף **כל** סבב, גם סבב ריק.
   *
   * זה הדופק המדויק. הסקה מ"מתי רצה משימה לאחרונה" הייתה
   * מבלבלת "אין מה לעשות" עם "המנוע מת" - שני מצבים
   * הפוכים לגמרי.
   */
  const settings = await db.settings
    .findFirst({ select: { engineRanAt: true, engineError: true } })
    .catch(() => null);

  if (!settings?.engineRanAt) return null;

  const minutes = Math.round(
    (Date.now() - settings.engineRanAt.getTime()) / 60_000
  );

  if (minutes < ENGINE_SILENT_MINUTES) return null;

  /**
   * יש משימות שמחכות? אז השקט הוא תקלה. אין? אז פשוט
   * לא היה מה לעשות, וזה תקין לגמרי.
   */
  const waiting = await db.scheduledJob
    .count({ where: { state: "pending", runAt: { lte: new Date() } } })
    .catch(() => 0);

  if (waiting === 0) return null;

  let fixed = 0;

  try {
    const { runDueJobs } = await import("./runner");
    const summary = await runDueJobs(200);
    fixed = summary.sent + summary.statusChanged + summary.notified;
  } catch {
    /** נדווח */
  }

  return {
    code: "engine_silent",
    title: "המנוע לא עבד",
    detail:
      `${minutes} דקות בלי שום משימה שרצה, בזמן ש-${waiting} מחכות.` +
      (fixed > 0 ? ` הערתי אותו: ${fixed} בוצעו.` : " ההערה לא עזרה."),
    severity: fixed > 0 ? "medium" : "high",
    count: waiting,
    fixed,
    needsYou: fixed === 0,
  };
}

/* ============================================================
 *  4. חוק שמצביע על תבנית שלא קיימת
 * ========================================================= */

/**
 * חוק שמוגדר יפה ומצביע על תבנית שנמחקה בטקסטר או לא
 * אושרה **לא ישלח לעולם**, והמסך יראה חוק פעיל ותקין.
 *
 * את זה אי אפשר לתקן אוטומטית - צריך תבנית. לכן זו
 * התראה, ובשם המדויק של החוק והתבנית.
 */
async function checkRuleTemplates(): Promise<Finding | null> {
  const { db } = await import("./db");

  const rules = await db.rule
    .findMany({
      where: { active: true, action: "send_template" },
      select: {
        triggerStatus: true,
        templateName: true,
        templatePool: true,
      },
    })
    .catch(() => []);

  if (rules.length === 0) return null;

  const templates = await db.template
    .findMany({ select: { name: true, approved: true } })
    .catch(() => []);

  /** טבלה ריקה = לא סונכרן עדיין, לא ראיה לכלום */
  if (templates.length === 0) return null;

  const usable = new Set(
    templates.filter((t) => t.approved).map((t) => t.name)
  );

  const broken: string[] = [];

  for (const rule of rules) {
    const names = [
      ...(rule.templatePool?.split(",") ?? []),
      rule.templateName ?? "",
    ]
      .map((n) => n.trim())
      .filter(Boolean);

    if (names.length === 0) continue;

    /** החוק שבור רק אם **אף** תבנית שלו אינה זמינה */
    if (!names.some((n) => usable.has(n))) {
      broken.push(`${rule.triggerStatus} → ${names.join(", ")}`);
    }
  }

  if (broken.length === 0) return null;

  return {
    code: "broken_rules",
    title: `${broken.length} חוקים לא יכולים לשלוח`,
    detail: `אף תבנית שלהם אינה קיימת בטקסטר או מאושרת: ${broken
      .slice(0, 4)
      .join(" · ")}. צריך לאשר אותן בטקסטר או להחליף בחוק.`,
    severity: "high",
    count: broken.length,
    fixed: 0,
    needsYou: true,
  };
}

/* ============================================================
 *  5. העברות לקונה שתקועות
 * ========================================================= */

async function checkDeliveries(): Promise<Finding | null> {
  const { db } = await import("./db");

  const cutoff = new Date(Date.now() - DELIVERY_LATE_MINUTES * 60_000);

  const stuck = await db.leadDelivery
    .count({
      where: { state: "pending", nextTryAt: { lte: cutoff } },
    })
    .catch(() => 0);

  if (stuck === 0) return null;

  let fixed = 0;

  try {
    const { runDeliveries } = await import("./delivery");
    fixed = await runDeliveries(100);
  } catch {
    /** נדווח */
  }

  return {
    code: "stuck_deliveries",
    title: `${stuck} העברות לקונה תקועות`,
    detail:
      `מחכות יותר מ-${DELIVERY_LATE_MINUTES} דקות.` +
      (fixed > 0 ? ` נשלחו: ${fixed}.` : " הניסיון לא הצליח."),
    severity: fixed > 0 ? "low" : "high",
    count: stuck,
    fixed,
    needsYou: fixed === 0,
  };
}

/* ============================================================
 *  6. סטטוס שאתה משתמש בו, וכל החוקים שלו כבויים
 * ========================================================= */

/**
 * **הכשל שזה סוגר, והוא הכשל שחזר הכי הרבה פעמים.**
 *
 *  חוקי ברירת המחדל נכנסים **כבויים** בכוונה - מערכת
 *  שעובדת לא אמורה להתחיל לשלוח הודעות בגלל פעולת
 *  תחזוקה. אבל התוצאה בשטח הייתה שאתה משנה סטטוס, מחכה
 *  להודעה אחרי 5 שעות, והיא לא מגיעה לעולם - בלי שום
 *  שגיאה, כי מבחינת המערכת הכל תקין.
 *
 *  הבדיקה מצטלבת בין **סטטוסים שאתה באמת משתמש בהם**
 *  לבין חוקים כבויים. סטטוס שלא נגעת בו כבר חודש לא
 *  מעניין אותך, וחוק כבוי שלו הוא לא תקלה.
 *
 *  הסוכן **לא מדליק אותם לבד**: הדלקה אוטומטית הייתה
 *  מתחילה לשלוח הודעות ללקוחות בלי שביקשת. זו החלטה
 *  שלך, והתפקיד שלו הוא להגיד לך שהיא ממתינה.
 */
async function checkDisabledRules(): Promise<Finding | null> {
  const { db } = await import("./db");

  const since = new Date(Date.now() - 14 * 24 * 60 * 60_000);

  /** סטטוסים ששינית אליהם בשבועיים האחרונים */
  const used = await db.leadEvent
    .findMany({
      where: { type: "status_changed", createdAt: { gte: since } },
      select: { toStatus: true },
      distinct: ["toStatus"],
      take: 60,
    })
    .catch(() => []);

  const names = used
    .map((e) => e.toStatus)
    .filter((n): n is string => Boolean(n));

  if (names.length === 0) return null;

  const rules = await db.rule
    .findMany({
      where: { triggerStatus: { in: names } },
      select: { triggerStatus: true, active: true, note: true },
    })
    .catch(() => []);

  if (rules.length === 0) return null;

  const byStatus = new Map<string, { on: number; off: string[] }>();

  for (const r of rules) {
    const entry = byStatus.get(r.triggerStatus) ?? { on: 0, off: [] };
    if (r.active) entry.on++;
    else entry.off.push(r.note);
    byStatus.set(r.triggerStatus, entry);
  }

  /** רק סטטוס שכל חוקיו כבויים - סטטוס עם חוק אחד פעיל עובד */
  const silent = [...byStatus.entries()].filter(
    ([, v]) => v.on === 0 && v.off.length > 0
  );

  if (silent.length === 0) return null;

  return {
    code: "disabled_rules",
    title: `${silent.length} סטטוסים שאתה משתמש בהם לא שולחים כלום`,
    detail:
      silent
        .slice(0, 4)
        .map(([status, v]) => `"${status}" (${v.off.length} חוקים כבויים)`)
        .join(" · ") +
      '. מסך "חוקים" → להדליק. הסוכן לא מדליק לבד כדי שלא יתחילו לצאת הודעות בלי שביקשת.',
    severity: "high",
    count: silent.length,
    fixed: 0,
    needsYou: true,
  };
}

/* ============================================================
 *  ההרצה
 * ========================================================= */

const CHECKS = [
  checkEngineAlive,
  checkLateJobs,
  checkMissingJobs,
  checkRuleTemplates,
  checkDisabledRules,
  checkDeliveries,
];

/**
 * מריץ את כל הבדיקות, מתקן מה שאפשר, ומתריע על השאר.
 *
 * כל בדיקה עטופה בנפרד: בדיקה שנפלה לא מבטלת את השאר -
 * אחרת סוכן שנועד לתפוס שקט היה הופך בעצמו לשקט.
 */
export async function runWatchdog(): Promise<WatchdogResult> {
  const findings: Finding[] = [];

  for (const check of CHECKS) {
    try {
      const found = await check();
      if (found) findings.push(found);
    } catch (err) {
      findings.push({
        code: "check_failed",
        title: "בדיקה נכשלה",
        detail: err instanceof Error ? err.message.slice(0, 200) : "שגיאה",
        severity: "medium",
        count: 1,
        fixed: 0,
        needsYou: true,
      });
    }
  }

  await raiseAlerts(findings);

  return { at: new Date(), checked: CHECKS.length, findings };
}

/**
 * מה שהסוכן לא פתר נכנס לפעמון.
 *
 * פעם ביממה לכל סוג תקלה: התראה שחוזרת כל דקה היא התראה
 * שמפסיקים לקרוא, וזה חוזר להיות שקט.
 */
async function raiseAlerts(findings: Finding[]): Promise<void> {
  const { db } = await import("./db");

  for (const f of findings) {
    if (!f.needsYou) continue;

    const title = `בדיקת מערכת: ${f.title}`;

    const recent = await db.alert
      .findFirst({
        where: {
          title,
          createdAt: { gte: new Date(Date.now() - 20 * 60 * 60_000) },
        },
        select: { id: true },
      })
      .catch(() => null);

    if (recent) continue;

    await db.alert.create({ data: { title, body: f.detail } }).catch(() => null);
  }
}
