"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

type RowReport = {
  name: string | null;
  phone: string | null;
  outcome: "updated" | "already" | "ambiguous" | "notfound" | "nostatus";
  detail: string;
  leadId?: string;
};

const OUTCOME_COLORS: Record<string, string> = {
  updated: "#12805c",
  already: "#98a2b3",
  ambiguous: "#b54708",
  notfound: "#98a2b3",
  nostatus: "#b54708",
};

const OUTCOME_LABELS: Record<string, string> = {
  updated: "עודכן",
  already: "כבר מעודכן",
  ambiguous: "כפילות - דלג",
  notfound: "לא נמצא",
  nostatus: "בלי סטטוס",
};

export default function ImportScreen({ statuses }: { statuses: StatusDef[] }) {
  const wonStatuses = statuses.filter((s) => s.won);

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [target, setTarget] = useState(wonStatuses[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    rows: number;
    matched: number;
    updated: number;
    report: RowReport[];
  } | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function readFile(file: File) {
    setFileName(file.name);
    setError("");
    setPreview(null);
    setDone(false);

    if (/\.xlsx?$/i.test(file.name)) {
      setError(
        "קובץ אקסל לא נקרא ישירות. פתח אותו באקסל, בחר קובץ ← שמירה בשם ← CSV UTF-8, והעלה את הקובץ הזה."
      );
      return;
    }

    const content = await file.text();
    setText(content);
  }

  async function run(dryRun: boolean) {
    if (!text.trim()) {
      setError("צריך להעלות קובץ");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, fileName, targetStatus: target, dryRun }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setPreview(data);
      setDone(!dryRun);
      if (!dryRun) router.refresh();
    } else {
      setError(data.error || "העיבוד נכשל");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>דוח מכירות</div>
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
          העלה קובץ CSV והמערכת תצליב מול הלידים ותעדכן סטטוסים.
          <strong> ההצלבה זהירה:</strong> שם שמופיע אצל שני לידים לא יעודכן —
          תקבל דיווח ותעדכן ידנית.
        </div>

        <input
          className="field"
          type="file"
          accept=".csv,.txt,text/csv"
          style={{ paddingTop: 12 }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
          }}
        />

        {wonStatuses.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, margin: "4px 2px 8px" }}>
              לאיזה סטטוס להעביר את ההתאמות
            </div>
            <select
              className="field"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12.5, color: "#98a2b3", marginBottom: 12 }}>
              אם בדוח יש עמודת סטטוס עם שם שתואם לסטטוס אצלך — הוא יגבר.
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="actions">
          <button
            className="btn"
            onClick={() => run(true)}
            disabled={busy || !text}
          >
            {busy ? "בודק..." : "תצוגה מקדימה"}
          </button>
          <button
            className="btn primary"
            onClick={() => run(false)}
            disabled={busy || !preview || done}
          >
            {done ? "בוצע" : "עדכן בפועל"}
          </button>
        </div>
      </div>

      {preview && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-num">{preview.rows}</div>
              <div className="stat-label">שורות בקובץ</div>
            </div>
            <div className="stat">
              <div className="stat-num">{preview.matched}</div>
              <div className="stat-label">נמצאה התאמה</div>
            </div>
            <div className="stat">
              <div className="stat-num" style={{ color: "#12805c" }}>
                {preview.updated}
              </div>
              <div className="stat-label">
                {done ? "עודכנו" : "יעודכנו"}
              </div>
            </div>
            <div className="stat">
              <div className="stat-num">
                {preview.rows - preview.matched}
              </div>
              <div className="stat-label">לא נמצאו</div>
            </div>
          </div>

          <div className="section-title">שורה שורה</div>
          <div className="timeline">
            {preview.report.map((row, i) => (
              <div
                className="event"
                key={i}
                style={{ borderInlineStartColor: OUTCOME_COLORS[row.outcome] }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ color: OUTCOME_COLORS[row.outcome] }}>
                    {OUTCOME_LABELS[row.outcome]}
                  </strong>
                  <span>{row.name || row.phone || "(ריק)"}</span>
                </div>
                <div className="when">{row.detail}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
