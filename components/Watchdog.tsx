"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  הסוכן הבודק - המסך
 * ============================================================
 *
 *  הסוכן רץ לבד כל 5 דקות ומתקן מה שהוא יכול. המסך הזה
 *  קיים כדי שתוכל לבדוק **עכשיו**, מיד אחרי ששינית משהו,
 *  ולראות בעיניים שמה שהגדרת באמת קורה - במקום לגלות
 *  יומיים אחר כך שהוא לא.
 */

type Finding = {
  code: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  count: number;
  fixed: number;
  needsYou: boolean;
};

const COLORS: Record<string, { border: string; bg: string; text: string }> = {
  high: { border: "#b42318", bg: "#fef3f2", text: "#b42318" },
  medium: { border: "#b54708", bg: "#fffaeb", text: "#b54708" },
  low: { border: "#abefc6", bg: "#f6fef9", text: "#027a48" },
};

export default function Watchdog() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function run() {
    setBusy(true);
    setError("");

    const res = await fetch("/api/watchdog", { method: "POST" }).catch(
      () => null
    );

    const data = (await res?.json().catch(() => ({}))) ?? {};

    if (!res?.ok || data.error) {
      setError(data.error || "הבדיקה נכשלה");
      setBusy(false);
      return;
    }

    setFindings(Array.isArray(data.findings) ? data.findings : []);
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-title">בדיקת מערכת</div>

      <div className="card">
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
          בודק שמה שהוגדר באמת קורה: משימות שעבר זמנן, סטטוסים עם חוק שלא
          נוצרה להם משימה, מנוע ששותק, חוקים שמצביעים על תבנית שלא קיימת,
          והעברות תקועות. <strong>מתקן מה שהוא יכול</strong> ומתריע על השאר.
          <br />
          רץ לבד כל 5 דקות — הכפתור הוא כדי לבדוק עכשיו.
        </div>

        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "בודק ומתקן..." : "בדוק עכשיו"}
        </button>

        {error ? (
          <div style={{ fontSize: 13, color: "#b42318", marginTop: 10 }}>
            {error}
          </div>
        ) : null}
      </div>

      {findings !== null ? (
        findings.length === 0 ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #abefc6",
              background: "#f6fef9",
              fontSize: 13,
              color: "#027a48",
            }}
          >
            הכל תקין. כל מה שהוגדר — קורה.
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {findings.map((f) => {
              const c = COLORS[f.severity] ?? COLORS.medium;

              return (
                <div
                  key={f.code}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: `1px solid ${c.border}`,
                    background: c.bg,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, color: c.text }}>
                    {f.title}
                  </div>

                  <div
                    style={{ fontSize: 13, color: "#475467", marginTop: 4 }}
                  >
                    {f.detail}
                  </div>

                  <div
                    style={{ fontSize: 12.5, color: "#667085", marginTop: 6 }}
                  >
                    {f.fixed > 0 ? `תוקנו ${f.fixed} מתוך ${f.count}` : null}
                    {f.needsYou ? (
                      <strong style={{ color: c.text }}>
                        {f.fixed > 0 ? " · " : ""}דורש טיפול שלך
                      </strong>
                    ) : (
                      <span style={{ color: "#027a48" }}>
                        {f.fixed > 0 ? " · טופל" : "טופל"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}
