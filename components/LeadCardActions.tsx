"use client";

import { useState } from "react";
import StatusSheet from "./StatusSheet";
import SendTemplateSheet, { type TemplateOption } from "./SendTemplateSheet";
import { useRouter } from "next/navigation";

export default function LeadCardActions({
  leadId,
  phone,
  status,
  firstName,
  templates,
  doNotContact,
  canUndo,
}: {
  leadId: string;
  phone: string;
  status: string;
  firstName: string;
  templates: TemplateOption[];
  doNotContact: boolean;
  canUndo: boolean;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const router = useRouter();

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
      </div>

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
          onClose={() => setStatusOpen(false)}
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
