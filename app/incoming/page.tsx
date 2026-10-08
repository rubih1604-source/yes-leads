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
/**
 * שמות המקורות בעברית. המקור נשמר באנגלית בשדה source,
 * וככה רואים מיד אם השורה הגיעה מליד מנגר או מוואטסאפ
 * במקום לנחש מתוך ה-JSON.
 */
const SOURCE_LABELS: Record<string, string> = {
  leadmanager: "ליד מנגר",
  facebook: "פייסבוק (ישיר)",
  texter: "וואטסאפ",
};

export default async function IncomingPage({
  searchParams,
}: {
  searchParams?: { q?: string; src?: string };
}) {
  const q = (searchParams?.q ?? "").trim();
  const src = (searchParams?.src ?? "").trim();

  /**
   * כל מה שהגיע - בלי קשר לסטטוס או לשגיאה.
   * זה המסך שאמור לענות על "הליד הגיע או לא", ולכן הוא
   * לא נופל על שגיאה.
   *
   * סינון לפי מקור, כי היומן מעורבב: הודעות וואטסאפ
   * והלידים מליד מנגר נכנסים לאותה רשימה, והוואטסאפ
   * מציף את מה שבאמת מחפשים.
   */
  const all = await db.webhookLog
    .findMany({
      where: src ? { source: src } : undefined,
      orderBy: { createdAt: "desc" },
      take: q ? 1000 : 60,
    })
    .catch(() => []);

  /**
   * חיפוש בתוך התוכן הגולמי. ככה אפשר לאתר אדם מסוים
   * ולראות אם הבקשה שלו בכלל הגיעה, ומה קרה איתה.
   */
  /**
   * המספרים בתוך התוכן הגולמי מגיעים בכל צורה אפשרית.
   * מיישרים את שני הצדדים לאותן ספרות לפני ההשוואה, כדי
   * ש-052-123-4567 ימצא גם כשנשמר כ-+972521234567.
   */
  let digits = "";
  try {
    digits = phoneDigits(q);
  } catch {
    digits = q.replace(/\D/g, "");
  }

  /**
   * כאן היה באג: החיפוש קרא שדה בשם payload, אבל השדה
   * במסד נקרא rawPayload. התוצאה - החיפוש תמיד החזיר
   * "לא נמצא כלום", גם כשהליד היה שם.
   */
  const logs = q
    ? all.filter((log) => {
        const raw = JSON.stringify(log.rawPayload ?? {});
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
            {q ? `${logs.length} תוצאות` : "גרסה 98"}
          </span>
        </h1>
        <form>
          <input
            className="search"
            name="q"
            defaultValue={q}
            placeholder="חפש לפי טלפון, שם או fb_leadid"
            inputMode="search"
          />
          {src ? <input type="hidden" name="src" value={src} /> : null}
        </form>
      </div>

      {/* סינון לפי מקור - כדי שהוואטסאפ לא יציף את הלידים */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
        {[
          { key: "", label: "הכל" },
          { key: "leadmanager", label: "ליד מנגר" },
          { key: "facebook", label: "פייסבוק" },
          { key: "texter", label: "וואטסאפ" },
        ].map((opt) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (opt.key) params.set("src", opt.key);
          const href = `/incoming${params.toString() ? `?${params}` : ""}`;
          const active = src === opt.key;

          return (
            <a
              key={opt.key || "all"}
              href={href}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 13.5,
                textDecoration: "none",
                border: "1px solid #dbe3ea",
                background: active ? "#1b4d8f" : "#fff",
                color: active ? "#fff" : "#475467",
              }}
            >
              {opt.label}
            </a>
          );
        })}
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
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 4,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "#eef2f7",
                    color: "#475467",
                  }}
                >
                  {SOURCE_LABELS[log.source] ?? log.source}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {log.error
                    ? `שגיאה: ${log.error}`
                    : log.processed
                    ? "נקלט בהצלחה"
                    : "התקבל, לא עובד"}
                </span>
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
