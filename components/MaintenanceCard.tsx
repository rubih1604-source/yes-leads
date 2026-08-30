"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MaintenanceCard({
  count,
  duplicates = 0,
}: {
  count: number;
  duplicates?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function run() {
    setBusy(true);
    const res = await fetch("/api/maintenance/whatsapp-leads", {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setMessage(
      res.ok
        ? `${data.moved} אנשי קשר הועברו לשיחות בלבד`
        : "הפעולה נכשלה"
    );
    setBusy(false);
    router.refresh();
  }

  async function markDuplicates() {
    setBusy(true);
    const res = await fetch("/api/maintenance/duplicates", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `${data.marked} לידים סומנו ככפולים` : "הפעולה נכשלה");
    setBusy(false);
    router.refresh();
  }

  // הכרטיס תמיד מוצג - יש בו גם תיקון תאריכים

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        ניקוי רשימת הלידים
      </div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        {count > 0 ? (
          <>
            <strong>{count}</strong> אנשי קשר ברשימת הלידים נוצרו מהודעת
            וואטסאפ ולא הגיעו מליד מנגר. הם יעברו למסך השיחות בלבד — ההתכתבות
            נשמרת במלואה.
          </>
        ) : (
          "אין מה לנקות."
        )}
      </div>

      {count > 0 && (
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "מעביר..." : `העבר ${count} לשיחות בלבד`}
        </button>
      )}

      {duplicates > 0 && (
        <>
          <div style={{ fontWeight: 600, margin: "18px 0 4px" }}>
            לידים כפולים
          </div>
          <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
            <strong>{duplicates}</strong> לידים נראים כמו כפילות של ליד קיים
            (אותו שם מלא). הם יסומנו בתגית &quot;כפול&quot; ברשימה — לא יימחקו.
          </div>
          <button className="btn" onClick={markDuplicates} disabled={busy}>
            {busy ? "מסמן..." : `סמן ${duplicates} ככפולים`}
          </button>
        </>
      )}

      <div style={{ fontWeight: 600, margin: "18px 0 4px" }}>
        תאריכי כניסה
      </div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
        ליד שתאריך הכניסה שלו נקרא לא נכון מקובץ נדחק לסוף הרשימה ונראה
        כאילו נעלם. הפעולה מיישרת אותם לפי מתי הרשומה נוצרה בפועל.
      </div>
      <button
        className="btn"
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/maintenance/fix-dates", {
            method: "POST",
          });
          const data = await res.json().catch(() => ({}));
          setMessage(
            res.ok ? `${data.fixed} תאריכים תוקנו` : "הפעולה נכשלה"
          );
          setBusy(false);
          router.refresh();
        }}
        disabled={busy}
      >
        {busy ? "בודק..." : "תקן תאריכי כניסה"}
      </button>

      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}
