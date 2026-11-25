"use client";

import { useState } from "react";
import { checkPhone } from "@/lib/phone-valid";
import { looksLikeExistingCustomer } from "@/lib/leadmanager-mapping";

/**
 * ============================================================
 *  הטופס שהלקוח רואה
 * ============================================================
 *
 *  **מה שהוא צריך להיות.** דף נחיתה שנפתח מתוך מודעה,
 *  בנייד, בשנייה. כל שדה מיותר הוא לקוח שלא השאיר פרטים.
 *
 *  **שתי בדיקות רצות לפני השליחה, ושתיהן חוסכות שיחה:**
 *
 *   1. **מספר טלפון** - הלקוח עומד מול המסך ויכול לתקן
 *      ספרה חסרה בשנייה. עדיף שיתקן עכשיו מאשר שתגלה
 *      בשיחה שלא נענית.
 *
 *   2. **מנוי קיים** - מי שבוחר yes או סטינג כבר לקוח
 *      שלנו. הוא לא ליד, והוא לא נכנס למערכת: הוא מקבל
 *      את מספר השירות. ככה הרשימה שלך נשארת נקייה
 *      מפניות שאין בהן מכירה.
 */

/**
 * אותה רשימה בדיוק שבטופס בפייסבוק.
 *
 * רשימה שונה בין שני הטפסים הייתה אומרת ששתי התשובות
 * לא ניתנות להשוואה, ושחלק מהלידים היו מגיעים עם ספק
 * שאין לו מקבילה בשני.
 *
 * **יס\סטינג היא אפשרות אחת ולא שתיים** - כי שתיהן
 * מנוי קיים, והבחירה הזו היא הבחירה היחידה שעוצרת את
 * השליחה.
 */
/**
 * מה נבחר כשמנוי קיים לוחץ "מנוי נוסף בכתובת אחרת".
 *
 * **לא מחזירים אותו לרשימה עם תשובה ריקה**, כי אז הוא
 * יבחר yes שוב וייחסם שוב, בלולאה. הבחירה הזו אומרת
 * בדיוק מה המצב, והיא לא נחסמת.
 */
const SECOND_HOME = "כתובת נוספת (מנוי קיים)";

const DEFAULT_SUPPLIERS = [
  "הוט / נקסט",
  "יס\\סטינג",
  "פרטנר",
  "סלקום",
  "Free TV",
  "אחר / ללא ספק",
];

