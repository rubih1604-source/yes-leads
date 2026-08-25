"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

/**
 * מי נכנס לרשימת החזרה ומתי היא מגיעה.
 */
export default function CallbackSettings({
  statuses,
  enabled,
  selected,
  morningHour,
  afternoonHour,
  cutoffHour,
}: {
  statuses: StatusDef[];
  enabled: boolean;
  selected: string[];
  morningHour: number;
  afternoonHour: number;
  cutoffHour: number;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [morning, setMorning] = useState(String(morningHour));
  const [afternoon, setAfternoon] = useState(String(afternoonHour));
  const [cutoff, setCutoff] = useState(String(cutoffHour));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(res.ok ? "נשמר" : "השמירה נכשלה");
    setBusy(false);
    router.refresh();
  }

  function toggle(name: string) {
    setPicked((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>רשימת חזרה</div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        {enabled
          ? `סטטוס ששינית עד ${cutoffHour}:00 יגיע אליך למחרת ב-${morningHour}:00. מה שאחרי — למחרת ב-${afternoonHour}:00.`
          : "כבויה. כשתפעיל, לידים בסטטוסים שתבחר ייאספו לרשימה מרוכזת שתגיע אליך פעמיים ביום."}
      </div>

      <button
        className={enabled ? "btn" : "btn primary"}
        onClick={() => patch({ callbackEnabled: !enabled })}
        disabled={busy}
      >
        {enabled ? "כבה" : "הפעל"}
      </button>

      {enabled && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, margin: "16px 2px 8px" }}>
            אילו סטטוסים נכנסים לרשימה
          </div>

          {statuses.map((s) => (
            <button
              key={s.name}
              className="status-option"
              data-current={picked.includes(s.name)}
              onClick={() => toggle(s.name)}
            >
              <span
                className="dot"
                style={{
                  background: picked.includes(s.name) ? "#12805c" : "#dbe3ea",
                }}
              />
              <span>{s.name}</span>
              <span
                className="dot"
                style={{
                  background: s.color,
                  marginInlineStart: "auto",
                  width: 9,
                  height: 9,
                }}
              />
            </button>
          ))}

          <button
            className="btn primary"
            onClick={() => patch({ callbackStatuses: picked })}
            disabled={busy}
            style={{ marginBottom: 16 }}
          >
            שמור סטטוסים
          </button>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            השעות
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, width: 70 }}>בוקר</span>
            <input
              className="field"
              type="number"
              min={0}
              max={23}
              value={morning}
              onChange={(e) => setMorning(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <span style={{ fontSize: 13, width: 70 }}>צהריים</span>
            <input
              className="field"
              type="number"
              min={0}
              max={23}
              value={afternoon}
              onChange={(e) => setAfternoon(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
          </div>

          <div
            style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}
          >
            <span style={{ fontSize: 13, width: 70 }}>שעת חיתוך</span>
            <input
              className="field"
              type="number"
              min={0}
              max={23}
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <button
              className="btn primary"
              style={{ flex: 1, height: 50 }}
              onClick={() =>
                patch({
                  callbackMorningHour: Number(morning),
                  callbackAfternoonHour: Number(afternoon),
                  callbackCutoffHour: Number(cutoff),
                })
              }
              disabled={busy}
            >
              שמור שעות
            </button>
          </div>
        </>
      )}

      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}
