"use client";

import { useState } from "react";

/**
 * בודק שהמייל באמת עובד, ומראה את השגיאה האמיתית.
 * תזכורת שלא מגיעה היא מכירה שאובדת, אז שווה לדעת מיד.
 */
export default function EmailCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message?: string;
    problem?: string;
    to?: string;
  } | null>(null);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/diagnostics/email", { cache: "no-store" });
      setResult(await res.json());
    } catch {
      setResult({ ok: false, problem: "לא הצלחתי להריץ את הבדיקה" });
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>בדיקת מייל</div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
        שולח מייל בדיקה. אם משהו לא מוגדר או נחסם — תראה כאן בדיוק מה.
      </div>

      <button className="btn" onClick={check} disabled={busy}>
        {busy ? "שולח..." : "שלח מייל בדיקה"}
      </button>

      {result && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            fontSize: 14,
            background: result.ok ? "#dcfce7" : "#fef3f2",
            border: `1px solid ${result.ok ? "#16a34a" : "#b42318"}`,
            color: result.ok ? "#14532d" : "#7a271a",
          }}
        >
          {result.ok ? result.message : result.problem}
        </div>
      )}
    </div>
  );
}
