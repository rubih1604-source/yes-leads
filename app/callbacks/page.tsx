import Link from "next/link";
import { pendingCallbacks } from "@/lib/callback-list";
import { getSettings } from "@/lib/settings";
import { getStatuses } from "@/lib/status-store";
import { statusColor } from "@/lib/statuses";
import { displayPhone, dialPhone } from "@/lib/phone";
import AutoRefresh from "@/components/AutoRefresh";
import CallbackNowButton from "@/components/CallbackNowButton";

export const dynamic = "force-dynamic";

function when(d: Date): string {
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CallbacksPage() {
  const [leads, settings, statuses] = await Promise.all([
    pendingCallbacks(),
    getSettings(),
    getStatuses(),
  ]);

  return (
    <div className="app">
      <AutoRefresh seconds={60} />
      <div className="topbar">
        <h1>
          רשימת חזרה
          <span className="count">{leads.length} ממתינים</span>
        </h1>
      </div>

      {!settings.callbackEnabled ? (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            רשימת החזרה כבויה
          </div>
          <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
            הפעל אותה בהגדרות ובחר אילו סטטוסים נכנסים אליה. משם המערכת
            תאסוף אותם ותשלח לך רשימה מרוכזת פעמיים ביום.
          </div>
          <Link
            href="/settings"
            className="btn primary"
            style={{ textDecoration: "none" }}
          >
            להגדרות
          </Link>
        </div>
      ) : (
        <div className="card" style={{ fontSize: 13, color: "#475467" }}>
          סטטוס ששינית עד <strong>{settings.callbackCutoffHour}:00</strong>{" "}
          מגיע אליך למחרת ב-
          <strong>{settings.callbackMorningHour}:00</strong>. מה שאחרי —
          למחרת ב-<strong>{settings.callbackAfternoonHour}:00</strong>.
          <br />
          כאן רואים את כל מי שממתין, בכל רגע.
        </div>
      )}

      <CallbackNowButton count={leads.length} />

      {leads.length === 0 ? (
        <div className="empty">
          <strong>אין אף אחד בהמתנה</strong>
          לידים בסטטוסים שבחרת יופיעו כאן אוטומטית.
        </div>
      ) : (
        <div className="list">
          {leads.map((lead) => (
            <div className="lead" key={lead.id}>
              <span
                className="bar"
                style={{ background: statusColor(lead.status, statuses) }}
              />
              <Link href={`/leads/${lead.id}`} className="body">
                <div className="name">{lead.name}</div>
                <div className="meta">
                  <span
                    className="status-text"
                    style={{ color: statusColor(lead.status, statuses) }}
                  >
                    {lead.status}
                  </span>
                  <span>·</span>
                  <span>{displayPhone(lead.phone)}</span>
                  <span>·</span>
                  <span>מאז {when(lead.queuedAt)}</span>
                </div>
              </Link>
              <div className="row-actions">
                <a
                  className="row-btn call"
                  href={`tel:${dialPhone(lead.phone)}`}
                  aria-label="התקשר"
                >
                  ✆
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
