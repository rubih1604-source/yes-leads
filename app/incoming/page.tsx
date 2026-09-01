import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** תמיד מציג בשעון ישראל, לא בשעון השרת */
function formatDate(d: Date): string {
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * יומן קליטה - מה בדיוק הגיע מליד מנגר.
 * זה המסך שממנו נדע איך למפות את השדות.
 */
export default async function IncomingPage() {
  const logs = await db.webhookLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="app">
      <div className="topbar">
        <h1>יומן קליטה <span className="count">גרסה 72</span></h1>
      </div>

      {logs.length === 0 ? (
        <div className="empty">
          <strong>עוד לא הגיע כלום</strong>
          ברגע שליד מנגר ישלח משהו לכתובת ה־webhook, הוא יופיע כאן בדיוק
          כמו שהתקבל.
        </div>
      ) : (
        <div className="timeline" style={{ marginTop: 16 }}>
          {logs.map((log) => (
            <div
              className="event"
              key={log.id}
              style={{
                borderInlineStartColor: log.error
                  ? "#dc2626"
                  : log.processed
                  ? "#16a34a"
                  : "#f59e0b",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {log.error
                  ? `שגיאה: ${log.error}`
                  : log.processed
                  ? "נקלט בהצלחה"
                  : "התקבל, לא עובד"}
              </div>
              <pre
                style={{
                  direction: "ltr",
                  textAlign: "left",
                  fontSize: 12,
                  background: "#f8fafc",
                  padding: 10,
                  borderRadius: 8,
                  overflowX: "auto",
                  margin: "6px 0",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(log.rawPayload, null, 2)}
              </pre>
              <div className="when">
                {formatDate(log.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
