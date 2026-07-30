"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** קיצורי זמן נפוצים, כדי לא להתעסק עם בורר תאריכים */
function presetTimes(): Array<{ label: string; value: string }> {
  const now = new Date();
  const out: Array<{ label: string; value: string }> = [];

  const at = (hours: number, minutes: number, dayOffset = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hours, minutes, 0, 0);
    return toLocalInput(d);
  };

  out.push({ label: "בעוד שעה", value: toLocalInput(new Date(now.getTime() + 3600000)) });

  if (now.getHours() < 17) out.push({ label: "היום ב-17:00", value: at(17, 0) });
  if (now.getHours() < 19) out.push({ label: "היום ב-19:00", value: at(19, 0) });

  out.push({ label: "מחר ב-9:00", value: at(9, 0, 1) });
  out.push({ label: "מחר ב-12:00", value: at(12, 0, 1) });

  return out;
}

/** ממיר לפורמט של שדה datetime-local, בשעון המקומי */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function AddTaskSheet({
  leadId,
  leadName,
  onClose,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(`להתקשר ל${leadName}`);
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function save() {
    if (!title.trim()) {
      setError("צריך כותרת");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch(`/api/leads/${leadId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        urgent,
      }),
    });

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "השמירה נכשלה");
      setBusy(false);
    }
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet">
        <h3>משימה חדשה</h3>

        <input
          className="field"
          placeholder="מה צריך לעשות"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="field"
          style={{ height: 80, padding: 12, resize: "vertical" }}
          placeholder="פרטים (לא חובה)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <div style={{ fontSize: 13, fontWeight: 600, margin: "4px 2px 8px" }}>
          מתי להתריע לך במייל
        </div>

        <div className="filters" style={{ padding: "0 0 10px" }}>
          {presetTimes().map((p) => (
            <button
              key={p.label}
              className="chip"
              data-active={dueAt === p.value}
              onClick={() => setDueAt(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          className="field"
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />

        <button
          className="status-option"
          data-current={urgent}
          onClick={() => setUrgent(!urgent)}
        >
          <span className="dot" style={{ background: urgent ? "#12805c" : "#dbe3ea" }} />
          <span>לסמן כדחוף</span>
        </button>

        {error && <div className="error">{error}</div>}

        <div className="actions" style={{ marginTop: 6 }}>
          <button className="btn" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "שומר..." : "שמור משימה"}
          </button>
        </div>
      </div>
    </div>
  );
}
