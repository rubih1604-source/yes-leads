"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  עצירת העברות לקונה - השורה שבמסך הראשי
 * ============================================================
 *
 *  **למה כאן ולא רק בהגדרות.**
 *
 *  מתג שיושב עמוק בהגדרות הוא מתג ששוכחים להדליק ביום
 *  שישי, ושוכחים לכבות במוצאי שבת. שתי השכחות יקרות:
 *  הראשונה מעבירה לידים כשאתה לא עובד, והשנייה עוצרת
 *  לידים בלי שאף אחד יודע.
 *
 *  לכן: כבוי - שורה אחת שקטה, לחיצה אחת להדלקה. דלוק -
 *  כרטיס אדום שאי אפשר לפספס, עם מספר הלידים שמחכים.
 */
export default function SaleHoldBar({
  on,
  waiting,
  leads,
  since,
}: {
  on: boolean;
  waiting: number;
  leads: number;
  since: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");

    const res = await fetch("/api/sale-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({})) ?? {};

    if (!res?.ok || data.error) {
      setMessage(data.error || "הפעולה נכשלה");
    } else if (body.on === true) {
      setMessage("העברות עצורות. לידים ייכנסו כרגיל ולא ייצאו.");
    } else {
      setMessage(
        data.released > 0
          ? `שוחררו ${data.leads} לידים. יוצאים תוך דקה.`
          : "אין מה לשחרר. העברות חזרו לפעול."
      );
    }

    setBusy(false);
    router.refresh();
  }

  /* ---------- כבוי: שורה שקטה ---------- */
  if (!on) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "8px 12px",
          margin: "0 0 10px",
          borderRadius: 10,
          border: "1px solid #e4e7ec",
          background: "#fff",
          fontSize: 13,
          color: "#475467",
        }}
      >
        <span>העברות לקונה פעילות</span>
        <button
          className="btn"
          onClick={() => call({ on: true })}
          disabled={busy}
          style={{ fontSize: 12.5, padding: "5px 12px" }}
        >
          {busy ? "רגע..." : "עצור העברות"}
        </button>
      </div>
    );
  }

  /* ---------- דלוק: אי אפשר לפספס ---------- */
  return (
    <div
      style={{
        padding: 14,
        margin: "0 0 12px",
        borderRadius: 12,
        border: "1px solid #b42318",
        background: "#fef3f2",
      }}
    >
      <div style={{ fontWeight: 700, color: "#b42318", marginBottom: 4 }}>
        העברות לקונה עצורות
      </div>

      <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
        {waiting > 0 ? (
          <>
            <strong>{leads}</strong> לידים נכנסו ומחכים לשחרור. הם רשומים
            אצלך במערכת כרגיל — רק עוד לא יצאו החוצה.
          </>
        ) : (
          "עדיין לא נכנס אף ליד להמתנה."
        )}
        {since ? ` · מאז ${since}` : ""}
      </div>

      <button
        className="btn primary"
        onClick={() => call({ on: false })}
        disabled={busy}
      >
        {busy
          ? "משחרר..."
          : waiting > 0
            ? `שחרר ${leads} לידים והחזר לפעולה`
            : "החזר העברות לפעולה"}
      </button>

      {message ? (
        <div style={{ fontSize: 12.5, color: "#475467", marginTop: 10 }}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
