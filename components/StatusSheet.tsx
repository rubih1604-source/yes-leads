"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

export default function StatusSheet({
  leadId,
  current,
  statuses,
  onClose,
}: {
  leadId: string;
  current: string;
  statuses: StatusDef[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function pick(status: string) {
    if (busy) return;
    if (status === current) {
      onClose();
      return;
    }

    setBusy(status);
    setError("");

    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "השינוי לא נשמר. נסה שוב.");
      setBusy(null);
    }
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet">
        <h3>בחר סטטוס</h3>
        {error && <div className="error" style={{ margin: "0 6px 8px" }}>{error}</div>}
        {statuses.map((s) => (
          <button
            key={s.name}
            className="status-option"
            data-current={s.name === current}
            onClick={() => pick(s.name)}
            disabled={busy !== null}
          >
            <span className="dot" style={{ background: s.color }} />
            <span>{s.name}</span>
            {busy === s.name && (
              <span style={{ marginInlineStart: "auto", color: "#64748b", fontSize: 14 }}>
                שומר...
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
