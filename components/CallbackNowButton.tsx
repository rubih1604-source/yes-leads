"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CallbackNowButton({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function send() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/callbacks/send-now", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(data.message || (res.ok ? "נשלח" : "השליחה נכשלה"));
    setBusy(false);
    router.refresh();
  }

  if (count === 0) return null;

  return (
    <div className="card">
      <button className="btn primary" onClick={send} disabled={busy}>
        {busy ? "שולח..." : `שלח לי את הרשימה עכשיו (${count})`}
      </button>
      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}
