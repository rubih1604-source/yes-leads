"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";

/**
 * כל השליטה בבוט במקום אחד:
 * דלוק או כבוי · מאיזו שעה עד איזו · על אילו סטטוסים.
 */
export default function BotSettings({
  statuses,
  enabled,
  fromHour,
  toHour,
  selected,
  pauseHours,
  cooldownMinutes,
  liveChatMinutes,
}: {
  statuses: StatusDef[];
  enabled: boolean;
  fromHour: number;
  toHour: number;
  selected: string[];
  pauseHours: number;
  cooldownMinutes: number;
  liveChatMinutes: number;
}) {
  const [from, setFrom] = useState(String(fromHour));
  const [to, setTo] = useState(String(toHour));
  const [picked, setPicked] = useState<string[]>(selected);
  const [pause, setPause] = useState(String(pauseHours));
  const [cooldown, setCooldown] = useState(String(cooldownMinutes));
  const [live, setLive] = useState(String(liveChatMinutes));
  const [advanced, setAdvanced] = useState(false);
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
      <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 4 }}>
        העוזר האוטומטי
      </div>

      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        {enabled ? (
          picked.length === 0 ? (
            <>
              דלוק, אבל <strong>לא בחרת סטטוסים</strong> — ולכן הוא לא עונה
              לאף אחד. סמן למטה.
            </>
          ) : (
            <>
              עונה בין <strong>{fromHour}:00</strong> ל-
              <strong>{toHour}:00</strong>, ורק ללידים ב-{picked.length}{" "}
              הסטטוסים שסימנת.
            </>
          )
        ) : (
          <>
            כבוי. <strong>הפעולות שלך לא מושפעות</strong> — שינוי סטטוס,
            שליחת תבנית ודיוור עובדים בכל שעה בכל מקרה.
          </>
        )}
      </div>

      <button
        className={enabled ? "btn" : "btn primary"}
        onClick={() => patch({ botEnabled: !enabled })}
        disabled={busy}
      >
        {enabled ? "כבה את הבוט" : "הדלק את הבוט"}
      </button>

      {enabled && (
        <>
          {/* ---- שעות ---- */}
          <div style={{ fontSize: 13, fontWeight: 600, margin: "18px 2px 8px" }}>
            באילו שעות הוא עונה
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, width: 40 }}>משעה</span>
            <input
              className="field"
              type="number"
              min={0}
              max={23}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <span style={{ fontSize: 13, width: 40 }}>עד</span>
            <input
              className="field"
              type="number"
              min={0}
              max={23}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <button
              className="btn primary"
              style={{ flex: "0 0 auto", height: 50 }}
              onClick={() =>
                patch({ botFromHour: Number(from), botToHour: Number(to) })
              }
              disabled={busy}
            >
              שמור
            </button>
          </div>

          <div style={{ fontSize: 12.5, color: "#98a2b3", margin: "8px 2px 0" }}>
            מחוץ לחלון הזה הוא שותק לגמרי. ההודעות עדיין נשמרות ואתה מקבל
            התראה.
          </div>

          {/* ---- סטטוסים ---- */}
          <div style={{ fontSize: 13, fontWeight: 600, margin: "18px 2px 8px" }}>
            על אילו סטטוסים הוא עונה
            {picked.length > 0 && (
              <span style={{ color: "#98a2b3", fontWeight: 400 }}>
                {" "}
                · {picked.length} נבחרו
              </span>
            )}
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
            onClick={() => patch({ botStatuses: picked })}
            disabled={busy}
          >
            שמור סטטוסים
          </button>

          {/* ---- מתקדם ---- */}
          <button
            className="btn"
            style={{ marginTop: 12 }}
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? "הסתר הגדרות מתקדמות" : "הגדרות מתקדמות"}
          </button>

          {advanced && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                כמה שעות הבוט שותק אחרי שאתה עונה ללקוח
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={pause}
                  onChange={(e) => setPause(e.target.value)}
                  style={{ marginBottom: 0, flex: 1 }}
                />
                <button
                  className="btn"
                  style={{ flex: "0 0 auto", height: 50 }}
                  onClick={() => patch({ botPauseHours: Number(pause) })}
                  disabled={busy}
                >
                  שמור
                </button>
              </div>

              <div style={{ fontSize: 13, marginBottom: 6 }}>
                דקות המתנה בין תשובות לאותו לקוח
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={cooldown}
                  onChange={(e) => setCooldown(e.target.value)}
                  style={{ marginBottom: 0, flex: 1 }}
                />
                <button
                  className="btn"
                  style={{ flex: "0 0 auto", height: 50 }}
                  onClick={() =>
                    patch({ replyCooldownMinutes: Number(cooldown) })
                  }
                  disabled={busy}
                >
                  שמור
                </button>
              </div>

              <div style={{ fontSize: 13, marginBottom: 6 }}>
                חלון זיהוי שיחה חיה, בדקות
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={live}
                  onChange={(e) => setLive(e.target.value)}
                  style={{ marginBottom: 0, flex: 1 }}
                />
                <button
                  className="btn"
                  style={{ flex: "0 0 auto", height: 50 }}
                  onClick={() => patch({ liveChatMinutes: Number(live) })}
                  disabled={busy}
                >
                  שמור
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}
