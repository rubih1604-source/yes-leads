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
      console.error("[מנוע] שגיאה בהרצה:", err);
    } finally {
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
