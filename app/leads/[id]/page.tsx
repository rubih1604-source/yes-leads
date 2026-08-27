import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { statusColor } from "@/lib/statuses";
import { displayPhone, dialPhone } from "@/lib/phone";
import { FIELD_LABELS, FIELD_ORDER } from "@/lib/leadmanager-mapping";
import { getStatuses } from "@/lib/status-store";
import { getSubStatusMap } from "@/lib/substatus";
import LeadCardActions from "@/components/LeadCardActions";
import LeadTasks from "@/components/LeadTasks";
import BackLink from "@/components/BackLink";
import AutoRefresh from "@/components/AutoRefresh";
import type { TemplateOption } from "@/components/SendTemplateSheet";
import type { KnowledgeOption } from "@/components/SendKnowledgeSheet";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  lead_created: "הליד נכנס",
  status_changed: "שינוי סטטוס",
  message_sent: "נשלחה הודעה",
  message_failed: "שליחה נכשלה",
  alert_created: "נוצרה התראה",
  bot_classified: "העוזר סיווג את התגובה",
  bot_answered: "העוזר ענה ללקוח",
  bot_skipped: "העוזר לא ענה בכוונה",
  bot_escalated: "העוזר העביר אליך - הלקוח חזר",
  human_reply: "ענית ללקוח בעצמך",
  task_created: "פתחת משימה",
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
      messages: { orderBy: { createdAt: "desc" }, take: 60 },
      events: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });

  if (!lead) notFound();

  const [statuses, subStatusMap] = await Promise.all([
    getStatuses(),
    getSubStatusMap(),
  ]);

  const lastAutoChange = await db.leadEvent.findFirst({
    where: {
      leadId: lead.id,
      type: "status_changed",
      actor: { in: ["bot", "system"] },
    },
    orderBy: { createdAt: "desc" },
  });

  const knowledge = await db.knowledgeItem.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, topic: true, answer: true },
  });

  const templates = await db.template.findMany({
    where: { approved: true },
    orderBy: { name: "asc" },
  });

  const name =
    `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
    displayPhone(lead.phone);

  // פרטי הקמפיין והטופס, לפי סדר חשיבות
  const extra =
    lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
      ? (lead.extra as Record<string, string>)
      : {};

  const detailKeys = [
    ...FIELD_ORDER.filter((k) => extra[k]),
    ...Object.keys(extra).filter((k) => !FIELD_ORDER.includes(k) && extra[k]),
  ];

  return (
    <div className="app">
      <AutoRefresh seconds={20} />

      {/* החתימה: צבע הסטטוס מציף את הכותרת.
          אתה יודע איפה הליד עומד לפני שקראת מילה. */}
      <div
        className="topbar lead-head"
        style={{ borderBottomColor: statusColor(lead.status, statuses) }}
      >
        <BackLink fallback="/" label="חזרה" />

        <h1>{name}</h1>

        <div className="lead-head-status">
          <span
            className="dot"
            style={{ background: statusColor(lead.status, statuses) }}
          />
          <span style={{ color: statusColor(lead.status, statuses) }}>
            {lead.status}
            {lead.subStatus ? ` · ${lead.subStatus}` : ""}
          </span>
          <span className="sep">·</span>
          <a href={`tel:${dialPhone(lead.phone)}`}>
            {displayPhone(lead.phone)}
          </a>
        </div>
      </div>

      <div className="card">
        <div className="sub" style={{ marginBottom: 14 }}>
          נכנס {formatDate(lead.intakeAt)}
          {lead.source ? ` · ${lead.source}` : ""}
          {lead.duplicateOf ? " · ליד כפול" : ""}
        </div>

        <LeadCardActions
          leadId={lead.id}
          status={lead.status}
          phone={dialPhone(lead.phone)}
          templates={templates as unknown as TemplateOption[]}
          doNotContact={lead.doNotContact}
          canUndo={Boolean(lastAutoChange?.fromStatus)}
          botMuted={lead.botMuted}
          botPausedUntil={
            lead.botPausedUntil ? lead.botPausedUntil.toISOString() : null
          }
          knowledge={knowledge as KnowledgeOption[]}
          statuses={statuses}
          leadName={name}
          currentSub={lead.subStatus}
          subStatuses={subStatusMap}
        />
      </div>

      {/* המשימות של הליד - עם כל הפרטים, לא רק שנפתחה משימה */}
      <LeadTasks leadId={lead.id} />

      {detailKeys.length > 0 && (
        <>
          <div className="section-title">מאיפה הגיע</div>
          <div className="card">
            {detailKeys.map((key) => (
              <div className="stat-row" key={key}>
                <span>{FIELD_LABELS[key] ?? key}</span>
                <strong
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    textAlign: "start",
                    maxWidth: "62%",
                    wordBreak: "break-word",
                  }}
                >
                  {extra[key]}
                </strong>
              </div>
            ))}
          </div>
        </>
      )}

      {lead.messages.length > 0 && (
        <>
          <div className="section-title">שיחה עם הלקוח</div>

          {lead.messages[0]?.direction === "in" && (
            <div
              style={{
                margin: "0 16px 10px",
                padding: "10px 14px",
                background: "#dcfce7",
                border: "1px solid #16a34a",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "#14532d",
              }}
            >
              הלקוח ענה וממתין לתשובה ממך
            </div>
          )}

          <div className="chat">
            {[...lead.messages].reverse().map((m) => (
              <div
                className={m.direction === "in" ? "bubble in" : "bubble out"}
                key={m.id}
              >
                <div className="bubble-text">
                  {m.bodyText || m.templateName || "(ללא טקסט)"}
                </div>
                <div className="bubble-meta">
                  {m.direction === "in" ? "הלקוח" : "אנחנו"}
                  {m.templateName ? ` · ${m.templateName}` : ""}
                  {" · "}
                  {formatDate(m.createdAt)}
                  {m.status === "failed" && m.error
                    ? ` · נכשל: ${m.error}`
                    : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {lead.events.length > 0 && (
        <>
          <div className="section-title">מה קרה עם הליד הזה</div>
          <div className="timeline">
            {lead.events.map((e) => {
              const payload =
                e.payload && typeof e.payload === "object"
                  ? (e.payload as Record<string, unknown>)
                  : {};

              const taskTitle =
                e.type === "task_created" && typeof payload.title === "string"
                  ? payload.title
                  : null;

              const taskDue =
                e.type === "task_created" && typeof payload.dueAt === "string"
                  ? payload.dueAt
                  : null;

              return (
                <div
                  className="event"
                  key={e.id}
                  style={
                    e.toStatus
                      ? {
                          borderInlineStartColor: statusColor(
                            e.toStatus,
                            statuses
                          ),
                        }
                      : undefined
                  }
                >
                  <div style={{ fontWeight: 600 }}>
                    {EVENT_LABELS[e.type] ?? e.type}
                    {e.fromStatus && e.toStatus
                      ? `: ${e.fromStatus} ← ${e.toStatus}`
                      : e.toStatus
                      ? `: ${e.toStatus}`
                      : ""}
                  </div>

                  {taskTitle && (
                    <div style={{ fontSize: 14, marginTop: 3 }}>
                      {taskTitle}
                      {taskDue ? ` · לשעה ${formatDate(new Date(taskDue))}` : ""}
                    </div>
                  )}

                  <div className="when">
                    {formatDate(e.createdAt)}
                    {e.actor === "bot"
                      ? " · אוטומטי"
                      : e.actor === "system"
                      ? " · המערכת"
                      : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
