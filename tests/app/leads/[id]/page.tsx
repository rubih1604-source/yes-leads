import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { statusColor } from "@/lib/statuses";
import { displayPhone } from "@/lib/phone";
import LeadCardActions from "@/components/LeadCardActions";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  lead_created: "הליד נכנס למערכת",
  status_changed: "שינוי סטטוס",
  webhook_received: "עדכון מליד מנגר",
  message_sent: "נשלחה הודעה",
  message_failed: "שליחת הודעה נכשלה",
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
      messages: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!lead) notFound();

  const templates = await db.template.findMany({
    where: { approved: true },
    orderBy: { name: "asc" },
    select: { name: true, displayName: true, bodyText: true },
  });

  const name =
    `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
    displayPhone(lead.phone);
  const firstName = (lead.firstName || "").trim().split(/\s+/)[0] || "";

  return (
    <div className="app">
      <AutoRefresh seconds={20} />
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
          firstName={firstName}
          templates={templates}
          doNotContact={lead.doNotContact}
        />
      </div>

      {lead.messages.length > 0 && (
        <>
          <div className="section-title">הודעות</div>
          <div className="timeline">
            {lead.messages.map((m) => (
              <div
                className="event"
                key={m.id}
                style={{
                  borderInlineStartColor:
                    m.status === "failed" ? "#dc2626" : "#16a34a",
                }}
              >
                {m.bodyText && (
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                    {m.bodyText}
                  </div>
                )}
                <div className="when">
                  {m.status === "failed"
                    ? `נכשל: ${m.error ?? "שגיאה"}`
                    : "נשלח"}
                  {" · "}
                  {m.templateName}
                  {" · "}
                  {formatDate(m.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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
