"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type KnowledgeOption = {
  id: string;
  topic: string;
  answer: string;
};

export default function SendKnowledgeSheet({
  leadId,
  items,
  onClose,
}: {
  leadId: string;
  items: KnowledgeOption[];
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<KnowledgeOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function send(id: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/leads/${leadId}/send-knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeId: id }),
    });
    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "השליחה נכשלה");
      setBusy(false);
    }
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet">
        {confirming ? (
          <>
            <h3>לשלוח את זה?</h3>
            <div
              style={{
                background: "#fff",
                border: "1px solid #dde3ea",
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                whiteSpace: "pre-wrap",
                marginBottom: 12,
              }}
            >
              {confirming.answer}
            </div>
            {error && (
              <div className="error" style={{ margin: "0 6px 8px" }}>
                {error}
              </div>
            )}
            <div className="actions">
              <button className="btn" onClick={() => setConfirming(null)}>
                חזרה
              </button>
              <button
                className="btn primary"
                onClick={() => send(confirming.id)}
                disabled={busy}
              >
                {busy ? "שולח..." : "שלח"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>שלח תשובת שירות</h3>
            {items.length === 0 && (
              <div className="empty" style={{ margin: "0 0 8px" }}>
                <strong>אין תשובות במאגר</strong>
                היכנס למסך &quot;ידע&quot; והוסף.
              </div>
            )}
            {items.map((item) => (
              <button
                key={item.id}
                className="status-option"
                onClick={() => setConfirming(item)}
              >
                <span>{item.topic}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
