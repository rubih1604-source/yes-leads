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
  משימות: {
    שעבר_זמנן: number;
    ממתינות: number;
    נכשלו_ביממה: number;
  };
  בוט_הדיוור: {
    דלוק: boolean;
    קרס_ביממה: number;
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
