"use client";

import { useEffect, useState } from "react";

/**
 * ============================================================
 *  בריאות המערכת
 * ============================================================
 *
 *  **למה המסך הזה קיים.**
 *
 *  שני חלקים מרכזיים נכשלו בשקט במשך שעות - הבוט והמנוע
 *  שמריץ משימות מתוזמנות. השגיאות נבלעו, וכל המסכים
 *  המשיכו להראות שהכל תקין.
 *
 *  כאן רואים את האמת מהנתונים עצמם, בלי להאמין לאף אחד.
 *  מתרענן לבד כל 30 שניות, כדי שתראה אם מספר המשימות
 *  התקועות יורד.
 */

type Health = {
  המנוע: {
    רץ_לאחרונה: string;
    תקין: boolean;
    שגיאה_אחרונה: string;
  };
  זמני_שליחה: {
    איחור_ממוצע_שניות: number;
    האיחור_הגדול_שניות: number;
    מרווח_אחרון_בין_סבבים: number | null;
    מרווח_גרוע_ביממה: number | null;
    הטיימר_נרדם: boolean;
    הפעלה_חיצונית: string;
  };
  משימות: {
    שעבר_זמנן: number;
    ממתינות: number;
    נכשלו_ביממה: number;
  };
  בוט_הדיוור: {
    דלוק: boolean;
    קרס_ביממה: number;
  };
  הודעות_ללקוחות: {
    יצאו_ביממה: number;
    אושרו_כנמסרו: number;
    נכשלו: number;
    בלי_אישור_מעל_חצי_שעה: number;
    טקסטר_שולחת_אישורי_מסירה: boolean;
  };
  התראות: {
    מפתחות_מוגדרים: boolean;
    מכשירים_רשומים: number;
    מכשירים_עם_שגיאה: number;
    לידים_בלי_התראה_ביממה: number;
  };
  תנועה_ביממה: {
    הודעות_נכנסות: number;
    לידים_שנכנסו: number;
  };
  בעיות: string[];
  הערה: string;
  מסקנה: string;
};

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "7px 0",
        borderBottom: "1px solid #f2f4f7",
        fontSize: 13.5,
      }}
    >
      <span style={{ color: "#667085" }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          textAlign: "left",
          color: bad ? "#b42318" : "#101828",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function SystemHealth() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/health/system", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) {
        setData(body);
        setError("");
      } else {
        setError(body.error ?? "הבדיקה נכשלה");
      }
    } catch {
      setError("אין חיבור לשרת");
    }
    setBusy(false);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (error) {
    return (
      <div className="card" style={{ background: "#fef3f2", color: "#b42318" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="card">בודק...</div>;
  }

  const ok = data.בעיות.length === 0;

  return (
    <>
      <div
        className="card"
        style={{
          background: ok ? "#f0fdf4" : "#fef3f2",
          border: `1px solid ${ok ? "#bbf7d0" : "#fecdca"}`,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: ok ? "#15803d" : "#b42318",
            marginBottom: ok ? 0 : 8,
          }}
        >
          {data.מסקנה}
        </div>

        {data.בעיות.map((problem) => (
          <div
            key={problem}
            style={{ fontSize: 13.5, lineHeight: 1.8, color: "#7a271a" }}
          >
            · {problem}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          המנוע — מה ששולח הודעות מתוזמנות
        </div>
        <Row
          label="רץ לאחרונה"
          value={data.המנוע.רץ_לאחרונה}
          bad={!data.המנוע.תקין}
        />
        <Row
          label="משימות שעבר זמנן"
          value={String(data.משימות.שעבר_זמנן)}
          bad={data.משימות.שעבר_זמנן > 0}
        />
        <Row label="משימות ממתינות" value={String(data.משימות.ממתינות)} />
        <Row
          label="נכשלו ביממה"
          value={String(data.משימות.נכשלו_ביממה)}
          bad={data.משימות.נכשלו_ביממה > 0}
        />
        {/**
          * ============================================================
          *  האם ההודעות יוצאות בזמן שהגדרת
          * ============================================================
          *
          *  "הגדרתי דקה והגיע אחרי 7-8 דקות" הייתה שאלה
          *  בלי מספר. כאן יש מספר.
          */}
        <Row
          label="איחור ממוצע"
          value={`${data.זמני_שליחה.איחור_ממוצע_שניות} שניות`}
          bad={data.זמני_שליחה.איחור_ממוצע_שניות > 120}
        />
        <Row
          label="האיחור הגדול ביממה"
          value={`${data.זמני_שליחה.האיחור_הגדול_שניות} שניות`}
          bad={data.זמני_שליחה.האיחור_הגדול_שניות > 180}
        />
        <Row
          label="מרווח בין סבבים"
          value={
            data.זמני_שליחה.מרווח_אחרון_בין_סבבים === null
              ? "טרם נמדד"
              : `${data.זמני_שליחה.מרווח_אחרון_בין_סבבים} שניות (אמור להיות 60)`
          }
          bad={(data.זמני_שליחה.מרווח_אחרון_בין_סבבים ?? 0) > 150}
        />
        <Row
          label="המרווח הגרוע ביממה"
          value={
            data.זמני_שליחה.מרווח_גרוע_ביממה === null
              ? "טרם נמדד"
              : `${data.זמני_שליחה.מרווח_גרוע_ביממה} שניות`
          }
          bad={data.זמני_שליחה.הטיימר_נרדם}
        />

        {data.זמני_שליחה.הטיימר_נרדם && (
          <div
            style={{
              fontSize: 12.5,
              color: "#b42318",
              background: "#fef3f2",
              padding: "10px 12px",
              borderRadius: 8,
              marginTop: 8,
              lineHeight: 1.8,
            }}
          >
            <strong>הטיימר נרדם בין בקשות.</strong> זו הסיבה שהודעות יוצאות
            באיחור ולא אחיד. הפתרון:
            <br />
            <span style={{ direction: "ltr", display: "inline-block", wordBreak: "break-all" }}>
              {data.זמני_שליחה.הפעלה_חיצונית}
            </span>
          </div>
        )}

        {data.המנוע.שגיאה_אחרונה !== "אין" && (
          <div
            style={{
              direction: "ltr",
              textAlign: "left",
              fontSize: 12,
              background: "#fef3f2",
              padding: 8,
              borderRadius: 6,
              marginTop: 8,
              wordBreak: "break-word",
            }}
          >
            {data.המנוע.שגיאה_אחרונה}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          בוט הדיוור — שאלת הסינון
        </div>
        <Row
          label="המתג"
          value={data.בוט_הדיוור.דלוק ? "דלוק" : "כבוי"}
        />
        <Row
          label="קרס ביממה"
          value={String(data.בוט_הדיוור.קרס_ביממה)}
          bad={data.בוט_הדיוור.קרס_ביממה > 0}
        />
        <div
          style={{
            fontSize: 12.5,
            color: "#667085",
            marginTop: 8,
            lineHeight: 1.7,
          }}
        >
          {data.הערה}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          הודעות ללקוחות — האם הן באמת מגיעות
        </div>
        <Row
          label="יצאו ביממה"
          value={String(data.הודעות_ללקוחות.יצאו_ביממה)}
        />
        <Row
          label="אושרו כנמסרו"
          value={String(data.הודעות_ללקוחות.אושרו_כנמסרו)}
        />
        <Row
          label="נכשלו"
          value={String(data.הודעות_ללקוחות.נכשלו)}
          bad={data.הודעות_ללקוחות.נכשלו > 0}
        />
        <Row
          label="בלי אישור מעל חצי שעה"
          value={String(data.הודעות_ללקוחות.בלי_אישור_מעל_חצי_שעה)}
          bad={
            data.הודעות_ללקוחות.טקסטר_שולחת_אישורי_מסירה &&
            data.הודעות_ללקוחות.בלי_אישור_מעל_חצי_שעה > 0
          }
        />
        <Row
          label="טקסטר שולחת אישורי מסירה"
          value={data.הודעות_ללקוחות.טקסטר_שולחת_אישורי_מסירה ? "כן" : "לא"}
          bad={!data.הודעות_ללקוחות.טקסטר_שולחת_אישורי_מסירה}
        />
        {!data.הודעות_ללקוחות.טקסטר_שולחת_אישורי_מסירה && (
          <div
            style={{
              fontSize: 12.5,
              color: "#b54708",
              marginTop: 8,
              lineHeight: 1.75,
            }}
          >
            בלי אישורי מסירה המערכת לא יכולה לדעת אם הודעה הגיעה, ולכן היא
            כותבת &quot;יצא לטקסטר&quot; ולא &quot;נמסר&quot;. זו האמת, גם אם
            היא פחות נוחה מ&quot;נשלח&quot;.
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          התראות — האם אתה בכלל מקבל
        </div>
        <Row
          label="מפתחות מוגדרים בשרת"
          value={data.התראות.מפתחות_מוגדרים ? "כן" : "לא"}
          bad={!data.התראות.מפתחות_מוגדרים}
        />
        <Row
          label="מכשירים רשומים"
          value={String(data.התראות.מכשירים_רשומים)}
          bad={data.התראות.מכשירים_רשומים === 0}
        />
        <Row
          label="מכשירים עם שגיאה"
          value={String(data.התראות.מכשירים_עם_שגיאה)}
          bad={data.התראות.מכשירים_עם_שגיאה > 0}
        />
        <Row
          label="לידים בלי התראה ביממה"
          value={String(data.התראות.לידים_בלי_התראה_ביממה)}
          bad={data.התראות.לידים_בלי_התראה_ביממה > 0}
        />
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>תנועה ביממה</div>
        <Row
          label="הודעות נכנסות"
          value={String(data.תנועה_ביממה.הודעות_נכנסות)}
        />
        <Row
          label="לידים שנכנסו"
          value={String(data.תנועה_ביממה.לידים_שנכנסו)}
          bad={data.תנועה_ביממה.לידים_שנכנסו === 0}
        />
      </div>

      <button className="btn" onClick={load} disabled={busy}>
        {busy ? "בודק..." : "רענן"}
      </button>
    </>
  );
}
