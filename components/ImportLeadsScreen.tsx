"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

type RowReport = {
  name: string | null;
  phone: string | null;
  outcome: "created" | "exists" | "nophone" | "invalid";
  detail: string;
};

const COLORS: Record<string, string> = {
  created: "#12805c",
  exists: "#98a2b3",
  nophone: "#b54708",
  invalid: "#b42318",
};

const LABELS: Record<string, string> = {
  created: "ייווצר",
  exists: "כבר קיים",
  nophone: "אין טלפון",
  invalid: "לא תקין",
};

export default function ImportLeadsScreen({
  statuses,
  saleCampaigns,
}: {
  statuses: StatusDef[];
  saleCampaigns: Array<{ id: string; name: string; pricePerLead: number }>;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"leads" | "sale">("leads");
  const [status, setStatus] = useState(statuses[0]?.name ?? "");
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{
    rows: number;
    created: number;
    exists: number;
    report: RowReport[];
  } | null>(null);
  const router = useRouter();

  async function readFile(file: File) {
    setFileName(file.name);
    setError("");
    setResult(null);
    setDone(false);

    if (/\.xlsx?$/i.test(file.name)) {
      setError(
        "אקסל לא נקרא ישירות. פתח באקסל ← קובץ ← שמירה בשם ← CSV UTF-8, והעלה את הקובץ הזה."
      );
      return;
    }

    setText(await file.text());
  }

  async function run(dryRun: boolean) {
    if (!text.trim()) {
      setError("צריך להעלות קובץ");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch("/api/import-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        fileName,
        mode,
        status,
        campaignId,
        dryRun,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setResult(data);
      setDone(!dryRun);
      if (!dryRun) router.refresh();
    } else {
      setError(data.error || "הייבוא נכשל");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          ייבוא לידים מקובץ
        </div>
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
          יוצר לידים חדשים שלא קיימים אצלנו. ליד שכבר במערכת יידלג —
          לא נדרוס לך כלום.
          <strong> הייבוא לא שולח שום הודעה.</strong>
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

        <div style={{ fontSize: 13, fontWeight: 600, margin: "4px 2px 8px" }}>
          לאן הם נכנסים
        </div>

        <div className="filters" style={{ padding: "0 0 10px" }}>
          <button
            className="chip"
            data-active={mode === "leads"}
            onClick={() => setMode("leads")}
          >
            רשימת הלידים
          </button>
          <button
            className="chip"
            data-active={mode === "sale"}
            onClick={() => setMode("sale")}
            disabled={saleCampaigns.length === 0}
          >
            מכירת לידים
          </button>
        </div>

        {mode === "leads" ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              באיזה סטטוס
            </div>
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <div
              style={{ fontSize: 12.5, color: "#98a2b3", marginBottom: 12 }}
            >
              אם בקובץ יש עמודת סטטוס עם שם שתואם — לא נשתמש בה כאן.
              הסטטוס שתבחר חל על כולם.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              לאיזה קמפיין מכירה
            </div>
            <select
              className="field"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">— בחר קמפיין —</option>
              {saleCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · ₪{c.pricePerLead}
                </option>
              ))}
            </select>
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
            disabled={busy || !result || done}
          >
            {done ? "בוצע" : "ייבא בפועל"}
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-num">{result.rows}</div>
              <div className="stat-label">שורות בקובץ</div>
            </div>
            <div className="stat">
              <div className="stat-num" style={{ color: "#12805c" }}>
                {result.created}
              </div>
              <div className="stat-label">{done ? "נוצרו" : "ייווצרו"}</div>
            </div>
            <div className="stat">
              <div className="stat-num">{result.exists}</div>
              <div className="stat-label">כבר קיימים</div>
            </div>
            <div className="stat">
              <div className="stat-num">
                {result.rows - result.created - result.exists}
              </div>
              <div className="stat-label">נדלגו</div>
            </div>
          </div>

          <div className="section-title">שורה שורה</div>
          <div className="timeline">
            {result.report.map((row, i) => (
              <div
                className="event"
                key={i}
                style={{ borderInlineStartColor: COLORS[row.outcome] }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ color: COLORS[row.outcome] }}>
                    {LABELS[row.outcome]}
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
