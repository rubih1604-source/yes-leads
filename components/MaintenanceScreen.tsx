"use client";

import { useState } from "react";

/**
 * ============================================================
 *  תחזוקה
 * ============================================================
 *
 *  עד עכשיו הפעולות האלה היו קיימות רק ככתובת, והדרך להריץ
 *  אותן הייתה לשלוח POST - דבר שאי אפשר לעשות מהדפדפן בלי
 *  כלים. זו הייתה תקלת ממשק שלי, לא שלך.
 *
 *  לכל פעולה שני כפתורים:
 *
 *    **הצג מה ישתנה** - קורא בלבד, לא נוגע בכלום.
 *    **הרץ**           - מבצע, אחרי אישור.
 *
 *  התצוגה המקדימה תמיד ראשונה. פעולה שנוגעת בנתונים לא
 *  נעשית בלחיצה אחת.
 */

type Action = {
  path: string;
  title: string;
  desc: string;
  /** פעולה שמשנה הרבה - דורשת אישור מודגש */
  heavy?: boolean;
  /** פעולה שרק קוראת - אין לה כפתור הרצה בכלל */
  readOnly?: boolean;
};

const ACTIONS: Action[] = [
  {
    path: "build-channels",
    title: "בנה ערוצים ממה שכבר מוגדר",
    desc: "אוסף את הקונים, המחירים והטפסים הקיימים לערוצים, כולל הוובוק והתבנית של כל קונה. לא מוחק שום הגדרה ותיקה.",
  },
  {
    path: "broadcast-backfill",
    title: "מי כבר קיבל את התבנית הזו",
    desc: "בודק מי מהרשימה כבר קיבל את אותה הודעה — גם משליחה קודמת מרשימת הלידים וגם מהדיוור שנעצר — ומסמן אותם, כדי שלא יקבלו פעמיים. 'הצג' קורא בלבד.",
    heavy: true,
  },
  {
    path: "test-lead-email",
    title: "שלח לעצמך מייל לדוגמה של ליד חדש",
    desc: "מראה איך תיראה ההתראה בתיבה שלך, ובודק שהכל מוגדר — בלי לחכות לליד אמיתי. 'הצג' בודק בלבד, 'הרץ' שולח מייל.",
  },
  {
    path: "sale-audit",
    readOnly: true,
    title: "למה המספר במכירת לידים הוא מה שהוא",
    desc: "מפרק את הסכום לגורמים: כמה כניסות יש, איך הן משויכות, כמה נחתמו ב-0 ₪, ומה חסר. קוראת בלבד — אין לה כפתור הרצה.",
  },
  {
    path: "channel-prices",
    title: "השלם מחיר לכניסות שנחתמו ב-0 ₪",
    desc: "ליד שנכנס לערוץ לפני שהוגדר לו מחיר נרשם כ-0 ₪, וההכנסה חסרה בדוחות. הפעולה משלימה את המחיר לפי מה שמוגדר בערוץ היום — ורק לכניסות שנחתמו ב-0.",
    heavy: true,
  },
  {
    path: "facebook-doors",
    title: "סמן לידים שהגיעו מפייסבוק",
    desc: "לידים שנכנסו מהחיבור הישיר לפני שהחותמת הייתה קיימת יקבלו אותה בדיעבד, לפי מזהה הליד ביומן הקליטה.",
  },
  {
    path: "sync-sale-leads",
    title: "החזר לידים של קונים לערוץ שלהם",
    desc: "סורק את כל הלידים ומחזיר למכירה כל מה ששייך לקמפיין או טופס של קונה. לא יוצר כניסות חדשות — רק מסמן את הקיימות.",
    heavy: true,
  },
  {
    path: "scan-unsubscribes",
    title: "סרוק היסטוריה אחרי בקשות הסרה",
    desc: "עובר על כל ההודעות הנכנסות שכבר נשמרו ומוצא מי ביקש להסיר לפני שהזיהוי היה קיים. 'הצג' מראה את כולם לפני שמשנים משהו.",
    heavy: true,
  },
  {
    path: "door-report",
    readOnly: true,
    title: "אפשר לכבות את ליד מנגר?",
    desc: "סופר כמה לידים הגיעו רק מליד מנגר ולא מהחיבור הישיר — אלה בדיוק מה שתאבד אם תכבה. קוראת בלבד.",
  },
  {
    path: "fix-names",
    title: "תקן שמות שמופיעים כפול",
    desc: "ליד שנשמר כ\"יאיר סרוסי סרוסי\" יתוקן ל\"יאיר סרוסי\". נוגע רק בשם הפרטי — הטלפון, הסטטוס, הכניסות וההיסטוריה לא משתנים. 'הצג' קורא בלבד.",
    heavy: true,
  },
  {
    path: "merge-duplicates",
    title: "אחד לידים כפולים",
    desc: "לידים שנשמרו פעמיים בגלל פורמט טלפון שונה יאוחדו לליד אחד, עם כל הכניסות וההיסטוריה.",
    heavy: true,
  },
  {
    path: "collapse-entries",
    title: "נקה כניסות שנכפלו",
    desc: "כניסות שנרשמו פעמיים על אותה הגעה בגלל באג עבר.",
    heavy: true,
  },
  {
    path: "facebook-pages",
    title: "חבר דפי פייסבוק ל-leadgen",
    desc: "בודק אילו דפים מנויים לאפליקציה ומחבר את החסרים. להריץ אחרי שמוסיפים דף חדש.",
  },
  {
    path: "fix-origins",
    title: "תקן בעלות על לידים",
    desc: "מחזיר כל ליד לבעלים הנכון לפי הכניסה האחרונה שיש לה קמפיין.",
    heavy: true,
  },
  {
    path: "whatsapp-leads",
    title: "בדוק אנשי קשר מוואטסאפ",
    desc: "מי שכתב בוואטסאפ בלי להיות ליד לא אמור להופיע ברשימת הלידים.",
  },
];

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ActionCard({ action }: { action: Action }) {
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function run(method: "GET" | "POST") {
    setBusy(method);
    setResult("");
    setConfirming(false);

    const res = await fetch(`/api/maintenance/${action.path}`, { method }).catch(
      () => null
    );

    const data = await res?.json().catch(() => ({}));
    setBusy("");

    if (!res) {
      setResult("לא ניתן להתחבר לשרת");
      return;
    }

    setResult(
      (method === "GET" ? "תצוגה מקדימה — לא שונה כלום\n\n" : "בוצע\n\n") +
        pretty(data)
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{action.title}</div>
      <div
        style={{
          fontSize: 13,
          color: "#475467",
          marginTop: 4,
          lineHeight: 1.6,
        }}
      >
        {action.desc}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={() => run("GET")}
          disabled={Boolean(busy)}
        >
          {busy === "GET"
            ? "בודק..."
            : action.readOnly
            ? "הצג"
            : "הצג מה ישתנה"}
        </button>

        {action.readOnly ? null : confirming ? (
          <>
            <button
              className="btn primary"
              style={{ background: "#b42318", borderColor: "#b42318" }}
              onClick={() => run("POST")}
              disabled={Boolean(busy)}
            >
              {busy === "POST" ? "מריץ..." : "כן, הרץ"}
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              בטל
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={() => setConfirming(true)}
            disabled={Boolean(busy)}
          >
            הרץ
          </button>
        )}
      </div>

      {confirming && (
        <div
          style={{
            fontSize: 13,
            color: "#b42318",
            marginTop: 9,
            lineHeight: 1.6,
          }}
        >
          {action.heavy
            ? "הפעולה הזו משנה נתונים של לידים. כדאי ללחוץ קודם על “הצג מה ישתנה” ולראות את הרשימה."
            : "לאישור, לחץ על “כן, הרץ”."}
        </div>
      )}

      {result && (
        <pre
          style={{
            marginTop: 11,
            background: "#f9fafb",
            border: "1px solid #eef2f7",
            borderRadius: 8,
            padding: 10,
            fontSize: 11.5,
            direction: "ltr",
            textAlign: "left",
            maxHeight: 320,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}

export default function MaintenanceScreen() {
  const [health, setHealth] = useState("");
  const [busy, setBusy] = useState(false);

  async function checkFacebook() {
    setBusy(true);
    setHealth("");

    const res = await fetch("/api/health/facebook").catch(() => null);
    const data = await res?.json().catch(() => ({}));

    setBusy(false);
    setHealth(data ? pretty(data) : "לא ניתן להתחבר לשרת");
  }

  return (
    <>
      <div
        className="card"
        style={{ marginBottom: 14, borderInlineStart: "4px solid #2e90fa" }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          בדיקת החיבור לפייסבוק
        </div>
        <div style={{ fontSize: 13, color: "#475467", lineHeight: 1.6 }}>
          אומר במשפט אחד אם החיבור הישיר מביא לידים, ומראה את ההגעות
          האחרונות עם הדלת של כל אחת. לא משנה כלום.
        </div>

        <button
          className="btn primary"
          style={{ marginTop: 11 }}
          onClick={checkFacebook}
          disabled={busy}
        >
          {busy ? "בודק..." : "בדוק עכשיו"}
        </button>

        {health && (
          <pre
            style={{
              marginTop: 11,
              background: "#f9fafb",
              border: "1px solid #eef2f7",
              borderRadius: 8,
              padding: 10,
              fontSize: 11.5,
              direction: "ltr",
              textAlign: "left",
              maxHeight: 360,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {health}
          </pre>
        )}
      </div>

      <div className="section-title">פעולות תחזוקה</div>

      {ACTIONS.map((action) => (
        <ActionCard key={action.path} action={action} />
      ))}
    </>
  );
}
