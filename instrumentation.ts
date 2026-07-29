/**
 * רץ פעם אחת כשהשרת עולה.
 * מפעיל טיימר פנימי שמריץ את המשימות כל 5 דקות,
 * כדי שלא נהיה תלויים בשירות תזמון חיצוני.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runDueJobs } = await import("./lib/runner");

  const INTERVAL_MS = 5 * 60 * 1000;

  async function tick() {
    try {
      const summary = await runDueJobs();
      if (summary.picked > 0) {
        console.log(
          `[מנוע] בוצעו ${summary.picked} משימות: נשלחו ${summary.sent}, התראות ${summary.notified}, דילוגים ${summary.skipped}, כשלים ${summary.failed}`
        );
      }
    } catch (err) {
      console.error("[מנוע] שגיאה בהרצה:", err);
    }
  }

  // הרצה ראשונה אחרי 30 שניות, ואז כל 5 דקות
  setTimeout(tick, 30_000);
  setInterval(tick, INTERVAL_MS);

  console.log("[מנוע] טיימר הופעל - הרצה כל 5 דקות");
}
