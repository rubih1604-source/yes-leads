"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  מה הוסר מהמסך הזה
 * ============================================================
 *
 *  כאן ישבו שעות שתיקה, דקות המתנה, חלון "שיחה חיה",
 *  ושלושת הטקסטים "מה העוזר עונה ללקוח" - מעוניין, מחוץ
 *  לשעות, ובקשת חזרה.
 *
 *  **כולם היו של הבוט הקודם, שנמחק.** אף אחד מהם לא
 *  נשלח יותר לאף לקוח. להשאיר שדות טקסט שאפשר לכתוב
 *  בהם הודעה שלא תישלח לעולם זה הדבר הגרוע מכולם, ולכן
 *  הם ירדו.
 *
 *  מה שנשאר במסך הזה הוא מה שעובד.
 */
export type SettingsRow = {
  revenueTarget: number;
};

export default function SettingsScreen({ settings }: { settings: SettingsRow }) {
  const [target, setTarget] = useState(String(settings.revenueTarget));
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
              תשובות שירות שמורות. הבוט כרגע לא שולח אותן — בוט
              הדיוור שואל שאלה אחת וקורא את התשובה, וזה הכל
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
