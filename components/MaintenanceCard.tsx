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

      <div
        style={{
          margin: "18px 0 4px",
          padding: 12,
          background: "#fef3f2",
          border: "1px solid #b42318",
          borderRadius: 10,
        }}
      >
        <div style={{ fontWeight: 700, color: "#b42318" }}>
          החזרת לידי מכירה למקומם
        </div>
        <div style={{ fontSize: 13, color: "#475467", margin: "6px 0 10px" }}>
          עובר על כל הלידים ומעביר למכירה כל מי ששייך לקמפיין מכירה
          רשום — כולל מי שדלף לרשימה שלך. מבטל להם גם משימות ממתינות.
        </div>
        <button
          className="btn primary"
          style={{ marginBottom: 16 }}
          onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/maintenance/sync-sale-leads", {
              method: "POST",
            });
            const data = await res.json().catch(() => ({}));
            setMessage(
              res.ok
                ? `${data.moved} לידים הועברו למכירה · ${data.cancelled} משימות בוטלו`
                : data.error || "הפעולה נכשלה"
            );
            setBusy(false);
            router.refresh();
          }}
          disabled={busy}
        >
          {busy ? "מעביר..." : "העבר לידי מכירה למקומם"}
        </button>

        <div style={{ fontWeight: 700, color: "#b42318" }}>
          עצירת הודעות ללידי מכירה
        </div>
        <div style={{ fontSize: 13, color: "#475467", margin: "6px 0 10px" }}>
          מבטל כל הודעה שממתינה לליד ששייך לקמפיין מכירה. מכאן והלאה
          המערכת חוסמת את זה לבד בשלוש נקודות.
        </div>
        <button
          className="btn primary"
          style={{ marginBottom: 16 }}
          onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/maintenance/clear-sale-jobs", {
              method: "POST",
            });
            const data = await res.json().catch(() => ({}));
            setMessage(
              res.ok ? `${data.cancelled} הודעות ללידי מכירה בוטלו` : "נכשל"
            );
            setBusy(false);
            router.refresh();
          }}
          disabled={busy}
        >
          {busy ? "מבטל..." : "בטל הודעות ללידי מכירה"}
        </button>

        <div style={{ fontWeight: 700, color: "#b42318" }}>
          תיקון סימון לקוחות קיימים
        </div>
        <div style={{ fontSize: 13, color: "#475467", margin: "6px 0 10px" }}>
          עובר ליד ליד ומיישר לפי שאלת הספק בלבד. מי שסומן בטעות חוזר
          לסטטוס שהיה לו לפני כן לפי היומן, ומשימות ממתינות שלו מבוטלות. לידים שסימנת ידנית ואין להם שאלת ספק לא ייגעו.
        </div>
        <button
          className="btn primary"
          onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/maintenance/repair-existing", {
              method: "POST",
            });
            const data = await res.json().catch(() => ({}));
            setMessage(
              res.ok
                ? `${data.reverted} תוקנו (${data.restored} חזרו לסטטוס המקורי מהיומן) · ${data.marked} סומנו כלקוח קיים · ${data.cancelled} משימות בוטלו`
                : "הפעולה נכשלה"
            );
            setBusy(false);
            router.refresh();
          }}
          disabled={busy}
        >
          {busy ? "מתקן..." : "תקן עכשיו"}
        </button>
      </div>

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
