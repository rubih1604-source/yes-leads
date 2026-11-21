/**
 * רץ פעם אחת כשהשרת עולה.
 * מפעיל טיימר פנימי שמריץ את המשימות, כדי שלא נהיה
 * תלויים בשירות תזמון חיצוני.
 *
 * המרווח הוא דקה: משימה שתוזמנה לעוד דקה תצא בזמן, ולא
 * תחכה לסבב הבא. סבב ריק כמעט לא עולה כלום - שאילתה אחת
 * שמחזירה אפס שורות.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runDueJobs } = await import("./lib/runner");

  const INTERVAL_MS = Number(process.env.RUNNER_INTERVAL_MS) || 60_000;

  let running = false;

  async function tick() {
    // אם סבב קודם עדיין רץ, מדלגים - לא רוצים שתי הרצות במקביל
    if (running) return;
    running = true;

    /**
     * ============================================================
     *  כל סבב נרשם - גם כשהוא נכשל
     * ============================================================
     *
     *  **הנקודה העיוורת השנייה.** השגיאה נכתבה לקונסול
     *  בלבד. כשהמנוע קרס בכל סבב - וזה קרה בגלל תלות
     *  מעגלית - שום הודעה מתוזמנת לא יצאה: לא הפולואפ
     *  אחרי 6 שעות, ולא "אין מענה". ובמערכת לא היה שום
     *  סימן שמשהו לא בסדר.
     *
     *  מעכשיו כל סבב נרשם במסד, ומסך "בריאות המערכת"
     *  מראה מתי המנוע רץ לאחרונה ומה נכשל.
     */
    let failure: string | null = null;

    try {
      const summary = await runDueJobs();
      if (summary.picked > 0 || summary.taskReminders > 0) {
        console.log(
          `[מנוע] ${summary.picked} משימות: נשלחו ${summary.sent}, ` +
            `התראות ${summary.notified}, דילוגים ${summary.skipped}, ` +
            `כשלים ${summary.failed}, תזכורות ${summary.taskReminders}`
        );
      }
    } catch (err) {
      failure =
        err instanceof Error
          ? `${err.message} · ${(err.stack ?? "").slice(0, 500)}`
          : String(err).slice(0, 500);
      console.error("[מנוע] שגיאה בהרצה:", err);
    }

    try {
      const { db } = await import("./lib/db");

      /**
       * ============================================================
       *  כמה זמן באמת עבר מהסבב הקודם
       * ============================================================
       *
       *  **מה שזה עונה עליו.** "הגדרתי שישלח אחרי דקה,
       *  וזה הגיע אחרי 7-8 דקות."
       *
       *  הטיימר אמור לרוץ כל 60 שניות. אם המרווח בפועל
       *  הוא 400 שניות, הטיימר נרדם - וזה קורה כשהשרת
       *  נכנס לשינה בין בקשות. זו מסקנה אחרת לגמרי מ"משהו
       *  בקוד דוחה את המשימה", והיא דורשת תיקון אחר:
       *  מתזמן חיצוני שמעיר את השרת.
       *
       *  בלי המדידה הזו אי אפשר להבדיל בין השניים.
       */
      const now = new Date();
      const previous = await db.settings
        .findFirst({ select: { engineRanAt: true, engineWorstGap: true, engineWorstAt: true } })
        .catch(() => null);

      const gap = previous?.engineRanAt
        ? Math.round((now.getTime() - previous.engineRanAt.getTime()) / 1000)
        : null;

      /** המדד הגרוע מתאפס כל יממה, שלא ייתקע על מקרה חד פעמי */
      const worstIsOld =
        !previous?.engineWorstAt ||
        now.getTime() - previous.engineWorstAt.getTime() > 24 * 60 * 60 * 1000;

      const worst =
        gap !== null &&
        (worstIsOld || gap > (previous?.engineWorstGap ?? 0))
          ? gap
          : (previous?.engineWorstGap ?? null);

      await db.settings.updateMany({
        data: {
          engineRanAt: now,
          engineError: failure,
          engineGapSeconds: gap,
          engineWorstGap: worst,
          engineWorstAt:
            gap !== null && worst === gap ? now : previous?.engineWorstAt,
        },
      });
    } catch {
      // אם אי אפשר לרשום - הסבב עצמו כבר רץ, לא עוצרים בגלל זה
    }

    {
      running = false;
    }
  }

  // הרצה ראשונה אחרי 15 שניות, ואז כל דקה
  setTimeout(tick, 15_000);
  setInterval(tick, INTERVAL_MS);

  /**
   * ============================================================
   *  הסוכן הבודק - טיימר **נפרד** מהמנוע, ובכוונה
   * ============================================================
   *
   *  **למה לא בתוך הסבב של המנוע.** תפקידו של הסוכן הוא,
   *  בין השאר, לתפוס מנוע שנתקע ולהעיר אותו. סוכן שרץ
   *  בתוך המנוע היה נתקע יחד איתו ולא תופס כלום - שומר
   *  שישן באותו חדר עם מי שהוא שומר עליו.
   *
   *  **ולמה כל 5 דקות ולא כל דקה.** הוא סורק ומתקן, ולא
   *  סתם מציץ. כל דקה זו עבודה מיותרת על מערכת תקינה;
   *  5 דקות מספיק מהר כדי שתקלה לא תשב שעה.
   */
  const WATCHDOG_MS =
    Number(process.env.WATCHDOG_INTERVAL_MS) || 5 * 60_000;

  let watching = false;

  async function watch() {
    if (watching) return;
    watching = true;

    try {
      const { runWatchdog } = await import("./lib/watchdog");
      const result = await runWatchdog();

      const problems = result.findings.filter((f) => f.needsYou);

      if (result.findings.length > 0) {
        console.log(
          `[סוכן] ${result.findings.length} ממצאים, ` +
            `${problems.length} דורשים טיפול`
        );
      }
    } catch (err) {
      console.error("[סוכן] שגיאה בבדיקה:", err);
    } finally {
      watching = false;
    }
  }

  /** אחרי המנוע, שלא יתנגשו בהרצה הראשונה */
  setTimeout(watch, 90_000);
  setInterval(watch, WATCHDOG_MS);

  console.log(
    `[מנוע] טיימר הופעל - הרצה כל ${Math.round(INTERVAL_MS / 1000)} שניות`
  );
  console.log(
    `[סוכן] בדיקת מערכת כל ${Math.round(WATCHDOG_MS / 60_000)} דקות`
  );
}
