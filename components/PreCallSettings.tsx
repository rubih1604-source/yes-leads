"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NUDGES, MIN_LEAD_MINUTES, MAX_LEAD_MINUTES } from "@/lib/pre-call";

/**
 * ============================================================
 *  הדחיפה שלפני השיחה
 * ============================================================
 *
 *  **למה המסך הזה קיים בכלל.**
 *
 *  הפיצ'ר עובד לבד על כל תזכורת, בלי שום הקמה - וזו בדיוק
 *  הייתה הבעיה: אין מה להקים, ולכן גם אין איפה לראות
 *  שהוא קיים. פיצ'ר שאי אפשר לראות הוא פיצ'ר שלא בטוח
 *  שהוא עובד.
 *
 *  כאן רואים שהוא דלוק, מה בדיוק ייצא, ואפשר לבדוק אותו
 *  על הנייד בלחיצה אחת במקום לחכות לתזכורת אמיתית.
 */
export default function PreCallSettings({ on }: { on: boolean }) {
  const [state, setState] = useState(on);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState("");
  const router = useRouter();

  async function toggle() {
    const next = !state;
    setState(next);
    setBusy(true);

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preCallNudge: next }),
    }).catch(() => null);

    setBusy(false);
    router.refresh();
  }

  /**
   * בדיקה אמיתית, ולא הדמיה.
   *
   * היא עוברת באותו מסלול שהדחיפה האמיתית עוברת - אותה
   * שליחה לנייד ואותו באנר. בדיקה שמדמה משהו אחר לא
   * מוכיחה שהדבר האמיתי עובד.
   */
  async function testNow() {
    setBusy(true);
    setSent("");

    const res = await fetch("/api/tasks/nudge-test", { method: "POST" }).catch(
      () => null
    );

    const data = (await res?.json().catch(() => ({}))) ?? {};

    setSent(
      data.ok
        ? data.push > 0
          ? `נשלח למכשיר אחד ומעלה (${data.push}). תסתכל על הנייד.`
          : "הבאנר נוצר, אבל לא נשלח לאף מכשיר. צריך להפעיל התראות נייד למטה."
        : data.error || "הבדיקה נכשלה"
    );

    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        דחיפה לפני שיחה
      </div>

      <div
        style={{
          fontSize: 13,
          color: "#475467",
          marginBottom: 12,
          lineHeight: 1.65,
        }}
      >
        בין {MIN_LEAD_MINUTES} ל-{MAX_LEAD_MINUTES} דקות לפני{" "}
        <strong>כל תזכורת שיש לה שעה</strong> תקבל התראה לנייד שמזכירה לך
        להתקשר לפני שמישהו אחר יספיק.{" "}
        <strong>התזכורת עצמה לא זזה</strong> — היא נשארת בשעה שסיכמת עם
        הלקוח.
        <br />
        אין מה להקים: זה עובד על כל תזכורת חדשה מרגע שזה דלוק.
      </div>

      <button
        className="status-option"
        data-current={state}
        onClick={toggle}
        disabled={busy}
      >
        <span
          className="dot"
          style={{ background: state ? "#12805c" : "#dbe3ea" }}
        />
        <span style={{ textAlign: "start" }}>
          דחיפה לפני כל תזכורת
          <span style={{ display: "block", fontSize: 12, color: "#98a2b3" }}>
            הולך לנייד ולבאנר, לפי מה שדלוק למעלה
          </span>
        </span>
        <span
          style={{
            marginInlineStart: "auto",
            fontSize: 13,
            fontWeight: 600,
            color: state ? "#12805c" : "#98a2b3",
          }}
        >
          {state ? "פועל" : "כבוי"}
        </span>
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={testNow} disabled={busy}>
          {busy ? "שולח..." : "שלח לי דוגמה עכשיו"}
        </button>

        <button className="btn" onClick={() => setOpen(!open)}>
          {open ? "סגור את הבנק" : `הצג את הבנק (${NUDGES.length})`}
        </button>
      </div>

      {sent ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            background: "#f0f9ff",
            color: "#0b4a6f",
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          {sent}
        </div>
      ) : null}

      {open ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{ fontSize: 12.5, color: "#667085", marginBottom: 8 }}
          >
            המלל מתחלף בסבב — כל תזכורת מקבלת שורה אחרת, ואף פעם לא אותה
            שורה פעמיים ברצף.
          </div>

          {NUDGES.map((n, i) => (
            <div
              key={i}
              style={{
                fontSize: 13.5,
                color: "#344054",
                padding: "8px 10px",
                background: "#f8fafc",
                borderRadius: 8,
                marginBottom: 6,
                lineHeight: 1.5,
              }}
            >
              {n}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
