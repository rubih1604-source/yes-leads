"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * שליטה על מה שממתין בתור.
 *
 * דיוור שנכנס לתור ועוד לא יצא - אפשר לעצור אותו כאן,
 * בלי לחכות שהוא יצא ולהתחרט.
 */
export default function JobsControls({
  pending,
  bulkPending,
  nextAt,
}: {
  pending: number;
  bulkPending: number;
  nextAt: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<"all" | "bulk" | null>(null);
  const router = useRouter();

  async function cancel(scope: "all" | "bulk") {
    setBusy(true);
    const res = await fetch("/api/jobs/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `${data.cancelled} משימות בוטלו` : "הביטול נכשל");
    setConfirming(null);
    setBusy(false);
    router.refresh();
  }

  if (pending === 0) {
    return (
      <div className="card" style={{ fontSize: 14, color: "#475467" }}>
        אין משימות ממתינות בתור.
      </div>
    );
  }

  const when = nextAt
    ? new Date(nextAt).toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className="card"
      style={{ borderInlineStart: "4px solid #b54708" }}
    >
      <div style={{ fontWeight: 600 }}>
        {pending} משימות ממתינות לצאת
      </div>
      {when && (
        <div style={{ fontSize: 13, color: "#475467", marginTop: 3 }}>
          הראשונה אמורה לצאת ב-{when}
        </div>
      )}

      {confirming ? (
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setConfirming(null)}>
            לא
          </button>
          <button
            className="btn"
            style={{ background: "#b42318", color: "#fff", border: "none" }}
            onClick={() => cancel(confirming)}
            disabled={busy}
          >
            {busy ? "מבטל..." : "כן, בטל"}
          </button>
        </div>
      ) : (
        <div className="actions" style={{ marginTop: 12 }}>
          {bulkPending > 0 && (
            <button className="btn" onClick={() => setConfirming("bulk")}>
              בטל {bulkPending} דיוורים
            </button>
          )}
          <button
            className="btn"
            style={{ color: "#b42318" }}
            onClick={() => setConfirming("all")}
          >
            בטל הכל
          </button>
        </div>
      )}

      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}
