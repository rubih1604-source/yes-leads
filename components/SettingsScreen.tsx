"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SettingsRow = {
  botEnabled: boolean;
  botOnlyOutsideHours: boolean;
  botPauseHours: number;
  replyCooldownMinutes: number;
  liveChatMinutes: number;
  onlyAfterTemplate: boolean;
  revenueTarget: number;
  afterHoursGrace: number;
  requireTemplateFirst: boolean;
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
  const [live, setLive] = useState(String(settings.liveChatMinutes));
  const [target, setTarget] = useState(String(settings.revenueTarget));
  const [grace, setGrace] = useState(String(settings.afterHoursGrace));
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
      <div className="section-title" style={{ marginTop: 8 }}>
        יעד הכנסות
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          היעד החודשי שלך
        </div>
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
          הציר בראש מסך הלידים יתמלא לפי העמלות שהגדרת על סטטוסי הסגירה.
          0 = בלי יעד.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="field"
            type="number"
            min={0}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ marginBottom: 0, flex: 1 }}
          />
          <span style={{ fontSize: 14 }}>₪</span>
          <button
            className="btn primary"
            style={{ flex: 1, height: 50 }}
            onClick={() => patch({ revenueTarget: Number(target) })}
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

      <div className="section-title">שאר החוקיות</div>

      <div className="hub" style={{ padding: "0 16px" }}>
        <a href="/rules" className="hub-item">
          <span className="glyph" aria-hidden="true">⚙</span>
          <span>
            <span className="label">חוקים</span>
            <span className="desc" style={{ display: "block" }}>
              איזו תבנית נשלחת בכל סטטוס, ואחרי כמה זמן
            </span>
          </span>
          <span className="chev" aria-hidden="true">‹</span>
        </a>

        <a href="/knowledge" className="hub-item">
          <span className="glyph" aria-hidden="true">◈</span>
          <span>
            <span className="label">מאגר הידע</span>
            <span className="desc" style={{ display: "block" }}>
              תשובות השירות שהוא שולח, מילה במילה
            </span>
          </span>
          <span className="chev" aria-hidden="true">‹</span>
        </a>

        <a href="/templates" className="hub-item">
          <span className="glyph" aria-hidden="true">◫</span>
          <span>
            <span className="label">תבניות</span>
            <span className="desc" style={{ display: "block" }}>
              התבניות המאושרות שמסונכרנות מטקסטר
            </span>
          </span>
          <span className="chev" aria-hidden="true">‹</span>
        </a>
      </div>

      {message && (
        <div style={{ margin: "16px", fontSize: 14 }}>{message}</div>
      )}
    </>
  );
}
