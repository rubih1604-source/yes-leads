import Link from "next/link";
import { db } from "@/lib/db";
import SyncTemplatesButton from "@/components/SyncTemplatesButton";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TemplatesPage() {
  const templates = await db.template.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="app">
      <div className="topbar">
        <Link href="/" className="nav-back">
          <span>→</span>
          <span>חזרה לרשימה</span>
        </Link>
        <h1>
          תבניות
          <span className="count">{templates.length}</span>
        </h1>
      </div>

      <div className="card">
        <SyncTemplatesButton />
      </div>

      {templates.length === 0 ? (
        <div className="empty">
          <strong>אין עדיין תבניות</strong>
          לחץ על &quot;רענן מטקסטר&quot; כדי למשוך את התבניות המאושרות שלך.
        </div>
      ) : (
        <div className="timeline">
          {templates.map((t) => (
            <div className="event" key={t.name}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {t.displayName || t.name}
              </div>
              <div
                style={{
                  direction: "ltr",
                  textAlign: "left",
                  fontSize: 12,
                  color: "#64748b",
                  marginBottom: 6,
                }}
              >
                {t.name}
              </div>
              {t.bodyText && (
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                  {t.bodyText}
                </div>
              )}
              <div className="when">
                {t.variables > 0
                  ? `${t.variables} משתנים · `
                  : "בלי משתנים · "}
                עודכן {formatDate(t.syncedAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
