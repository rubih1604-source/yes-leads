"use client";

import { useState } from "react";

/**
 * ============================================================
 *  אבחון - למה הדבר הזה לא קרה
 * ============================================================
 *
 *  **למה המסך הזה קיים.**
 *
 *  כל הבדיקות האלה היו קיימות כנתיבי API בלבד, בלי מסך -
 *  כלומר אפשר היה להגיע אליהן רק בהקלדת כתובת ידנית.
 *  בפועל זה אומר שהן לא היו קיימות.
 *
 *  כאן הן במקום אחד: מקליד טלפון, מקבל תשובה בעברית.
 */

type Answer = {
  title: string;
  verdict: string;
  details: Array<{ label: string; value: string }>;
  raw: unknown;
};

const CHECKS = [
  {
    key: "lead",
    label: "למה הליד לא ברשימה",
    hint: "האם הליד נקלט, של מי הוא, ולמה הוא לא מופיע אצלך",
  },
  {
    key: "bot",
    label: "למה הבוט לא שאל",
    hint: "האם הוא קיבל דיוור, האם ענה, ומה עצר את הבוט",
  },
] as const;

type CheckKey = (typeof CHECKS)[number]["key"];

function text(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function DiagnosticsScreen() {
  const [query, setQuery] = useState("");
  const [check, setCheck] = useState<CheckKey>("lead");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  async function run() {
    const q = query.trim();
    if (!q) return;

    setBusy(true);
    setError(null);
    setAnswer(null);
    setShowRaw(false);

    const url =
      check === "bot"
        ? `/api/diagnostics/bot-check?q=${encodeURIComponent(q)}`
        : `/api/diagnostics/trace?q=${encodeURIComponent(q)}`;

    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "הבדיקה נכשלה");
        setBusy(false);
        return;
      }

      setAnswer(
        check === "bot" ? fromBotCheck(data) : fromTrace(data)
      );
    } catch {
      setError("אין חיבור לשרת");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>אבחון</h1>
      </div>

      <div style={{ display: "grid", gap: 8, margin: "10px 0 14px" }}>
        {CHECKS.map((option) => {
          const active = option.key === check;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setCheck(option.key);
                setAnswer(null);
                setError(null);
              }}
              style={{
                textAlign: "right",
                padding: "11px 13px",
                borderRadius: 9,
                border: active ? "2px solid #1b4d8f" : "1px solid #dbe3ea",
                background: active ? "#f5f9ff" : "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>
                {option.label}
                {active ? " ✓" : ""}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#667085",
                  marginTop: 3,
                  lineHeight: 1.6,
                }}
              >
                {option.hint}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="טלפון של הליד"
          inputMode="tel"
          style={{ marginBottom: 0, flex: 1, direction: "ltr", textAlign: "left" }}
        />
        <button
          className="btn primary"
          onClick={run}
          disabled={busy || !query.trim()}
        >
          {busy ? "בודק..." : "בדוק"}
        </button>
      </div>

      {error && (
        <div
          className="card"
          style={{ marginTop: 14, background: "#fef3f2", color: "#b42318" }}
        >
          {error}
        </div>
      )}

      {answer && (
        <>
          <div
            className="card"
            style={{
              marginTop: 14,
              background: "#f5f9ff",
              border: "1px solid #c7d7ee",
            }}
          >
            <div style={{ fontSize: 13, color: "#667085", marginBottom: 5 }}>
              {answer.title}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.8, color: "#101828" }}>
              {answer.verdict}
            </div>
          </div>

          {answer.details.length > 0 && (
            <div className="card" style={{ marginTop: 10 }}>
              {answer.details.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "6px 0",
                    borderBottom: "1px solid #f2f4f7",
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ color: "#667085" }}>{row.label}</span>
                  <span style={{ fontWeight: 600, textAlign: "left" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn"
            onClick={() => setShowRaw((v) => !v)}
            style={{ marginTop: 10 }}
          >
            {showRaw ? "הסתר את הפירוט המלא" : "הצג את הפירוט המלא"}
          </button>

          {showRaw && (
            <pre
              style={{
                direction: "ltr",
                textAlign: "left",
                fontSize: 12,
                background: "#f8fafc",
                padding: 10,
                borderRadius: 8,
                overflowX: "auto",
                marginTop: 8,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(answer.raw, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- תרגום התשובות למסך ---------- */

function fromTrace(data: any): Answer {
  const visibility = data["ברשימה_שלך"];
  const lead = data.lead;

  return {
    title: "מעקב אחרי ליד",
    verdict: visibility?.reason ?? data.summary ?? "אין מידע",
    details: lead
      ? [
          { label: "שם", value: text(lead.name) },
          { label: "טלפון", value: text(lead.phone) },
          { label: "סטטוס", value: text(lead.status) },
          { label: "בעלות", value: text(lead.origin) },
          { label: "כניסות", value: text(lead.entries?.length ?? 0) },
          { label: "בקשות שהגיעו", value: text(data.arrivals?.length ?? 0) },
          {
            label: "מופיע ברשימה שלך",
            value: text(visibility?.inMyList),
          },
        ]
      : [{ label: "בקשות שהגיעו", value: text(data.arrivals?.length ?? 0) }],
    raw: data,
  };
}

function fromBotCheck(data: any): Answer {
  if (data["נמצא"] === false) {
    return { title: "למה הבוט לא שאל", verdict: data["מסקנה"], details: [], raw: data };
  }

  return {
    title: "למה הבוט לא שאל",
    verdict: data["מסקנה"] ?? "אין מידע",
    details: [
      { label: "שם", value: text(data["ליד"]?.["מי"]) },
      { label: "סטטוס", value: text(data["ליד"]?.["סטטוס"]) },
      { label: "ברשימה שחורה", value: text(data["ליד"]?.["ברשימה_שחורה"]) },
      { label: "הבוט דלוק", value: text(data["הגדרות"]?.["בוט_דלוק"]) },
      { label: "מצב הבוט", value: text(data["הגדרות"]?.["מצב"]) },
      { label: "שעות הבוט", value: text(data["הגדרות"]?.["שעות"]) },
      { label: "עובר את השער", value: text(data["שער"]?.["עובר"]) },
      { label: "סיבת השער", value: text(data["שער"]?.["סיבה"]) },
      {
        label: "הודעות יוצאות",
        value: text(data["דיוור"]?.["הודעות_יוצאות"]),
      },
      {
        label: "מזוהות כדיוור",
        value: text(data["דיוור"]?.["מזוהות_כדיוור"]),
      },
      {
        label: "ענה אחרי דיוור",
        value: data["דיוור"]?.["ענה_אחרי_דיוור"] ? "כן" : "לא",
      },
      {
        label: "שאלת הסינון נשלחה",
        value: text(data["שאלת_הסינון_נשלחה"]),
      },
    ],
    raw: data,
  };
}
