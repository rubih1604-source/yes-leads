import Link from "next/link";
import { db } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import AutoRefresh from "@/components/AutoRefresh";

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

export default async function AlertsPage() {
  const alerts = await db.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { lead: true },
  });

  return (
    <div className="app">
      <AutoRefresh seconds={20} />
      <div className="topbar">
        <Link href="/" className="nav-back">
          <span>→</span>
          <span>חזרה לרשימה</span>
        </Link>
        <h1>
          התראות
          <span className="count">{alerts.length}</span>
        </h1>
      </div>

      {alerts.length === 0 ? (
        <div className="empty">
          <strong>אין התראות</strong>
          כאן יופיעו התראות מהמנוע - לידים שצריך לחזור אליהם ושליחות שנכשלו.
        </div>
      ) : (
        <div className="timeline" style={{ marginTop: 16 }}>
          {alerts.map((a) => (
            <div className="event" key={a.id} style={{ borderInlineStartColor: "#f59e0b" }}>
              <div style={{ fontWeight: 600 }}>{a.title}</div>
              {a.body && <div style={{ fontSize: 14 }}>{a.body}</div>}
              <div className="when">{formatDate(a.createdAt)}</div>
              {a.lead && (
                <Link
                  href={`/leads/${a.lead.id}`}
                  style={{ fontSize: 13, color: "#2563eb" }}
                >
                  פתח את הליד ({displayPhone(a.lead.phone)})
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
