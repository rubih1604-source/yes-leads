"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TemplateOption = {
  name: string;
  displayName: string | null;
  bodyText: string | null;
};

export default function SendTemplateSheet({
  leadId,
  firstName,
  templates,
  onClose,
}: {
  leadId: string;
  firstName: string;
  templates: TemplateOption[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<TemplateOption | null>(null);
  const router = useRouter();

  async function send(templateName: string) {
    if (busy) return;
    setBusy(templateName);
    setError("");

    const res = await fetch(`/api/leads/${leadId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateName }),
    });

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "השליחה נכשלה");
      setBusy(null);
    }
  }

  const preview = confirming?.bodyText
    ? confirming.bodyText.replace(/\{\{\s*1\s*\}\}/g, firstName || "")
    : null;

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet">
        {confirming ? (
          <>
            <h3>לשלוח את ההודעה הזו?</h3>
            {preview && (
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
                {preview}
              </div>
            )}
            {error && <div className="error" style={{ margin: "0 6px 8px" }}>{error}</div>}
            <div className="actions">
              <button className="btn" onClick={() => setConfirming(null)}>
                חזרה
              </button>
              <button
                className="btn primary"
                onClick={() => send(confirming.name)}
                disabled={busy !== null}
              >
                {busy ? "שולח..." : "שלח"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>בחר תבנית</h3>
            {templates.length === 0 && (
              <div className="empty" style={{ margin: "0 0 8px" }}>
                <strong>אין תבניות</strong>
                היכנס למסך התבניות ולחץ &quot;רענן מטקסטר&quot;.
              </div>
            )}
            {templates.map((t) => (
              <button
                key={t.name}
                className="status-option"
                onClick={() => setConfirming(t)}
              >
                <span>{t.displayName || t.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
