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
      await db.settings.updateMany({
        data: { engineRanAt: new Date(), engineError: failure },
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

  console.log(
    `[מנוע] טיימר הופעל - הרצה כל ${Math.round(INTERVAL_MS / 1000)} שניות`
  );
}
