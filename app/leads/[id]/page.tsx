import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { statusColor } from "@/lib/statuses";
import { displayPhone } from "@/lib/phone";
import LeadCardActions from "@/components/LeadCardActions";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  lead_created: "הליד נכנס למערכת",
  status_changed: "שינוי סטטוס",
  webhook_received: "עדכון מליד מנגר",
};

function formatDate(d: Date): string {
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function LeadPage({
  params,
}: {
  params: { id: string };
}) {
  const lead = await db.lead.findUnique({
    where: { id: params.id },
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  if (!lead) notFound();

  const name =
    `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
    displayPhone(lead.phone);

  return (
    <div className="app">
      <div className="topbar">
        <Link href="/" className="nav-back">
          <span>→</span>
          <span>חזרה לרשימה</span>
        </Link>
        <h1>{name}</h1>
      </div>

      <div className="card">
        <h2 style={{ color: statusColor(lead.status) }}>{lead.status}</h2>
        <div className="sub">
          {displayPhone(lead.phone)}
          {lead.source ? ` · ${lead.source}` : ""}
          <br />
          נכנס {formatDate(lead.intakeAt)}
        </div>

        <LeadCardActions
          leadId={lead.id}
          phone={lead.phone}
          status={lead.status}
        />
      </div>

      <div className="section-title">מה קרה עם הליד הזה</div>
      <div className="timeline">
        {lead.events.length === 0 && (
          <div className="event">אין עדיין רשומות</div>
        )}
        {lead.events.map((e) => (
          <div
            className="event"
            key={e.id}
            style={{
              borderInlineStartColor: e.toStatus
                ? statusColor(e.toStatus)
                : "#dde3ea",
            }}
          >
            <div>
              {EVENT_LABELS[e.type] ?? e.type}
              {e.fromStatus && e.toStatus
                ? `: ${e.fromStatus} ← ${e.toStatus}`
                : e.toStatus
                ? `: ${e.toStatus}`
                : ""}
            </div>
            <div className="when">
              {formatDate(e.createdAt)}
              {e.actor === "user" ? " · ידני" : " · אוטומטי"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
