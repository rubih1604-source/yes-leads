"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

const PALETTE = [
  "#2563eb",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#f59e0b",
  "#15803d",
  "#12805c",
  "#dc2626",
  "#64748b",
];

export default function StatusesEditor({
  statuses,
}: {
  statuses: StatusDef[];
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [won, setWon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function add() {
    if (!name.trim()) {
      setError("צריך שם לסטטוס");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, won }),
    });
    if (res.ok) {
      setName("");
      setWon(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "ההוספה נכשלה");
    }
    setBusy(false);
  }

  async function remove(id?: string) {
    if (!id) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/statuses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "המחיקה נכשלה");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>סטטוסים</div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        אפשר להוסיף סטטוסים משלך. הם יופיעו בכל מקום — ברשימה, בסינון,
        ובחוקים.
      </div>

      <div className="timeline" style={{ margin: "0 0 14px" }}>
        {statuses.map((s) => (
          <div
            className="event"
            key={s.name}
            style={{ borderInlineStartColor: s.color }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="dot"
                style={{
                  background: s.color,
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  display: "inline-block",
                }}
              />
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              {s.won && (
                <span style={{ fontSize: 11, color: "#12805c", fontWeight: 700 }}>
                  סגירה
                </span>
              )}
              {!s.builtin && (
                <button
                  className="btn"
                  style={{
                    marginInlineStart: "auto",
                    height: 32,
                    flex: "0 0 auto",
                    fontSize: 13,
                    color: "#b42318",
                  }}
                  onClick={() => remove(s.id)}
                  disabled={busy}
                >
                  מחק
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <input
        className="field"
        placeholder="שם הסטטוס החדש"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div style={{ fontSize: 13, fontWeight: 600, margin: "2px 2px 8px" }}>
        צבע
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={c}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: c,
              border: color === c ? "3px solid #101828" : "1px solid #dbe3ea",
            }}
          />
        ))}
      </div>

      <button
        className="status-option"
        data-current={won}
        onClick={() => setWon(!won)}
      >
        <span
          className="dot"
          style={{ background: won ? "#12805c" : "#dbe3ea" }}
        />
        <span>זה סטטוס של סגירת עסקה</span>
      </button>

      {error && <div className="error">{error}</div>}

      <button className="btn primary" onClick={add} disabled={busy}>
        {busy ? "שומר..." : "הוסף סטטוס"}
      </button>
    </div>
  );
}
