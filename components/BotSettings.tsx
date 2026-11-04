"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  הבוט - מתג אחד
 * ============================================================
 *
 *  **מה היה כאן, ולמה זה הוסר.**
 *
 *  המסך הזה החזיק שעות פעילות, בחירת סטטוסים, מצב "רק
 *  דיוור / כל הודעה", שעות שתיקה אחרי תשובה שלך, דקות
 *  המתנה בין תשובות וחלון "שיחה חיה". כל אחד מהם היה
 *  חסימה אמיתית בבוט הקודם, וכל אחד מהם השתיק אותו בשקט.
 *
 *  הבוט הקודם נמחק מהמערכת, **ולכן כל הכפתורים האלה כבר
 *  לא עשו כלום**. להשאיר אותם היה הדבר הגרוע מכולם: מסך
 *  שמבטיח שליטה שאינה קיימת, ושולח אותך לכבות ולהדליק
 *  דברים שלא משנים שום דבר כשמשהו לא עובד.
 *
 *  מה שנשאר הוא מה שיש: מתג אחד.
 */
export default function BotSettings({
  campaignBot,
}: {
  /** מתג בוט הדיוור - השליטה היחידה בבוט */
  campaignBot: boolean;
}) {
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

  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 4 }}>
        בוט הדיוור
      </div>

      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14, lineHeight: 1.7 }}>
        {campaignBot ? (
          <>
            דלוק. <strong>כל מי שכותב מקבל תשובה</strong> — בכל שעה, בכל
            סטטוס, גם אם יש איתו שיחה פתוחה.
          </>
        ) : (
          <>
            כבוי. הודעות נכנסות נשמרות ואתה מקבל התראה, אבל{" "}
            <strong>שום דבר לא נשלח ללקוח אוטומטית</strong>.
          </>
        )}
      </div>

      <button
        className={campaignBot ? "btn" : "btn primary"}
        onClick={() => patch({ campaignBot: !campaignBot })}
        disabled={busy}
      >
        {campaignBot ? "כבה את הבוט" : "הדלק את הבוט"}
      </button>

      <div
        style={{
          marginTop: 14,
          padding: "11px 13px",
          borderRadius: 9,
          background: "#f8fafc",
          fontSize: 12.5,
          color: "#475467",
          lineHeight: 1.8,
        }}
      >
        <strong>מה הוא עושה, במלואו:</strong>
        <br />
        שואל את מי שכותב אם הוא כבר לקוח של yes/sting.
        <br />
        ענה שכן — מפנה ל*2080 ומעביר ל&quot;לקוח קיים&quot;.
        <br />
        ענה שלא — &quot;מעולה, אתפנה ואיצור איתכם קשר&quot;, ונכנס
        למתעניינים.
        <br />
        לא ברור — שואל שוב פעם אחת, ואז מעביר אליך עם התראה.
        <br />
        ביקש הסרה — נכנס לרשימה השחורה ולא מקבל כלום.
        <br />
        <br />
        אחרי שהתהליך נסגר מול מספר — <strong>שקט מולו 24 שעות</strong>.
        מדליקים לפני הדיוור, מכבים אחריו.
      </div>

      {message && <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>}
    </div>
  );
}
