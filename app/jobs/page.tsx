import Link from "next/link";
import { db } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const STATE_LABELS: Record<string, string> = {
  pending: "ממתינה",
  running: "רצה עכשיו",
  done: "בוצעה",
  cancelled: "בוטלה",
  failed: "נכשלה",
};

const STATE_COLORS: Record<string, string> = {
  pending: "#1b4d8f",
  running: "#b54708",
  done: "#12805c",
  cancelled: "#98a2b3",
  failed: "#b42318",
};

function formatDate(d: Date): string {
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ago(d: Date | null): string {
  if (!d) return "מעולם לא רץ";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "לפני פחות מדקה";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

export default async function JobsPage() {
  const [jobs, settings] = await Promise.all([
    db.scheduledJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { lead: true },
    }),
    db.settings.findUnique({ where: { id: "main" } }).catch(() => null),
  ]);

  const lastRun = settings?.lastRunAt ?? null;
  const stale = !lastRun || Date.now() - lastRun.getTime() > 12 * 60 * 1000;

  return (
    <div className="app">
      <AutoRefresh seconds={20} />
      <div className="topbar">
        <h1>
          מה המנוע עשה
          <span className="count">{jobs.length} אחרונות</span>
        </h1>
      </div>

      <div className="card" style={{ borderInlineStart: `4px solid ${stale ? "#b42318" : "#12805c"}` }}>
        <div style={{ fontWeight: 600 }}>
          {stale ? "המנוע לא רץ לאחרונה" : "המנוע פעיל"}
        </div>
        <div style={{ fontSize: 13, color: "#475467", marginTop: 3 }}>
          הרצה אחרונה: {ago(lastRun)}
          {lastRun ? ` (${formatDate(lastRun)})` : ""}
        </div>
        {stale && (
          <div className="insight">
            המנוע אמור לרוץ כל 5 דקות. אם הוא לא רץ, שליחות מתוזמנות לא
            יצאו. נסה לפרוס מחדש ברנדר, ואם זה חוזר — תגיד לי.
          </div>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="empty">
          <strong>אין משימות מתוזמנות</strong>
          כשתשנה סטטוס לליד, החוקים של אותו סטטוס ייצרו כאן משימות.
        </div>
      ) : (
        <div className="timeline">
          {jobs.map((job) => (
            <div
              className="event"
              key={job.id}
              style={{ borderInlineStartColor: STATE_COLORS[job.state] ?? "#dbe3ea" }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <strong style={{ color: STATE_COLORS[job.state] }}>
                  {STATE_LABELS[job.state] ?? job.state}
                </strong>
                <span>
                  {job.action === "send_template"
                    ? `שליחת ${job.templateName ?? "תבנית"}`
                    : job.action === "notify"
                    ? "התראה"
                    : `העברה ל"${job.targetStatus}"`}
                </span>
              </div>

              {job.lead && (
                <Link
                  href={`/leads/${job.lead.id}`}
                  style={{ fontSize: 13.5, color: "#1b4d8f" }}
                >
                  {job.lead.firstName || displayPhone(job.lead.phone)} ·{" "}
                  {job.lead.status}
                </Link>
              )}

              <div className="when">
                אמורה לרוץ {formatDate(job.runAt)}
                {job.lastError ? ` · ${job.lastError}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
