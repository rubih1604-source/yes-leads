"use client";

import { useState } from "react";
import StatusSheet from "./StatusSheet";
import SendTemplateSheet, { type TemplateOption } from "./SendTemplateSheet";
import SendKnowledgeSheet, { type KnowledgeOption } from "./SendKnowledgeSheet";
import type { StatusDef } from "@/lib/statuses";
import AddTaskSheet from "./AddTaskSheet";
import CallLink from "./CallLink";
import { DEFAULT_DIALER } from "@/lib/dialer";
import { useRouter } from "next/navigation";

export default function LeadCardActions({
  leadId,
  phone,
  status,
  firstName,
  templates,
  doNotContact,
  canUndo,
  botMuted,
  botPausedUntil,
  knowledge,
  statuses,
  leadName,
  currentSub,
  subStatuses,
  dialerMobile = DEFAULT_DIALER,
  dialerDesktop = DEFAULT_DIALER,
}: {
  leadId: string;
  phone: string;
  status: string;
  firstName: string;
  templates: TemplateOption[];
  doNotContact: boolean;
  canUndo: boolean;
  botMuted: boolean;
  botPausedUntil: string | null;
  knowledge: KnowledgeOption[];
  statuses: StatusDef[];
  leadName: string;
  currentSub: string | null;
  subStatuses: Record<string, string[]>;
  /** לאיזה חייגן כפתור ההתקשרות פונה */
  dialerMobile?: string;
  dialerDesktop?: string;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const router = useRouter();

  async function botAction(action: "mute" | "unmute") {
    setUndoing(true);
    await fetch(`/api/leads/${leadId}/bot`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setUndoing(false);
    router.refresh();
  }

  const pausedActive =
    botPausedUntil !== null && new Date(botPausedUntil) > new Date();

  const [blacklistAsk, setBlacklistAsk] = useState(false);
  const [blacklistBusy, setBlacklistBusy] = useState(false);

  /**
   * הוספה ידנית לרשימה השחורה.
   *
   * עוברת דרך אותו נתיב של ההסרה האוטומטית, כדי שלא
   * ייווצרו שתי דרכים להיכנס לרשימה שמתנהגות שונה.
   */
  async function blacklistNow() {
    setBlacklistBusy(true);

    try {
      await fetch(`/api/blacklist/${leadId}`, { method: "POST" });
      router.refresh();
    } finally {
      setBlacklistBusy(false);
      setBlacklistAsk(false);
    }
  }

  async function undo() {
    setUndoing(true);
    await fetch(`/api/leads/${leadId}/undo`, { method: "POST" });
    setUndoing(false);
    router.refresh();
  }

  return (
    <>
      <div className="actions">
        <CallLink
          className="btn call"
          phone={phone}
          mobileTemplate={dialerMobile}
          desktopTemplate={dialerDesktop}
        >
          התקשר
        </CallLink>
        <button className="btn primary" onClick={() => setStatusOpen(true)}>
          שנה סטטוס
        </button>
      </div>

      <div className="actions" style={{ marginTop: 10 }}>
        <button
          className="btn"
          onClick={() => setSendOpen(true)}
          disabled={doNotContact}
        >
          {doNotContact ? "ברשימת אי-פנייה" : "שלח תבנית"}
        </button>
        <button
          className="btn"
          onClick={() => setKnowledgeOpen(true)}
          disabled={doNotContact}
        >
          שלח תשובת שירות
        </button>
      </div>

      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => setTaskOpen(true)}>
          פתח משימה עם תזכורת
        </button>
      </div>

      {/*
        הסרה ידנית מדיוור.

        הבוט מזהה בקשות הסרה לבד, אבל לא כל בקשה מגיעה
        כהודעה: לקוח אומר את זה בטלפון, או שאתה פשוט יודע
        שאין טעם. בלי הכפתור הזה הדרך היחידה הייתה לקוות
        שהוא יכתוב את זה בוואטסאפ.
      */}
      {!doNotContact && (
        <div className="actions" style={{ marginTop: 10 }}>
          {blacklistAsk ? (
            <>
              <span style={{ fontSize: 13, color: "#b54708", alignSelf: "center" }}>
                לא לשלוח לו דיוור יותר?
              </span>
              <button
                className="btn"
                disabled={blacklistBusy}
                onClick={blacklistNow}
                style={{ background: "#b42318", color: "#fff", border: "none" }}
              >
                {blacklistBusy ? "מוסיף..." : "כן, הסר מדיוור"}
              </button>
              <button className="btn" onClick={() => setBlacklistAsk(false)}>
                ביטול
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setBlacklistAsk(true)}>
              הסר מדיוור
            </button>
          )}
        </div>
      )}

      {(botMuted || pausedActive) && (
        <div
          className="card"
          style={{ margin: "10px 0 0", padding: 12, background: "#fff7ed" }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {botMuted
              ? "הבוט מושתק מול הלקוח הזה"
              : "אתה בשיחה - הבוט שותק כרגע"}
          </div>
          {pausedActive && !botMuted && (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
              עד{" "}
              {new Date(botPausedUntil!).toLocaleString("he-IL", {
                timeZone: "Asia/Jerusalem",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
          <button
            className="btn"
            style={{ height: 40, marginTop: 10 }}
            onClick={() => botAction("unmute")}
            disabled={undoing}
          >
            החזר את הבוט לפעולה
          </button>
        </div>
      )}

      {!botMuted && !pausedActive && (
        <div className="actions" style={{ marginTop: 10 }}>
          <button
            className="btn"
            onClick={() => botAction("mute")}
            disabled={undoing}
          >
            השתק את הבוט מול הלקוח הזה
          </button>
        </div>
      )}

      {canUndo && (
        <div className="actions" style={{ marginTop: 10 }}>
          <button className="btn" onClick={undo} disabled={undoing}>
            {undoing ? "מבטל..." : "בטל את השינוי האוטומטי האחרון"}
          </button>
        </div>
      )}

      {statusOpen && (
        <StatusSheet
          leadId={leadId}
          current={status}
          currentSub={currentSub}
          statuses={statuses}
          subStatuses={subStatuses}
          onClose={() => setStatusOpen(false)}
        />
      )}

      {taskOpen && (
        <AddTaskSheet
          leadId={leadId}
          leadName={leadName}
          onClose={() => setTaskOpen(false)}
        />
      )}

      {knowledgeOpen && (
        <SendKnowledgeSheet
          leadId={leadId}
          items={knowledge}
          onClose={() => setKnowledgeOpen(false)}
        />
      )}

      {sendOpen && (
        <SendTemplateSheet
          leadId={leadId}
          firstName={firstName}
          templates={templates}
          onClose={() => setSendOpen(false)}
        />
      )}
    </>
  );
}
