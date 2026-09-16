import { db } from "@/lib/db";
import { phoneDigits } from "@/lib/phone";

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
export default async function IncomingPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const q = (searchParams?.q ?? "").trim();

  const all = await db.webhookLog.findMany({
    orderBy: { createdAt: "desc" },
    take: q ? 500 : 40,
  });

  /**
   * חיפוש בתוך התוכן הגולמי. ככה אפשר לאתר אדם מסוים
   * ולראות אם הבקשה שלו בכלל הגיעה, ומה קרה איתה.
   */
  /**
   * המספרים בתוך התוכן הגולמי מגיעים בכל צורה אפשרית.
   * מיישרים את שני הצדדים לאותן ספרות לפני ההשוואה, כדי
   * ש-052-123-4567 ימצא גם כשנשמר כ-+972521234567.
   */
  const digits = phoneDigits(q);

  const logs = q
    ? all.filter((log) => {
        const raw = JSON.stringify(log.payload ?? {});
        if (digits.length >= 4) {
          const rawDigits = raw.replace(/\D/g, "");
          if (rawDigits.includes(digits)) return true;
        }
        return raw.includes(q);
      })
    : all;

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          יומן קליטה
          <span className="count">
            {q ? `${logs.length} תוצאות` : "גרסה 78"}
          </span>
        </h1>
        <form>
          <input
            className="search"
            name="q"
            defaultValue={q}
            placeholder="חפש לפי טלפון או שם"
            inputMode="search"
          />
        </form>
      </div>

      {logs.length === 0 ? (
        <div className="empty">
          <strong>{q ? "לא נמצא כלום" : "עוד לא הגיע כלום"}</strong>
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
