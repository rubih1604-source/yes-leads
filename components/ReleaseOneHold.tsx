"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * שחרור של ליד אחד שמוחזק, בלי לכבות את העצירה הכללית.
 *
 * זה המקרה של "הליד הזה דחוף" באמצע שבת: הוא יוצא עכשיו,
 * והשאר ממשיכים לחכות.
 */
export default function ReleaseOneHold({ leadId }: { leadId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function release() {
    setBusy(true);

    const res = await fetch("/api/sale-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    }).catch(() => null);

    const data = (await res?.json().catch(() => ({}))) ?? {};

    setMessage(
      res?.ok && !data.error
        ? "שוחרר. יוצא תוך דקה."
        : data.error || "השחרור נכשל"
    );

    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="btn"
        onClick={release}
        disabled={busy}
        style={{ fontSize: 13 }}
      >
        {busy ? "משחרר..." : "שחרר את הליד הזה עכשיו"}
      </button>

      {message ? (
        <div style={{ fontSize: 12.5, color: "#475467", marginTop: 6 }}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
