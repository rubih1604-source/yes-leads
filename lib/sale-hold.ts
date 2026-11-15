/**
 * ============================================================
 *  עצירת העברות לקונה - לידים של שבת
 * ============================================================
 *
 *  **מה שזה פותר.** ליד שנכנס בשבת עובר לקונה אוטומטית
 *  באותו רגע, בזמן שאתה לא עובד. אתה רוצה שהוא ייכנס
 *  למערכת כרגיל, אבל **לא ייצא** עד שתחליט - ושרגע
 *  ההעברה יהיה הרגע שבו שחררת, לא הרגע שבו הוא נכנס.
 *
 *  ============================================================
 *   למה זה נבנה ככה דווקא
 *  ============================================================
 *
 *  הדרך הקלה הייתה לא לרשום את השליחה בכלל, ואז "לייצר"
 *  אותה במוצאי שבת. זה היה מנגנון שני במקביל לקיים - בדיוק
 *  מה שגרם לכל הבלגן הקודם: שני מסלולים שאפשר שיתפצלו.
 *
 *  במקום זה: השליחה נרשמת בדיוק כמו תמיד, באותה טבלה,
 *  עם אותו מטען ואותה הגנה מפני כפילות - רק במצב "held"
 *  במקום "pending". המנוע שולח רק "pending", ולכן היא
 *  פשוט מחכה. שחרור = החלפת מילה אחת.
 *
 *  **מה זה לא נוגע בו, וזה העיקר:**
 *   - הקליטה: הליד נכנס, נספר, מתויג, מופיע - כרגיל
 *   - הערוץ והמחיר: נחתמים בהגעה, לא בשליחה
 *   - הקונה: מקבל בדיוק אותו מטען, רק מאוחר יותר
 *   - כשהמתג כבוי: אין שום הבדל מהיום. אפס.
 *
 *  **רגע ההעברה.** המטען שנשלח לקונה נושא את `createdAt`
 *  של השליחה. לכן השחרור דורך אותו מחדש לעכשיו - וזה
 *  בדיוק "הנקודת זמן היא הרגע שהעברתי". מועד הקליטה
 *  האמיתי נשאר שמור על הכניסה, על הליד ועל heldAt.
 */

/** המצב שבו שליחה מחכה לשחרור ידני */
export const HELD_STATE = "held";

export type HoldState = {
  on: boolean;
  since: Date | null;
  /** כמה שליחות מחכות ברגע זה */
  waiting: number;
  /** כמה לידים שונים הן מייצגות */
  leads: number;
};

/** האם העצירה פעילה כרגע */
export async function isHolding(): Promise<boolean> {
  const { db } = await import("./db");

  const row = await db.settings
    .findUnique({
      where: { id: "main" },
      select: { holdSaleTransfers: true },
    })
    .catch(() => null);

  return row?.holdSaleTransfers === true;
}

/** המצב המלא, למסך */
export async function holdState(): Promise<HoldState> {
  const { db } = await import("./db");

  const row = await db.settings
    .findUnique({
      where: { id: "main" },
      select: { holdSaleTransfers: true, holdSaleSince: true },
    })
    .catch(() => null);

  const held = await db.leadDelivery
    .findMany({
      where: { state: HELD_STATE },
      select: { leadId: true },
    })
    .catch(() => []);

  return {
    on: row?.holdSaleTransfers === true,
    since: row?.holdSaleSince ?? null,
    waiting: held.length,
    leads: new Set(held.map((d) => d.leadId)).size,
  };
}

/** מדליק את העצירה. לא נוגע בשום דבר שכבר יצא */
export async function startHold(): Promise<HoldState> {
  const { db } = await import("./db");

  await db.settings
    .upsert({
      where: { id: "main" },
      create: {
        id: "main",
        holdSaleTransfers: true,
        holdSaleSince: new Date(),
      },
      update: { holdSaleTransfers: true, holdSaleSince: new Date() },
    })
    .catch(() => null);

  return holdState();
}

