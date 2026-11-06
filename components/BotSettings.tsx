"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anchorsOf } from "@/lib/campaign-audience";

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
  campaignText,
}: {
  /** מתג בוט הדיוור - השליטה היחידה בבוט */
  campaignBot: boolean;
  /** הטקסט של הדיוור. רק מי שקיבל אותו מקבל תשובה */
  campaignText: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [text, setText] = useState(campaignText);
  const router = useRouter();

  /**
   * האם הטקסט שהוקלד בכלל ניתן לזיהוי.
   *
   * **אותה פונקציה בדיוק שהבוט מריץ.** מסך שבודק בכלל
   * אחר מהבוט הוא מסך שאומר "הכל טוב" על משהו שלא
   * יעבוד - וזה כבר קרה כאן.
   */
  const anchors = anchorsOf(campaignText);
  const ready = campaignText.trim().length > 0 && anchors.length > 0;

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
            דלוק. <strong>כל מי שקיבל את הדיוור ומגיב מקבל תשובה</strong> —
            בכל שעה, בכל סטטוס, גם אם יש איתו שיחה פתוחה. מי שלא קיבל את
            הדיוור לא מקבל כלום.
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

      {/**
        * ============================================================
        *  האזהרה שחייבת להיות כאן
        * ============================================================
        *
        *  מתג דלוק + שדה ריק = בוט ששותק לכולם. זה מצב
        *  שנראה בדיוק כמו "הבוט שבור", וכבר בזבזנו עליו
        *  יום. לכן הוא נאמר כאן באדום, במסך עצמו, ולא
        *  מחכה שתחפש אותו באבחון.
        */}
      {campaignBot && !ready && (
        <div
          style={{
            marginTop: 12,
            padding: "11px 13px",
            borderRadius: 9,
            background: "#fef3f2",
            border: "1px solid #fecdca",
            color: "#b42318",
            fontSize: 13,
            lineHeight: 1.75,
          }}
        >
          <strong>המתג דלוק אבל הבוט לא יענה לאף אחד.</strong>
          <br />
          {campaignText.trim().length === 0
            ? "לא הכנסת את טקסט הדיוור למטה. הבוט עונה רק למי שקיבל את הדיוור, ובלי הטקסט הוא לא יודע מי זה."
            : `הטקסט שהכנסת קצר מדי לזיהוי. צריך משפט רצוף של 12 אותיות לפחות — הדבק את ההודעה המלאה ששלחת.`}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, margin: "18px 2px 6px" }}>
        טקסט הדיוור ששלחת
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: "#475467",
          marginBottom: 8,
          lineHeight: 1.75,
        }}
      >
        הדבק כאן את ההודעה <strong>כפי ששלחת אותה</strong>. הבוט יענה רק למי
        שההודעה הזו הגיעה אליו — ולא ללקוחות פרטיים, לחברים, או
        למי שדיברת איתו לפני חודשיים.
        <br />
        מותר להשאיר את המשתנים של התבנית ({"{{1}}"}) — הם מדולגים
        אוטומטית.
      </div>

      <textarea
        className="field"
        style={{ height: 120, padding: 12, resize: "vertical" }}
        value={text}
        placeholder="היי {{1}}, מבצע חדש של yes: ..."
        onChange={(e) => setText(e.target.value)}
      />

      <button
        className="btn primary"
        onClick={() => patch({ campaignText: text })}
        disabled={busy}
      >
        שמור את טקסט הדיוור
      </button>

      {campaignText.trim().length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 9,
            background: ready ? "#f0fdf4" : "#fef3f2",
            fontSize: 12.5,
            color: ready ? "#15803d" : "#b42318",
            lineHeight: 1.75,
          }}
        >
          {ready ? (
            <>
              <strong>הטקסט מזוהה.</strong> הבוט מחפש את הקטע הזה
              בהודעות שיצאו:
              <br />
              <span style={{ color: "#475467" }}>
                &quot;{anchors[0].slice(0, 70)}
                {anchors[0].length > 70 ? "..." : ""}&quot;
              </span>
            </>
          ) : (
            <strong>הטקסט קצר מדי לזיהוי.</strong>
          )}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, margin: "18px 2px 6px" }}>
        מה שלא נמען מקבל
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: "#475467",
          marginBottom: 4,
          lineHeight: 1.75,
        }}
      >
        <strong>שום דבר.</strong> מי שכותב לך ולא קיבל את הדיוור —
        ההודעה נשמרת, אתה מקבל התראה &quot;לקוח ענה&quot;, ואתה עונה
        לו בעצמך. הבוט לא נוגע בו.
        <br />
        חריג אחד: בקשת הסרה נרשמת תמיד, גם ממי שלא קיבל דיוור.
      </div>

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
        שואל <strong>את מי שקיבל את הדיוור וכתב</strong> אם הוא כבר לקוח
        של yes/sting.
        <br />
        ענה שכן — מפנה ל*2080 ומעביר ל&quot;לקוח קיים&quot;.
        <br />
        ענה שלא — &quot;מעולה, אתפנה ואיצור איתכם קשר. מתי נוח
        לכם?&quot;, ונכנס למתעניינים.
        <br />
        <strong>ואז קורא את השעה שהוא עונה</strong> ופותח לך תזכורת
        עם השם והמספר: &quot;עוד שעה&quot;, &quot;מחר בבוקר&quot;
        (9:00), &quot;ביום שני ב-11&quot;. כמה שאמרו אותו דבר נפרסים
        בקפיצות של 5 דקות.
        <br />
        לא הבין שעה — מבקש לדייק פעם אחת, ואז פותח לך התראה.
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
