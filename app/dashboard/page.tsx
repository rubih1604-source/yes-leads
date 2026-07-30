import Link from "next/link";
import { getDashboard } from "@/lib/stats";

export const dynamic = "force-dynamic";

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return null;
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return <span className="delta flat">ללא שינוי</span>;
  return (
    <span className={diff > 0 ? "delta up" : "delta down"}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
    </span>
  );
}

function humanMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m} דק'`;
  const h = Math.round((m / 60) * 10) / 10;
  if (h < 24) return `${h} שע'`;
  return `${Math.round(h / 24)} ימים`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = Number(searchParams?.days) === 7 ? 7 : Number(searchParams?.days) === 90 ? 90 : 30;
  const d = await getDashboard(days);

  const best = d.templates.filter((t) => t.sent >= 5).sort((a, b) => b.replyRate - a.replyRate)[0];
  const worst = d.templates.filter((t) => t.sent >= 5).sort((a, b) => a.replyRate - b.replyRate)[0];

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          ביצועים
          <span className="count">{days} ימים אחרונים</span>
        </h1>
      </div>

      <div className="filters">
        {[7, 30, 90].map((n) => (
          <Link
            key={n}
            href={`/dashboard?days=${n}`}
            className="chip"
            data-active={days === n}
          >
            {n} ימים
          </Link>
        ))}
      </div>

      {/* ---- ארבעת המספרים ---- */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-num">{d.now.leads}</div>
          <div className="stat-label">לידים נכנסו</div>
          <Delta now={d.now.leads} before={d.previous.leads} />
        </div>
        <div className="stat">
          <div className="stat-num">{d.now.replied}</div>
          <div className="stat-label">ענו לך</div>
          <Delta now={d.now.replied} before={d.previous.replied} />
        </div>
        <div className="stat">
          <div className="stat-num">{d.now.won}</div>
          <div className="stat-label">נסגרו</div>
          <Delta now={d.now.won} before={d.previous.won} />
        </div>
        <div className="stat">
          <div className="stat-num">{d.now.winRate}%</div>
          <div className="stat-label">אחוז סגירה</div>
          <Delta now={d.now.winRate} before={d.previous.winRate} />
        </div>
      </div>

      {/* ---- מהירות מגע ראשון ---- */}
      <div className="section-title">מהירות מגע ראשון</div>
      <div className="card">
        <div className="stat-row">
          <span>זמן חציוני עד ההודעה הראשונה</span>
          <strong>{humanMinutes(d.speed.medianMinutes)}</strong>
        </div>
        <div className="stat-row">
          <span>נענו תוך 5 דקות</span>
          <strong>
            {d.speed.within5} מתוך {d.speed.total}
          </strong>
        </div>
        <div className="stat-row">
          <span>לא יצרנו איתם קשר בכלל</span>
          <strong style={{ color: d.speed.never > 0 ? "#b42318" : undefined }}>
            {d.speed.never}
          </strong>
        </div>
        {d.speed.never > 0 && (
          <div className="insight">
            {d.speed.never} לידים נכנסו ואף הודעה לא יצאה אליהם. הדלק חוק על
            סטטוס &quot;חדש&quot; והם יקבלו הודעה תוך דקות.
          </div>
        )}
      </div>

      {/* ---- תבניות ---- */}
      <div className="section-title">מה עובד — לפי תבנית</div>
      {d.templates.length === 0 ? (
        <div className="empty">
          <strong>עוד אין מספיק נתונים</strong>
          אחרי שייצאו כמה עשרות הודעות תראה כאן איזו תבנית מביאה מענה.
        </div>
      ) : (
        <>
          <div className="timeline">
            {d.templates.map((t) => (
              <div className="event" key={t.name}>
                <div style={{ fontWeight: 600 }}>
                  {t.displayName || t.name}
                </div>
                <div className="bars">
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.min(t.replyRate, 100)}%` }}
                    />
                  </div>
                  <span className="bar-num">{t.replyRate}%</span>
                </div>
                <div className="when">
                  נשלחה {t.sent} · ענו {t.replied} · נסגרו {t.won}
                </div>
              </div>
            ))}
          </div>

          {best && worst && best.name !== worst.name && (
            <div className="card insight-card">
              <strong>{best.displayName || best.name}</strong> מביאה{" "}
              {best.replyRate}% מענה, לעומת {worst.replyRate}% של{" "}
              <strong>{worst.displayName || worst.name}</strong>.
              <br />
              שווה לשכתב את החלשה בטקסטר בסגנון של החזקה.
            </div>
          )}
        </>
      )}

      {/* ---- סטטוסים ---- */}
      <div className="section-title">איפה הלידים עומדים</div>
      <div className="timeline">
        {d.statuses.map((s) => (
          <div
            className="event"
            key={s.name}
            style={{ borderInlineStartColor: s.color }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <strong style={{ color: s.color }}>{s.current}</strong>
              <span>{s.name}</span>
            </div>
            {s.everEntered > 0 && (
              <div className="when">
                {s.everEntered} לידים נכנסו לסטטוס הזה בתקופה
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ---- העוזר ---- */}
      <div className="section-title">כמה העוזר חסך לך</div>
      <div className="card">
        <div className="stat-row">
          <span>תשובות שירות ששלח לבד</span>
          <strong>{d.assistant.answered}</strong>
        </div>
        <div className="stat-row">
          <span>תגובות שסיווג</span>
          <strong>{d.assistant.classified}</strong>
        </div>
        <div className="stat-row">
          <span>העביר אליך כי הלקוח חזר</span>
          <strong>{d.assistant.escalated}</strong>
        </div>
        <div className="stat-row">
          <span>שאלות שלא ידע לענות</span>
          <strong>{d.assistant.unanswered}</strong>
        </div>
        {d.assistant.unanswered > 0 && (
          <div className="insight">
            כל שאלה כזו שתוסיף למאגר הידע לא תחזור אליך שוב. פתח את
            &quot;היום&quot; ולחץ &quot;למד את העוזר&quot;.
          </div>
        )}
      </div>
    </div>
  );
}
