"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * הפעלת התראות דחיפה מהמכשיר.
 *
 * באייפון זה עובד רק כשהאפליקציה מותקנת ממסך הבית. אם
 * פותחים מסימנייה או מתוך ספארי - הדפדפן פשוט לא מציע
 * את האפשרות, ולכן מסבירים את זה כאן במקום להשאיר כפתור
 * שלא עושה כלום.
 */

/**
 * המפתח מגיע כ-base64url וצריך להגיע לדפדפן כמערך בתים.
 * ArrayBuffer מפורש, כי טיפוסי הדפדפן דורשים בדיוק את זה.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);

  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

  return buffer;
}

export default function PushSetup() {
  const [state, setState] = useState<{
    configured: boolean;
    publicKey: string | null;
    devices: number;
    מכשירים?: Array<{
      שם: string;
      נוסה_לאחרונה: string | null;
      עבד_לאחרונה: string | null;
      שגיאה: string | null;
      תקין: boolean;
    }>;
  } | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/push/subscribe", { cache: "no-store" });
      setState(await res.json());
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    load();

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // ספארי באייפון מדווח דרך השדה הזה
      (window.navigator as { standalone?: boolean }).standalone === true;

    setStandalone(isStandalone);
    setSupported("serviceWorker" in navigator && "PushManager" in window);

    if ("Notification" in window) setPermission(Notification.permission);
  }, [load]);

  async function enable() {
    setBusy(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== "granted") {
        setMessage("ההרשאה לא ניתנה. אפשר לאשר גם מהגדרות המכשיר.");
        setBusy(false);
        return;
      }

      if (!state?.publicKey) {
        setMessage("חסר מפתח בשרת. הוסף VAPID_PUBLIC_KEY ברנדר.");
        setBusy(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(state.publicKey),
      });

      const raw = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          keys: raw.keys,
          label: navigator.userAgent.slice(0, 60),
        }),
      });

      setMessage(res.ok ? "המכשיר רשום. שלח בדיקה." : "הרישום נכשל");
      load();
    } catch (err) {
      setMessage(
        err instanceof Error ? `שגיאה: ${err.message}` : "ההפעלה נכשלה"
      );
    }

    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(
      data.ok ? `נשלחה התראה ל-${data.sent} מכשירים` : data.problem || "נכשל"
    );
    setBusy(false);
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        התראות בנייד
      </div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
        התראה שקופצת על המסך הנעול, גם כשהאפליקציה סגורה. לא תלויה
        במייל ולא נופלת לספאם.
      </div>

      {!standalone && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#fef3f2",
            border: "1px solid #b42318",
            fontSize: 13.5,
            color: "#7a271a",
            marginBottom: 12,
            lineHeight: 1.7,
          }}
        >
          <strong>צריך להתקין את האפליקציה קודם.</strong>
          <br />
          באייפון: פתח את האתר ב־Safari ← כפתור השיתוף ← &quot;הוסף למסך
          הבית&quot;. אחר כך פתח מהאייקון החדש וחזור לכאן.
          <br />
          מסימנייה או מתוך הדפדפן — אייפון לא מאפשר התראות.
        </div>
      )}

      {!supported && (
        <div style={{ fontSize: 13, color: "#b42318", marginBottom: 12 }}>
          הדפדפן הזה לא תומך בהתראות דחיפה.
        </div>
      )}

      {state && !state.configured && (
        <div style={{ fontSize: 13, color: "#b54708", marginBottom: 12 }}>
          חסרים מפתחות בשרת. הוסף VAPID_PUBLIC_KEY ו-VAPID_PRIVATE_KEY
          ברנדר.
        </div>
      )}

      <div style={{ fontSize: 13, color: "#98a2b3", marginBottom: 12 }}>
        מכשירים רשומים: <strong>{state?.devices ?? 0}</strong>
        {permission === "granted" && " · ההרשאה ניתנה"}
        {permission === "denied" && " · ההרשאה נחסמה בהגדרות המכשיר"}
      </div>

      {/**
        * ============================================================
        *  מצב כל מכשיר - בלי זה אין דרך לדעת
        * ============================================================
        *
        *  "ההתראות פעם עובדות ופעם לא" הייתה שאלה בלי
        *  תשובה. כשל נכתב לקונסול של רנדר ונעלם, ומנוי
        *  שפג תוקפו נמחק בשקט - אפשר היה לא לקבל התראות
        *  שבועיים בלי שום סימן.
        */}
      {state?.devices === 0 && state.configured && (
        <div
          style={{
            padding: "11px 13px",
            borderRadius: 9,
            background: "#fef3f2",
            border: "1px solid #fecdca",
            color: "#b42318",
            fontSize: 13,
            lineHeight: 1.75,
            marginBottom: 12,
          }}
        >
          <strong>אין אף מכשיר רשום — לא תקבל שום התראה לנייד.</strong>
          <br />
          אם קיבלת התראות בעבר, המנוי פג תוקפו ונמחק. זה קורה באייפון
          כשלא פותחים את האפליקציה כמה שבועות. לחץ &quot;הפעל התראות
          במכשיר הזה&quot; למטה.
        </div>
      )}

      {(state?.מכשירים ?? []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {(state?.מכשירים ?? []).map((device, i) => (
            <div
              key={i}
              style={{
                padding: "9px 11px",
                borderRadius: 8,
                background: device.שגיאה ? "#fef3f2" : "#f8fafc",
                fontSize: 12.5,
                lineHeight: 1.7,
                marginBottom: 6,
              }}
            >
              <strong>{device.שם}</strong>
              <br />
              {device.עבד_לאחרונה ? (
                <span style={{ color: "#15803d" }}>
                  עבד לאחרונה:{" "}
                  {new Date(device.עבד_לאחרונה).toLocaleString("he-IL", {
                    timeZone: "Asia/Jerusalem",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                <span style={{ color: "#98a2b3" }}>
                  עוד לא נשלחה אליו אף התראה
                </span>
              )}
              {device.שגיאה && (
                <>
                  <br />
                  <span style={{ color: "#b42318", direction: "ltr", display: "inline-block" }}>
                    {device.שגיאה}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="actions">
        <button
          className="btn primary"
          onClick={enable}
          disabled={busy || !standalone || !supported}
        >
          {busy ? "רגע..." : "הפעל התראות במכשיר הזה"}
        </button>
        <button
          className="btn"
          onClick={test}
          disabled={busy || (state?.devices ?? 0) === 0}
        >
          שלח בדיקה
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}
