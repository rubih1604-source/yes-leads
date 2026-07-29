"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SettingsRow = {
  botEnabled: boolean;
  botOnlyOutsideHours: boolean;
  botPauseHours: number;
  replyCooldownMinutes: number;
  replyInterested: string;
  replyAfterHours: string;
  replyCallback: string;
};

export default function SettingsScreen({ settings }: { settings: SettingsRow }) {
  const [pauseHours, setPauseHours] = useState(String(settings.botPauseHours));
  const [cooldown, setCooldown] = useState(String(settings.replyCooldownMinutes));
  const [tInterested, setTInterested] = useState(settings.replyInterested);
  const [tAfterHours, setTAfterHours] = useState(settings.replyAfterHours);
  const [tCallback, setTCallback] = useState(settings.replyCallback);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setMessage(res.ok ? "נשמר" : "השמירה נכשלה");
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>העוזר האוטומטי</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          {settings.botEnabled
            ? "פעיל - עונה ללקוחות ופותח לך משימות"
            : "כבוי - לקוחות שיכתבו יופיעו בהתראות בלבד"}
        </div>
        <button
          className={settings.botEnabled ? "btn" : "btn primary"}
          onClick={() => patch({ botEnabled: !settings.botEnabled })}
          disabled={busy}
        >
          {settings.botEnabled ? "כבה את הבוט" : "הדלק את הבוט"}
        </button>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          לענות רק מחוץ לשעות הפעילות
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          {settings.botOnlyOutsideHours
            ? "מופעל - בשעות העבודה אתה עונה, בערבים ובשבת הבוט מכסה"
            : "כבוי - הבוט עונה תמיד (וזז הצידה אוטומטית כשאתה נכנס לשיחה)"}
        </div>
        <button
          className="btn"
          onClick={() =>
            patch({ botOnlyOutsideHours: !settings.botOnlyOutsideHours })
          }
          disabled={busy}
        >
          {settings.botOnlyOutsideHours ? "בטל" : "הפעל"}
        </button>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          כמה זמן הבוט שותק אחרי שאתה עונה
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          ברגע שאתה שולח הודעה ללקוח מהנייד, הבוט מפסיק לענות לו למשך הזמן
          הזה. ככה הוא לא מתפרץ לשיחה שאתה מנהל.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="field"
            type="number"
            min={0}
            max={168}
            value={pauseHours}
            onChange={(e) => setPauseHours(e.target.value)}
            style={{ marginBottom: 0, flex: 1 }}
          />
          <span style={{ fontSize: 14 }}>שעות</span>
          <button
            className="btn primary"
            style={{ flex: 1, height: 50 }}
            onClick={() => patch({ botPauseHours: Number(pauseHours) })}
            disabled={busy}
          >
            שמור
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          המתנה בין תשובות לאותו לקוח
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          מונע מהבוט לענות שוב ושוב אם הלקוח שולח כמה הודעות ברצף.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="field"
            type="number"
            min={0}
            max={600}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            style={{ marginBottom: 0, flex: 1 }}
          />
          <span style={{ fontSize: 14 }}>דקות</span>
          <button
            className="btn primary"
            style={{ flex: 1, height: 50 }}
            onClick={() => patch({ replyCooldownMinutes: Number(cooldown) })}
            disabled={busy}
          >
            שמור
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          מה העוזר עונה ללקוח
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          הטקסטים נשלחים בדיוק כפי שתכתוב אותם כאן.
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          כשהלקוח מעוניין או מבקש שתתקשר (בשעות עבודה)
        </div>
        <textarea
          className="field"
          style={{ height: 70, padding: 12, resize: "vertical" }}
          value={tInterested}
          onChange={(e) => setTInterested(e.target.value)}
        />

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          אותו דבר, אבל מחוץ לשעות העבודה
        </div>
        <textarea
          className="field"
          style={{ height: 70, padding: 12, resize: "vertical" }}
          value={tAfterHours}
          onChange={(e) => setTAfterHours(e.target.value)}
        />

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          כשהלקוח ביקש שתחזור אליו בזמן מסוים
        </div>
        <textarea
          className="field"
          style={{ height: 70, padding: 12, resize: "vertical" }}
          value={tCallback}
          onChange={(e) => setTCallback(e.target.value)}
        />

        <button
          className="btn primary"
          onClick={() =>
            patch({
              replyInterested: tInterested,
              replyAfterHours: tAfterHours,
              replyCallback: tCallback,
            })
          }
          disabled={busy}
        >
          שמור טקסטים
        </button>
      </div>

      {message && (
        <div style={{ margin: "0 16px", fontSize: 14 }}>{message}</div>
      )}
    </>
  );
}
