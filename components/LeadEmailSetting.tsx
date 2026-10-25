"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LeadEmailMode } from "@/lib/lead-email";

/**
 * על אילו לידים יישלח מייל.
 *
 * עד היום ההתראה על ליד חדש הגיעה מליד מנגר. טופס שלא עובר
 * דרכו - כמו טופס המכירה החדש - היה נכנס בשקט.
 */

const OPTIONS: Array<{ key: LeadEmailMode; label: string; note: string }> = [
  { key: "all", label: "כל ליד", note: "גם שלי וגם של קונים" },
  { key: "mine", label: "רק הלידים שלי", note: "לידים של קונים לא ישלחו מייל" },
  { key: "sale", label: "רק לידים של קונים", note: "שימושי כשהמכירה היא מה שחדש" },
  { key: "off", label: "בלי מייל", note: "ההתראות במסך ממשיכות כרגיל" },
];

export default function LeadEmailSetting({
  mode,
}: {
  mode: LeadEmailMode;
}) {
  const [value, setValue] = useState<LeadEmailMode>(mode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const router = useRouter();

  async function pick(next: LeadEmailMode) {
    const before = value;
    setValue(next);
    setBusy(true);
    setMessage("");

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadEmailMode: next }),
    }).catch(() => null);

    setBusy(false);

    if (!res?.ok) {
      setValue(before); // לא נשמר - מחזירים את המסך למה שבאמת מוגדר
      setMessage("ההגדרה לא נשמרה");
      return;
    }

    setMessage("נשמר");
    router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        מייל על ליד חדש
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#475467",
          marginBottom: 11,
          lineHeight: 1.6,
        }}
      >
        מגיע עם שם, טלפון, דוא&quot;ל, שאלת הספק ושם המודעה — ועם
        כפתור שפותח את הליד.
      </div>

      {OPTIONS.map((opt) => (
        <label
          key={opt.key}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            fontSize: 13.5,
            padding: "5px 0",
            lineHeight: 1.6,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <input
            type="radio"
            name="leadEmailMode"
            checked={value === opt.key}
            onChange={() => pick(opt.key)}
            disabled={busy}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>{opt.label}</strong>
            <br />
            <span style={{ fontSize: 12.5, color: "#667085" }}>{opt.note}</span>
          </span>
        </label>
      ))}

      {message && (
        <div
          style={{
            fontSize: 13,
            marginTop: 8,
            color: message === "נשמר" ? "#027a48" : "#b42318",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
