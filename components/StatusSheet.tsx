"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

/**
 * בורר סטטוס בשני שלבים.
 *
 * סטטוס רגיל נשמר בלחיצה אחת. סטטוס שיש לו תת-סטטוסים
 * (למשל "מחכה למבצע") פותח שלב שני - מה חשוב ללקוח.
 * זה מה שמאפשר אחר כך לשלוח מבצע ממוקד.
 */
export default function StatusSheet({
  leadId,
  current,
  currentSub,
  statuses,
  subStatuses = {},
  onClose,
}: {
  leadId: string;
  current: string;
  currentSub?: string | null;
  statuses: StatusDef[];
  subStatuses?: Record<string, string[]>;
  onClose: () => void;
}) {
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function save(status: string, subStatus: string | null) {
    if (busy) return;

    if (status === current && subStatus === (currentSub ?? null)) {
      onClose();
      return;
    }

    setBusy(subStatus ?? status);
    setError("");

    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, subStatus }),
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

  function pick(status: string) {
    const subs = subStatuses[status];
    if (subs && subs.length > 0) {
      setPendingStatus(status);
      return;
    }
    save(status, null);
  }

  const subsForPending = pendingStatus
    ? subStatuses[pendingStatus] ?? []
    : [];

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet">
        {error && (
          <div className="error" style={{ margin: "0 6px 8px" }}>
            {error}
          </div>
        )}

        {pendingStatus ? (
          <>
            <h3>{pendingStatus} — מה חשוב ללקוח?</h3>

            <button
              className="status-option"
              data-current={!currentSub}
              onClick={() => save(pendingStatus, null)}
              disabled={busy !== null}
            >
              <span>בלי סימון</span>
            </button>

            {subsForPending.map((sub) => (
              <button
                key={sub}
                className="status-option"
                data-current={currentSub === sub}
                onClick={() => save(pendingStatus, sub)}
                disabled={busy !== null}
              >
                <span>{sub}</span>
                {busy === sub && (
                  <span
                    style={{
                      marginInlineStart: "auto",
                      color: "#98a2b3",
                      fontSize: 14,
                    }}
                  >
                    שומר...
                  </span>
                )}
              </button>
            ))}

            <button
              className="btn"
              style={{ marginTop: 6 }}
              onClick={() => setPendingStatus(null)}
              disabled={busy !== null}
            >
              חזרה
            </button>
          </>
        ) : (
          <>
            <h3>בחר סטטוס</h3>

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
                {(subStatuses[s.name]?.length ?? 0) > 0 && (
                  <span
                    style={{
                      marginInlineStart: "auto",
                      color: "#98a2b3",
                      fontSize: 13,
                    }}
                  >
                    ‹
                  </span>
                )}
                {busy === s.name && (
                  <span
                    style={{
                      marginInlineStart: "auto",
                      color: "#98a2b3",
                      fontSize: 14,
                    }}
                  >
                    שומר...
                  </span>
                )}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
