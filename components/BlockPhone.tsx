"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  חסימה ידנית של מספר
 * ============================================================
 *
 *  **למה זה קיים.**
 *
 *  יש אנשים שמבקשים להפסיק בהקלטה קולית או בשיחה. אין
 *  שום טקסט לזהות, ולכן שום מנגנון אוטומטי לא יתפוס
 *  אותם - והם ימשיכו לקבל דיוור.
 *
 *  מספר שעוד לא ליד נחסם גם הוא: נוצרת לו רשומה שלא
 *  מופיעה ברשימת הלידים, רק כדי שהדיוור ידלג עליו.
 */
export default function BlockPhone() {
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function block() {
    const value = phone.trim();
    if (!value) return;

    setBusy(true);
    setError("");
    setDone("");

    const res = await fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: value, note }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setDone(data["מסקנה"] ?? "נחסם");
      setPhone("");
      setNote("");
      router.refresh();
    } else {
      setError(data.error ?? "החסימה נכשלה");
    }

    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>חסום מספר ידנית</div>
      <div
        style={{
          fontSize: 12.5,
          color: "#667085",
          marginBottom: 10,
          lineHeight: 1.65,
        }}
      >
        למי שביקש להפסיק בהקלטה או בשיחה — מצבים שאין בהם טקסט לזהות.
        מספר שעוד לא ליד ייחסם גם הוא, בלי להופיע ברשימת הלידים.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          className="field"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") block();
          }}
          placeholder="0521234567"
          inputMode="tel"
          style={{
            marginBottom: 0,
            flex: 1,
            direction: "ltr",
            textAlign: "left",
          }}
        />
        <button
          className="btn primary"
          onClick={block}
          disabled={busy || !phone.trim()}
          style={{ flex: "0 0 auto" }}
        >
          {busy ? "חוסם..." : "חסום"}
        </button>
      </div>

      <input
        className="field"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="למה (לא חובה) — למשל: ביקש בהקלטה"
        style={{ marginBottom: 0 }}
      />

      {error && (
        <div className="error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}

      {done && (
        <div
          style={{
            marginTop: 8,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            lineHeight: 1.7,
            color: "#15803d",
          }}
        >
          {done}
        </div>
      )}
    </div>
  );
}