export default function PublicLeadForm({
  formId,
  askSupplier,
  suppliers,
  brandColor,
  existingMsg,
  consentText,
  requireConsent,
}: {
  formId: string;
  askSupplier: boolean;
  suppliers: string[];
  brandColor: string;
  existingMsg: string;
  consentText: string;
  requireConsent: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [supplier, setSupplier] = useState("");
  const [website, setWebsite] = useState(""); // מלכודת לבוטים
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [touched, setTouched] = useState(false);

  const base = suppliers.length > 0 ? suppliers : DEFAULT_SUPPLIERS;

  /**
   * "כתובת נוספת" מופיעה ברשימה **רק אחרי** שנבחרה.
   *
   * אחרת כל אחד היה בוחר אותה מראש ועוקף את החסימה, וזה
   * בדיוק מה שסגרנו עכשיו.
   */
  const list = supplier === SECOND_HOME ? [...base, SECOND_HOME] : base;

  const phoneCheck = checkPhone(phone);
  const showPhoneError = touched && phone.trim().length > 3 && !phoneCheck.valid;

  /**
   * **אותה פונקציה שהקליטה משתמשת בה.**
   *
   * כלל נפרד בדפדפן היה נפרד מהכלל בשרת ברגע שאחד מהם
   * משתנה, ואז לקוח היה נחסם במסך אחד ולא באחר. כלל אחד,
   * שני מקומות.
   */
  const isExisting =
    supplier.trim().length > 0 &&
    looksLikeExistingCustomer({ supplier_question: supplier });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);

    /**
     * מנוי קיים נעצר **לפני** השליחה.
     *
     * הוא לא נכנס כליד, לא מתריע, ולא מופיע ברשימה - הוא
     * פשוט מקבל את מספר השירות. זה מה שמשאיר את הרשימה
     * נקייה מפניות שאין בהן מכירה.
     */
    if (isExisting) {
      setBlocked(true);
      return;
    }

    if (!name.trim() || name.trim().length < 2) {
      setError("נא למלא שם מלא");
      return;
    }

    if (!phoneCheck.valid) {
      setError(phoneCheck.reason ?? "מספר הטלפון אינו תקין");
      return;
    }

    if (requireEmail && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("נא למלא כתובת מייל תקינה");
      return;
    }

    if (requireSupplier && askSupplier && !supplier.trim()) {
      setError("נא לבחור את הספק הנוכחי");
      return;
    }

    setBusy(true);
    setError("");

    const res = await fetch(`/api/public-form/${formId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        supplier_question: supplier,
        consent: requireConsent ? "1" : "",
        website,
      }),
    }).catch(() => null);

    const data = (await res?.json().catch(() => ({}))) ?? {};

    if (!res?.ok || data.error) {
      setError(data.error || "אירעה תקלה. נסו שוב.");
      setBusy(false);
      return;
    }

    /** השרת זיהה מנוי קיים - מכבדים את ההכרעה שלו */
    if (data.existingCustomer) {
      setBlocked(true);
      setBusy(false);
      return;
    }

    setDone(true);
    setBusy(false);
  }

  /* ---------- מנוי קיים ---------- */
  if (blocked) {
    return (
      <div style={{ textAlign: "center", padding: "28px 4px" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `${brandColor}14`,
            color: brandColor,
            fontSize: 28,
            lineHeight: "56px",
            margin: "0 auto 16px",
          }}
        >
          ★
        </div>

        <h2
          style={{
            fontSize: 21,
            margin: "0 0 10px",
            lineHeight: 1.4,
            color: "#fff",
          }}
        >
          אתם כבר אצלנו
        </h2>

        <p
          style={{
            color: "#a0a0a8",
            fontSize: 15.5,
            lineHeight: 1.7,
            margin: "0 0 22px",
          }}
        >
          {existingMsg}
        </p>

        <a
          href="tel:*2080"
          style={{
            display: "block",
            padding: "15px",
            fontSize: 17,
            fontWeight: 800,
            /** טקסט כהה על התכלת - היא בהירה מדי ללבן */
            color: "#101828",
            background: brandColor,
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          חיוג לשירות *2080
        </a>

        {/**
         * ============================================================
         *  הדרך היחידה חזרה היא מנוי נוסף
         * ============================================================
         *
         *  **קודם היה כאן "טעות? חזרה לטופס", וזה היה פתח
         *  פתוח לעקיפה.** מי שבחר yes או סטינג יכול היה
         *  ללחוץ, לשנות תשובה, ולהיכנס כליד - והרשימה שלך
         *  מתמלאת במנויים קיימים שאין בהם מכירה.
         *
         *  המקרה האמיתי היחיד הוא מנוי קיים שרוצה מנוי
         *  **נוסף בכתובת אחרת**, וזו מכירה לכל דבר. לכן זו
         *  הדלת היחידה, והיא אומרת בדיוק מה היא - בלי
         *  לרמוז שאפשר "לתקן" את התשובה.
         */}
        <button
          onClick={() => {
            setBlocked(false);
            setSupplier(SECOND_HOME);
          }}
          style={{
            width: "100%",
            marginTop: 16,
            padding: "14px",
            fontSize: 16.5,
            fontWeight: 700,
            color: "#fff",
            background: "transparent",
            border: `1.5px solid ${brandColor}`,
            borderRadius: 10,
            cursor: "pointer",
            fontFamily: "inherit",
            lineHeight: 1.4,
          }}
        >
          מנוי נוסף בכתובת אחרת?
          <span
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 400,
              color: "#a0a0a8",
              marginTop: 4,
            }}
          >
            לחצו כאן להשארת פרטים
          </span>
        </button>
      </div>
    );
  }

  /* ---------- נשלח ---------- */
  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "32px 4px" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `${brandColor}1a`,
            color: brandColor,
            fontSize: 30,
            lineHeight: "56px",
            margin: "0 auto 16px",
          }}
        >
          ✓
        </div>

        <h2 style={{ fontSize: 22, margin: "0 0 10px", color: "#fff" }}>
          קיבלנו, תודה!
        </h2>

        <p style={{ color: "#a0a0a8", fontSize: 15.5, lineHeight: 1.7 }}>
          ניצור איתך קשר בהקדם עם ההצעה המשתלמת ביותר עבורך.
        </p>
      </div>
    );
  }

  const field: React.CSSProperties = {
    width: "100%",
    padding: "13px 14px",
    fontSize: 16, // 16 ומעלה מונע זום אוטומטי בנייד
    borderRadius: 10,
    border: "1px solid #d0d5dd",
    background: "#fff",
    marginBottom: 12,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={submit} noValidate>
      <input
        style={field}
        placeholder="שם מלא"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

      <input
        style={{
          ...field,
          direction: "ltr",
          textAlign: "left",
          marginBottom: showPhoneError ? 4 : 12,
          borderColor: showPhoneError ? "#f04438" : "#d0d5dd",
        }}
        placeholder="טלפון נייד"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onBlur={() => setTouched(true)}
        inputMode="tel"
        autoComplete="tel"
      />

      {showPhoneError ? (
        <div style={{ color: "#b42318", fontSize: 13, margin: "0 0 12px" }}>
          {phoneCheck.reason}
        </div>
      ) : null}

      <input
        style={{ ...field, direction: "ltr", textAlign: "left" }}
        placeholder={requireEmail ? "מייל" : "מייל (לא חובה)"}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        inputMode="email"
        autoComplete="email"
      />

      {askSupplier ? (
        <>
          <label
            style={{
              display: "block",
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              margin: "6px 0 8px",
            }}
          >
            איפה אתם היום?
            {requireSupplier ? (
              <span style={{ color: brandColor }}> *</span>
            ) : null}
          </label>

          <select
            style={{ ...field, appearance: "none" }}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">בחרו את הספק הנוכחי</option>
            {list.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {/* שדה מלכודת: מוסתר מבני אדם, נראה לבוטים */}
      <input
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      {/**
       * ============================================================
       *  ההסכמה היא הלחיצה, ולא תיבת סימון
       * ============================================================
       *
       *  **למה אין כאן תיבה מסומנת מראש.** תיבה שמסומנת
       *  בשביל הלקוח ואי אפשר להוריד אותה לא מוכיחה שום
       *  דבר - היא מוכיחה שהמערכת סימנה, לא שהוא הסכים.
       *  כאסמכתא היא שווה אפס, ובדיוק במקרה שבו תצטרך
       *  אותה היא לא תעזור.
       *
       *  מה שכן מחזיק זה בדיוק מה שיש בטופס של פייסבוק:
       *  המשפט כתוב מעל הכפתור, **הלחיצה היא ההסכמה**, ואי
       *  אפשר לשלוח בלעדיה. וזה גם מה שרצית בפועל: כל מי
       *  שנכנס לרשימה הסכים, בלי יוצא מן הכלל.
       *
       *  הראיה עצמה נשמרת בשרת: מתי, מאיזו כתובת, ומה
       *  בדיוק היה כתוב באותו רגע.
       */}
      {requireConsent ? (
        <p
          style={{
            fontSize: 12.5,
            color: "#a0a0a8",
            lineHeight: 1.65,
            margin: "2px 0 14px",
          }}
        >
          {consentText}
        </p>
      ) : null}

      {error ? (
        <div
          style={{
            background: "#fef3f2",
            color: "#b42318",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        style={{
          width: "100%",
          padding: "15px",
          fontSize: 17,
          fontWeight: 700,
          /** טקסט כהה על התכלת, אחרת לא נקרא */
          color: "#101828",
          background: busy ? "#5a5a60" : brandColor,
          border: "none",
          borderRadius: 10,
          cursor: busy ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {busy ? "שולח..." : "רוצה לשמוע הצעה"}
      </button>

      <p
        style={{
          fontSize: 12.5,
          color: "#71717a",
          textAlign: "center",
          marginTop: 14,
          lineHeight: 1.6,
        }}
      >
        הפרטים נשמרים לצורך יצירת קשר בלבד.
      </p>
    </form>
  );
}
