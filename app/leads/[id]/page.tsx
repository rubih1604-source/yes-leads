import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { statusColor } from "@/lib/statuses";
import { displayPhone, dialPhone } from "@/lib/phone";
import { FIELD_LABELS, FIELD_ORDER } from "@/lib/leadmanager-mapping";
import { getStatuses } from "@/lib/status-store";
import { getSubStatusMap } from "@/lib/substatus";
import { isExistingCustomer, supplierAnswer } from "@/lib/existing-customer";
import LeadCardActions from "@/components/LeadCardActions";
import CallLink from "@/components/CallLink";
import { getSettings } from "@/lib/settings";
import { doorLabel } from "@/lib/via";
import { ownerOf, entryCountIn } from "@/lib/channel";
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
      entries: { orderBy: { at: "desc" }, take: 20 },
      /**
       * ההעברות ללקוחות.
       *
       * בלי זה אין שום דרך לדעת אם הליד באמת הגיע לקונה,
       * ומה בדיוק נשלח אליו - וזו הייתה בדיקה שאי אפשר
       * לעשות מתוך המערכת.
       */
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          channelRef: { select: { name: true } },
          buyer: { select: { name: true } },
        },
      },
    },
  });

  if (!lead) notFound();

  const [statuses, subStatusMap, settings] = await Promise.all([
    getStatuses(),
    getSubStatusMap(),
    getSettings(),
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

  /**
   * של מי הליד, וכמה כניסות יש לו **בערוץ שלו**.
   *
   * כאן הייתה התקלה: התווית "ליד כפול" ספרה את הכניסות
   * של שני הערוצים יחד. ליד של אלעד שנכנס פעם אחת אצלו
   * ופעם אחת אצלך הוצג כ"ליד כפול · 2 כניסות" - למרות
   * שבכל ערוץ הוא נכנס פעם אחת בלבד.
   */
  const owner = ownerOf(lead.entries);
  const ownerEntryCount = entryCountIn(lead.entries, owner);

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

        <h1>
          {name}
          {isExistingCustomer(lead.extra, lead.status) && (
            <span className="existing-tag">לקוח קיים</span>
          )}
          {owner === "sale" && (
            <span
              className="existing-tag"
              style={{ background: "#fef0c7", color: "#b54708" }}
            >
              ליד של הקונה
            </span>
          )}
          {ownerEntryCount > 1 && (
            <span className="dup-tag">
              ליד כפול · {ownerEntryCount} כניסות
            </span>
          )}
        </h1>

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
          <CallLink
            phone={dialPhone(lead.phone)}
            mobileTemplate={settings.dialerMobile}
            desktopTemplate={settings.dialerDesktop}
          >
            {displayPhone(lead.phone)}
          </CallLink>
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
          /**
           * השם הפרטי לא הועבר כאן בכלל, ולכן בתצוגה המקדימה
           * של ההודעה המקום של השם נראה ריק - לא כמו ההודעה
           * שבאמת נשלחת.
           */
          firstName={lead.firstName ?? ""}
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
          dialerMobile={settings.dialerMobile}
          dialerDesktop={settings.dialerDesktop}
        />
      </div>

      {/**
        * מתי הוא נכנס - ודרך איזו דלת.
        *
        * מוצג גם כשיש כניסה אחת, כי זו השורה שעונה על
        * השאלה "זה הגיע מהחיבור הישיר או מליד מנגר".
        * הפרטים בכרטיס נראים זהים משני המקורות, ולכן בלי
        * השורה הזו אין שום דרך להבדיל.
        */}
      {lead.entries.length > 0 && (
        <>
          <div className="section-title">מתי הוא נכנס</div>
          <div className="card">
            {lead.entries.map((entry, i) => {
              const door = doorLabel(entry.via);

              return (
                <div className="stat-row" key={entry.id}>
                  <span>
                    {lead.entries.length === 1
                      ? "נכנס"
                      : i === 0
                        ? "האחרונה"
                        : `כניסה ${lead.entries.length - i}`}
                    {entry.campaign ? ` · ${entry.campaign}` : ""}
                    {door && (
                      <span style={{ color: "#667085", fontSize: 12.5 }}>
                        {" · "}
                        {door}
                      </span>
                    )}
                    {/**
                      * לאיזה ערוץ הכניסה שויכה.
                      *
                      * מוצג במפורש כדי שטעות שיוך לא תהיה שקופה:
                      * כניסה של קונה שלא סומנה "מכירה" היא בדיוק
                      * מה שמכניס ליד של אלעד לרשימה שלך.
                      */}
                    {entry.isSale && (
                      <span
                        style={{
                          color: "#b54708",
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}
                      >
                        {" · מכירה"}
                      </span>
                    )}
                  </span>
                  <strong style={{ fontSize: 14 }}>
                    {formatDate(entry.at)}
                  </strong>
                </div>
              );
            })}
          </div>
        </>
      )}

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

      {/*
        העברות ללקוחות.

        מציג לא רק "נשלח" אלא **מה בדיוק נשלח** - השדות
        עצמם. 201 מהשרת של הקונה אומר שהבקשה התקבלה, לא
        שהתוכן נכון; ליד עם שדות ריקים מחזיר 201 בדיוק
        כמו ליד תקין. כאן רואים את ההבדל.
      */}
      {lead.deliveries.length > 0 && (
        <>
          <div className="section-title">העברות ללקוחות</div>

          {lead.deliveries.map((d) => {
            const who = d.channelRef?.name ?? d.buyer?.name ?? "לקוח שנמחק";

            const state =
              d.state === "sent"
                ? { text: "נשלח בהצלחה", color: "#027a48" }
                : d.state === "failed"
                ? { text: "נכשל", color: "#b42318" }
                : { text: "ממתין לשליחה", color: "#b54708" };

            const sentFields =
              d.payload && typeof d.payload === "object" && !Array.isArray(d.payload)
                ? (d.payload as Record<string, unknown>)
                : null;

            return (
              <div className="card" key={d.id} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: 14.5 }}>{who}</strong>
                  <span style={{ color: state.color, fontSize: 13.5 }}>
                    {state.text}
                  </span>
                  {d.httpStatus ? (
                    <span style={{ fontSize: 12.5, color: "#667085" }}>
                      · קוד {d.httpStatus}
                    </span>
                  ) : null}
                </div>

                <div
                  style={{ fontSize: 12.5, color: "#667085", marginTop: 4 }}
                >
                  {d.sentAt
                    ? `נשלח ב-${d.sentAt.toLocaleString("he-IL", {
                        timeZone: "Asia/Jerusalem",
                      })}`
                    : `נרשם ב-${d.createdAt.toLocaleString("he-IL", {
                        timeZone: "Asia/Jerusalem",
                      })}`}
                  {d.attempts > 1 ? ` · ${d.attempts} ניסיונות` : ""}
                </div>

                {d.error && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "#b42318",
                      marginTop: 6,
                      lineHeight: 1.6,
                    }}
                  >
                    {d.error}
                  </div>
                )}

                {sentFields && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 13, cursor: "pointer" }}>
                      מה בדיוק נשלח ({Object.keys(sentFields).length} שדות)
                    </summary>
                    <div style={{ marginTop: 6 }}>
                      {Object.entries(sentFields).map(([key, value]) => {
                        const text = String(value ?? "");
                        return (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              gap: 8,
                              fontSize: 12.5,
                              padding: "3px 0",
                              borderBottom: "1px solid #f2f4f7",
                            }}
                          >
                            <span
                              style={{
                                color: "#667085",
                                minWidth: 118,
                                direction: "ltr",
                                textAlign: "left",
                              }}
                            >
                              {key}
                            </span>
                            <span
                              style={{
                                color: text ? "#101828" : "#b42318",
                                fontWeight: text ? 400 : 600,
                              }}
                            >
                              {text || "ריק !"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
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
