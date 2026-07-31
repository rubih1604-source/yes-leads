"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

export type SubStatusRow = {
  id: string;
  statusName: string;
  name: string;
};

export default function SubStatusEditor({
  statuses,
  subStatuses,
}: {
  statuses: StatusDef[];
  subStatuses: SubStatusRow[];
}) {
  const [statusName, setStatusName] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function add() {
    if (!statusName || !name.trim()) {
      setError("צריך לבחור סטטוס ולכתוב שם");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/substatuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusName, name }),
    });
    if (res.ok) {
      setName("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "ההוספה נכשלה");
    }
    setBusy(false);
  }

  async function seed() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/substatuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "הטעינה נכשלה");
    else if (data.created === 0)
      setError('צריך קודם ליצור סטטוס בשם "מחכה למבצע"');
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/substatuses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "המחיקה נכשלה");
    }
    setBusy(false);
    router.refresh();
  }

  const grouped = subStatuses.reduce<Record<string, SubStatusRow[]>>(
    (acc, row) => {
      (acc[row.statusName] ??= []).push(row);
      return acc;
    },
    {}
  );

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>תת-סטטוסים</div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        סטטוס אומר איפה הליד עומד. תת-סטטוס אומר מה חשוב ללקוח — ממירים,
        ספורט, סטרימינג, מחיר. לפי זה אפשר לשלוח מבצע ממוקד.
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="empty" style={{ margin: "0 0 12px" }}>
          <strong>אין עדיין תת-סטטוסים</strong>
          אפשר לטעון את ארבעת המוכנים למחכה למבצע, או להוסיף משלך.
        </div>
      ) : (
        <div className="timeline" style={{ margin: "0 0 14px" }}>
          {Object.entries(grouped).map(([status, rows]) => (
            <div className="event" key={status}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{status}</div>
              {rows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                  }}
                >
                  <span style={{ fontSize: 14 }}>{row.name}</span>
                  <button
                    className="btn"
                    style={{
                      marginInlineStart: "auto",
                      height: 30,
                      flex: "0 0 auto",
                      fontSize: 13,
                      color: "#b42318",
                    }}
                    onClick={() => remove(row.id)}
                    disabled={busy}
                  >
                    מחק
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <select
        className="field"
        value={statusName}
        onChange={(e) => setStatusName(e.target.value)}
      >
        <option value="">— לאיזה סטטוס —</option>
        {statuses.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>

      <input
        className="field"
        placeholder="שם התת-סטטוס — למשל: חשוב ללקוח ספורט"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="btn" onClick={seed} disabled={busy}>
          טען מוכנים
        </button>
        <button className="btn primary" onClick={add} disabled={busy}>
          {busy ? "שומר..." : "הוסף"}
        </button>
      </div>
    </div>
  );
}
