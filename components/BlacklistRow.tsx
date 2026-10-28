"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * הוצאה מהרשימה השחורה.
 *
 * דורש אישור בכוונה: הוצאה פירושה שהאדם יתחיל לקבל דיוור
 * שוב, וזו לא פעולה שכדאי שתקרה בלחיצה מקרית.
 */
export default function BlacklistRow({
  leadId,
  name,
}: {
  leadId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/blacklist/${leadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "ההוצאה נכשלה");
        setBusy(false);
        return;
      }

      router.refresh();
    } catch {
      setError("אין חיבור לשרת");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <span style={{ fontSize: 12.5, color: "#b42318" }}>{error}</span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={{
          fontSize: 12.5,
          padding: "5px 12px",
          borderRadius: 7,
          border: "1px solid #dbe3ea",
          background: "#fff",
          color: "#475467",
          cursor: "pointer",
        }}
      >
        הוצא מהרשימה
      </button>
    );
  }

  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12.5, color: "#b54708" }}>
        {name} יקבל דיוור שוב?
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        style={{
          fontSize: 12.5,
          padding: "5px 12px",
          borderRadius: 7,
          border: "none",
          background: "#b42318",
          color: "#fff",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "מוציא..." : "כן, הוצא"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        style={{
          fontSize: 12.5,
          padding: "5px 10px",
          borderRadius: 7,
          border: "1px solid #dbe3ea",
          background: "#fff",
          color: "#475467",
          cursor: "pointer",
        }}
      >
        ביטול
      </button>
    </span>
  );
}
