"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncTemplatesButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<string | null>(null);
  const router = useRouter();

  async function sync() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setDetails(null);

    try {
      const res = await fetch("/api/templates/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        setMessage(`נמשכו ${data.count} תבניות`);
        router.refresh();
      } else {
        setMessage(data.error || "הרענון נכשל");
        if (data.raw) setDetails(JSON.stringify(data.raw, null, 2).slice(0, 3000));
      }
    } catch {
      setMessage("שגיאת רשת - נסה שוב");
    }

    setBusy(false);
  }

  return (
    <>
      <button className="btn primary" onClick={sync} disabled={busy}>
        {busy ? "מרענן..." : "רענן מטקסטר"}
      </button>

      {message && (
        <div style={{ marginTop: 12, fontSize: 14 }}>{message}</div>
      )}

      {details && (
        <pre
          style={{
            direction: "ltr",
            textAlign: "left",
            fontSize: 11,
            background: "#f8fafc",
            padding: 10,
            borderRadius: 8,
            overflowX: "auto",
            marginTop: 10,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {details}
        </pre>
      )}
    </>
  );
}
