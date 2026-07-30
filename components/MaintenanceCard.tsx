"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MaintenanceCard({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function run() {
    setBusy(true);
    const res = await fetch("/api/maintenance/whatsapp-leads", {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setMessage(
      res.ok
        ? `${data.moved} אנשי קשר הועברו לשיחות בלבד`
        : "הפעולה נכשלה"
    );
    setBusy(false);
    router.refresh();
  }

  if (count === 0 && !message) return null;

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        ניקוי רשימת הלידים
      </div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        {count > 0 ? (
          <>
            <strong>{count}</strong> אנשי קשר ברשימת הלידים נוצרו מהודעת
            וואטסאפ ולא הגיעו מליד מנגר. הם יעברו למסך השיחות בלבד — ההתכתבות
            נשמרת במלואה.
          </>
        ) : (
          "אין מה לנקות."
        )}
      </div>

      {count > 0 && (
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "מעביר..." : `העבר ${count} לשיחות בלבד`}
        </button>
      )}

      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}
