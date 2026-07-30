"use client";

import { useState } from "react";
import StatusSheet from "./StatusSheet";
import SendTemplateSheet, { type TemplateOption } from "./SendTemplateSheet";
import SendKnowledgeSheet, { type KnowledgeOption } from "./SendKnowledgeSheet";
import type { StatusDef } from "@/lib/statuses";
import AddTaskSheet from "./AddTaskSheet";
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

  async function undo() {
    setUndoing(true);
    await fetch(`/api/leads/${leadId}/undo`, { method: "POST" });
    setUndoing(false);
    router.refresh();
  }

  return (
    <>
      <div className="actions">
        <a className="btn call" href={`tel:${phone}`}>
          התקשר
        </a>
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
          statuses={statuses}
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