/**
 * ============================================================
 *  הגנה מפני עצירה ששכחת לכבות
 * ============================================================
 *
 *  **הסיכון היחיד במנגנון הזה.** עצירה היא כלי שימושי
 *  בדיוק עד הרגע שבו שוכחים אותה דלוקה: אז לידים שילמת
 *  עליהם יושבים ולא יוצאים, והמסך נראה תקין.
 *
 *  לכן אחרי 30 שעות - יותר משבת שלמה, פחות מיומיים -
 *  נכנסת התראה לפעמון. פעם ביממה, לא בכל דקה.
 */
export const STUCK_HOLD_HOURS = 30;

export async function warnIfStuck(): Promise<boolean> {
  const { db } = await import("./db");

  const row = await db.settings
    .findUnique({
      where: { id: "main" },
      select: { holdSaleTransfers: true, holdSaleSince: true },
    })
    .catch(() => null);

  if (!row?.holdSaleTransfers || !row.holdSaleSince) return false;

  const hours =
    (Date.now() - row.holdSaleSince.getTime()) / (60 * 60 * 1000);

  if (hours < STUCK_HOLD_HOURS) return false;

  const waiting = await db.leadDelivery
    .count({ where: { state: HELD_STATE } })
    .catch(() => 0);

  const title = "העברות לקונה עדיין עצורות";

  /** כבר התרענו ביממה האחרונה - לא מציפים את הפעמון */
  const recent = await db.alert
    .findFirst({
      where: {
        title,
        createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
      },
      select: { id: true },
    })
    .catch(() => null);

  if (recent) return false;

  await db.alert
    .create({
      data: {
        title,
        body: `העצירה דלוקה ${Math.round(hours)} שעות${
          waiting ? ` · ${waiting} העברות מחכות` : ""
        }. אם סיימת - שחרר אותן מהמסך הראשי.`,
      },
    })
    .catch(() => null);

  return true;
}

export type ReleaseResult = {
  released: number;
  leads: number;
  error?: string;
};

/**
 * מכבה את העצירה ומשחרר את כל מה שחיכה.
 *
 * `keepOff` מאפשר לשחרר בלי לכבות - למשל לשחרר ליד בודד
 * באמצע שבת - אבל ברירת המחדל היא מה שאתה עושה במוצאי
 * שבת: לכבות ולשחרר הכל.
 */
export async function releaseHeld(
  args: { turnOff?: boolean; leadId?: string } = {}
): Promise<ReleaseResult> {
  const { db } = await import("./db");

  const turnOff = args.turnOff !== false && !args.leadId;

  if (turnOff) {
    await db.settings
      .upsert({
        where: { id: "main" },
        create: { id: "main", holdSaleTransfers: false, holdSaleSince: null },
        update: { holdSaleTransfers: false, holdSaleSince: null },
      })
      .catch(() => null);
  }

  const waiting = await db.leadDelivery
    .findMany({
      where: {
        state: HELD_STATE,
        ...(args.leadId ? { leadId: args.leadId } : {}),
      },
      select: { id: true, leadId: true },
    })
    .catch(() => []);

  if (waiting.length === 0) {
    return { released: 0, leads: 0 };
  }

  const now = new Date();

  /**
   * **כאן נקבע רגע ההעברה.**
   *
   * createdAt הוא התאריך שהקונה מקבל במטען, ולכן הוא
   * נדרך לעכשיו: העברת עכשיו, לא בשבת בבוקר. nextTryAt
   * לעכשיו כדי שהמנוע יקח את זה בסבב הקרוב - תוך דקה.
   */
  const done = await db.leadDelivery
    .updateMany({
      where: { id: { in: waiting.map((d) => d.id) } },
      data: {
        state: "pending",
        createdAt: now,
        nextTryAt: now,
        releasedAt: now,
        /** מתחילים ספירת ניסיונות מחדש - ההמתנה אינה כישלון */
        attempts: 0,
        error: null,
      },
    })
    .catch(() => null);

  if (!done) {
    return { released: 0, leads: 0, error: "השחרור נכשל - נסה שוב" };
  }

  return {
    released: done.count,
    leads: new Set(waiting.map((d) => d.leadId)).size,
  };
}
