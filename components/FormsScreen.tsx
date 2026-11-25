"use client";

import { useEffect, useRef, useState } from "react";
import {
  LOGO_MAX_WIDTH,
  LOGO_MAX_HEIGHT,
  checkLogo,
  isEmbeddedLogo,
} from "@/lib/logo-image";

/**
 * ============================================================
 *  ניהול טופסי הלידים
 * ============================================================
 *
 *  **הרעיון בשורה אחת:** קישור לכל פלטפורמה.
 *
 *  מפרסם ב-ChatGPT? קישור אחד. בטיקטוק? קישור שני. אותו
 *  טופס בדיוק, אבל כל אחד יודע מאיפה הוא - ולכן כל ליד
 *  שנכנס מסומן במקור הנכון **בלי שתצטרך לזכור לסמן**.
 *
 *  וזה גם מה שנותן השוואה אמיתית: אותו טופס, אותה שאלה,
 *  פלטפורמות שונות. כמה ראו, כמה השאירו.
 *
 *  ============================================================
 *   למה יש כאן עריכה ולא רק יצירה
 *  ============================================================
 *
 *  **המחיר משתנה, הקישור לא.**
 *
 *  הקישור כבר יושב בתוך מודעה פעילה. אם שינוי מבצע היה
 *  מחייב קישור חדש, היית צריך לערוך כל מודעה מחדש בכל
 *  פלטפורמה - ולאבד את מספרי הצפיות וההמרה שנצברו על
 *  הקישור הקודם. לכן עריכה משנה את אותו הקישור במקום,
 *  והמודעות ממשיכות לעבוד.
 */

type Form = {
  id: string;
  name: string;
  source: string;
  campaignName: string | null;
  title: string;
  subtitle: string | null;
  askSupplier: boolean;
  active: boolean;
  views: number;
  submissions: number;
  logoUrl: string | null;
  brandColor: string;
  priceAmount: string | null;
  pricePeriod: string;
  priceNote: string | null;
  offerDetails: string | null;
  images: string | null;
  suppliers: string | null;
  benefits: string | null;
  existingMsg: string;
  consentText: string;
  requireConsent: boolean;
  requireEmail: boolean;
  requireSupplier: boolean;
};

/** התכלת של yes, כפי שהיא מוגדרת אצלם: --yes-blue-100 */
const YES_BLUE = "#00D8FE";

/** אותו נוסח שמופיע בטופס בפייסבוק */
const DEFAULT_CONSENT =
  "בהשארת הפרטים אני מסכים/ה שנציג מטעם חברת yes ייצור עמי קשר בנוגע להצעה, וכן לקבל מ-yes עדכונים ומבצעים עתידיים באמצעות WhatsApp. ניתן לבטל את ההסכמה לדיוור בכל עת. הפרטים יישמרו ויעובדו בהתאם למדיניות הפרטיות.";

const EMPTY = {
  id: "",
  name: "",
  source: "",
  campaignName: "",
  title: "קבלו הצעה משתלמת מ-yes",
  subtitle: "משאירים פרטים ומקבלים הצעה אישית",
  askSupplier: true,
  logoUrl: "",
  brandColor: YES_BLUE,
  priceAmount: "",
  pricePeriod: "לחודש",
  priceNote: "",
  offerDetails: "",
  images: "",
  suppliers: "",
  /**
   * ברירת מחדל שנשענת על מה שיס עצמה מציגה: ספריית תכנים
   * וסדרות מקור, צפייה בכל מסך, והקלטה בשידור חי. אפשר
   * לשנות לפני היצירה - זה רק טקסט פתיחה, לא כלל.
   */
  benefits:
    "מאות ערוצים, סדרות מקור של yes וספריית VOD גדולה\nצפייה בכל מסך בבית ומחוצה לו\nהקלטה, עצירה וחזרה אחורה בשידור חי\nליווי אישי מרגע הפנייה ועד החיבור",
  existingMsg: "",
  consentText: DEFAULT_CONSENT,
  requireConsent: true,
  requireEmail: false,
  requireSupplier: false,
};

export default function FormsScreen({ origin }: { origin: string }) {
  const [forms, setForms] = useState<Form[]>([]);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  /**
   * ============================================================
   *  העלאת הלוגו
   * ============================================================
   *
   *  התמונה מוקטנת **בדפדפן, לפני השמירה**. אם היא הייתה
   *  נשמרת כמו שצולמה, כל פתיחה של דף הנחיתה הייתה גוררת
   *  מגה-בייטים ברשת סלולרית - ולקוח שמחכה הוא לקוח
   *  שסוגר את הדף.
   *
   *  PNG ולא JPEG בכוונה: ללוגו יש רקע שקוף, ו-JPEG היה
   *  הופך אותו לריבוע לבן על דף שחור.
   */
  function pickLogo(file: File) {
    setError("");

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(
          LOGO_MAX_WIDTH / img.width,
          LOGO_MAX_HEIGHT / img.height,
          1
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setError("לא הצלחתי לקרוא את התמונה");
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const data = canvas.toDataURL("image/png");
        const check = checkLogo(data);

        if (!check.ok) {
          setError(check.reason ?? "התמונה אינה מתאימה");
          return;
        }

        setDraft((d) => ({ ...d, logoUrl: data }));
      };

      img.onerror = () => setError("הקובץ אינו תמונה תקינה");
      img.src = String(reader.result ?? "");
    };

    reader.onerror = () => setError("לא הצלחתי לקרוא את הקובץ");
    reader.readAsDataURL(file);
  }

  async function load() {
    const res = await fetch("/api/forms").catch(() => null);
    const data = (await res?.json().catch(() => ({}))) ?? {};
    setForms(Array.isArray(data.forms) ? data.forms : []);
  }

  useEffect(() => {
    load();
  }, []);

  /**
   * פתיחת קישור קיים לעריכה.
   *
   * כל שדה נטען כמו שהוא בבסיס הנתונים. `?? ""` ולא
   * ברירת מחדל: שדה שרוקנת בכוונה צריך להיפתח ריק, אחרת
   * הוא היה חוזר לבד בכל פתיחה.
   */
  function edit(form: Form) {
    setDraft({
      id: form.id,
      name: form.name,
      source: form.source,
      campaignName: form.campaignName ?? "",
      title: form.title,
      subtitle: form.subtitle ?? "",
      askSupplier: form.askSupplier,
      logoUrl: form.logoUrl ?? "",
      brandColor: form.brandColor || YES_BLUE,
      priceAmount: form.priceAmount ?? "",
      pricePeriod: form.pricePeriod || "לחודש",
      priceNote: form.priceNote ?? "",
      offerDetails: form.offerDetails ?? "",
      images: form.images ?? "",
      suppliers: form.suppliers ?? "",
      benefits: form.benefits ?? "",
      existingMsg: form.existingMsg ?? "",
      consentText: form.consentText || DEFAULT_CONSENT,
      requireConsent: form.requireConsent ?? true,
      requireEmail: form.requireEmail ?? false,
      requireSupplier: form.requireSupplier ?? false,
    });
    setAdding(true);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setBusy(true);
    setError("");

    /** בלי מזהה זה קישור חדש, ועם מזהה זה עדכון לאותו קישור */
    const payload = draft.id ? draft : { ...draft, id: undefined };

    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    const data = (await res?.json().catch(() => ({}))) ?? {};

    if (!res?.ok || data.error) {
      setError(data.error || "השמירה נכשלה");
      setBusy(false);
      return;
    }

    setDraft({ ...EMPTY });
    setAdding(false);
    setBusy(false);
    await load();
  }

  async function toggle(form: Form) {
    await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: form.id, active: !form.active }),
    }).catch(() => null);
    await load();
  }

  function copy(id: string) {
    const link = `${origin}/f/${id}`;
    navigator.clipboard?.writeText(link).catch(() => null);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  }

  const field: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14.5,
    borderRadius: 8,
    border: "1px solid #d0d5dd",
    marginBottom: 10,
    fontFamily: "inherit",
  };

  const groupTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "#344054",
    margin: "16px 0 8px",
    paddingTop: 12,
    borderTop: "1px solid #eaecf0",
  };

  const imageCount = draft.images
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean).length;

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          טופסי לידים
          <span className="count">{forms.length}</span>
        </h1>
      </div>

      <div
        style={{
          fontSize: 13.5,
          color: "#475467",
          lineHeight: 1.7,
          margin: "4px 0 16px",
        }}
      >
        טופס משלך, שאפשר לחבר לכל פלטפורמת פרסום — גם כאלה שאין בהן טופס
        מובנה כמו בפייסבוק. <strong>קישור נפרד לכל פלטפורמה</strong>, וכל
        ליד שנכנס מסומן אוטומטית במקור ההגעה שלו. הלידים נכנסים בדיוק כמו
        מפייסבוק: אותן התראות, אותם חוקים, אותו בוט.
      </div>

      {!adding ? (
        <button className="btn primary" onClick={() => setAdding(true)}>
          קישור חדש
        </button>
      ) : (
        <div className="card">
          {draft.id ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                background: "#f0f9ff",
                color: "#0b4a6f",
                padding: "9px 11px",
                borderRadius: 8,
                marginBottom: 12,
                lineHeight: 1.6,
              }}
            >
              עריכת קישור קיים — <strong>{draft.name}</strong>
              <div style={{ fontWeight: 400, marginTop: 3 }}>
                הכתובת לא משתנה, והמודעות שמחוברות אליה ממשיכות לעבוד.
              </div>
            </div>
          ) : null}

          <div style={{ ...groupTitle, marginTop: 0, paddingTop: 0, border: "none" }}>
            זיהוי
          </div>

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            שם הקישור (לשימוש שלך)
          </label>
          <input
            style={field}
            placeholder="מבצע 149 — ChatGPT"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            מקור ההגעה — יופיע על כל ליד שנכנס דרכו
          </label>
          <input
            style={field}
            placeholder="ChatGPT Ads"
            value={draft.source}
            onChange={(e) => setDraft({ ...draft, source: e.target.value })}
          />

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            שיוך לקמפיין קיים (לא חובה) — כדי שהסינון לפי קמפיין יתפוס
          </label>
          <input
            style={field}
            placeholder="מבצע-149 שח 10.11.26"
            value={draft.campaignName}
            onChange={(e) =>
              setDraft({ ...draft, campaignName: e.target.value })
            }
          />

          <div style={groupTitle}>מה שהלקוח רואה</div>

          <label style={{ fontSize: 12.5, color: "#667085" }}>כותרת הדף</label>
          <input
            style={field}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            שורת משנה (לא חובה)
          </label>
          <input
            style={field}
            placeholder="משאירים פרטים ומקבלים הצעה אישית"
            value={draft.subtitle}
            onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
          />

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            הלוגו (לא חובה) — מוצג בראש הדף
          </label>

          {draft.logoUrl ? (
            <div
              style={{
                background: "#121212",
                borderRadius: 10,
                padding: "14px 12px",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.logoUrl}
                alt=""
                style={{ height: 40, maxWidth: "100%", objectFit: "contain" }}
              />
              <div
                style={{ fontSize: 11.5, color: "#71717a", marginTop: 8 }}
              >
                ככה הוא ייראה על הדף
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => fileRef.current?.click()}
              style={{ fontSize: 13 }}
            >
              {draft.logoUrl ? "החלף תמונה" : "העלה תמונה"}
            </button>

            {draft.logoUrl ? (
              <button
                type="button"
                className="btn"
                onClick={() => setDraft({ ...draft, logoUrl: "" })}
                style={{ fontSize: 13 }}
              >
                הסר
              </button>
            ) : null}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickLogo(f);
              e.target.value = "";
            }}
          />

          {!isEmbeddedLogo(draft.logoUrl) ? (
            <>
              <div style={{ fontSize: 12, color: "#98a2b3", marginBottom: 6 }}>
                או הדבק כתובת תמונה, אם יש לך
              </div>
              <input
                style={{ ...field, direction: "ltr", textAlign: "left" }}
                placeholder="https://..."
                value={draft.logoUrl}
                onChange={(e) =>
                  setDraft({ ...draft, logoUrl: e.target.value })
                }
              />
            </>
          ) : null}

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            צבע המותג
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              type="color"
              value={draft.brandColor}
              onChange={(e) =>
                setDraft({ ...draft, brandColor: e.target.value })
              }
              style={{
                width: 48,
                height: 42,
                padding: 2,
                border: "1px solid #d0d5dd",
                borderRadius: 8,
                background: "#fff",
              }}
            />
            <input
              style={{ ...field, marginBottom: 0, direction: "ltr", textAlign: "left" }}
              value={draft.brandColor}
              onChange={(e) =>
                setDraft({ ...draft, brandColor: e.target.value })
              }
            />
          </div>

          {/* ============================================================
           *  המבצע
           * ========================================================= */}
          <div style={groupTitle}>המבצע</div>

          <div
            style={{
              fontSize: 12.5,
              color: "#667085",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            זה מה שמוצג בגדול בראש הדף. אפשר לשנות בכל רגע —{" "}
            <strong>הכתובת נשארת אותה כתובת</strong>, ולא צריך לגעת במודעה.
            שדה ריק פשוט לא יוצג.
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12.5, color: "#667085" }}>מחיר</label>
              <input
                style={field}
                placeholder="149 ₪"
                value={draft.priceAmount}
                onChange={(e) =>
                  setDraft({ ...draft, priceAmount: e.target.value })
                }
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12.5, color: "#667085" }}>לכמה זמן</label>
              <input
                style={field}
                placeholder="לחודש"
                value={draft.pricePeriod}
                onChange={(e) =>
                  setDraft({ ...draft, pricePeriod: e.target.value })
                }
              />
            </div>
          </div>

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            הערה מתחת למחיר (לא חובה)
          </label>
          <input
            style={field}
            placeholder="ל-12 חודשים · ללא התחייבות"
            value={draft.priceNote}
            onChange={(e) => setDraft({ ...draft, priceNote: e.target.value })}
          />

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            פירוט המבצע — שורה לכל שורה, כל אחת מקבלת ✓
          </label>
          <textarea
            style={{ ...field, minHeight: 92, resize: "vertical" }}
            placeholder={
              "חבילת yes Total + ממיר\nמאות ערוצים וכל הסדרות\nהתקנה והתחברות ללא עלות"
            }
            value={draft.offerDetails}
            onChange={(e) =>
              setDraft({ ...draft, offerDetails: e.target.value })
            }
          />

          {/* ============================================================
           *  גרפיקה
           * ========================================================= */}
          <div style={groupTitle}>גרפיקה (לא חובה)</div>

          <div
            style={{
              fontSize: 12.5,
              color: "#667085",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            כתובת תמונה בכל שורה. <strong>הדף מסדר אותן לבד</strong>: אחת
            כבאנר רחב, שתיים-שלוש ברצועה, ארבע ומעלה ברשת — אין מה להגדיר.
          </div>

          <textarea
            style={{
              ...field,
              minHeight: 74,
              resize: "vertical",
              direction: "ltr",
              textAlign: "left",
            }}
            placeholder={"https://.../banner.jpg\nhttps://.../remote.png"}
            value={draft.images}
            onChange={(e) => setDraft({ ...draft, images: e.target.value })}
          />

          {imageCount > 0 ? (
            <div
              style={{ fontSize: 12.5, color: "#0b4a6f", margin: "-4px 0 10px" }}
            >
              {imageCount === 1
                ? "תמונה אחת — תוצג כבאנר רחב בראש הדף"
                : imageCount <= 3
                  ? `${imageCount} תמונות — יוצגו ברצועה אחת זו לצד זו`
                  : `${imageCount} תמונות — יוצגו ברשת של שתיים בשורה`}
            </div>
          ) : null}

          <div style={groupTitle}>הטופס עצמו</div>

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            רשימת הספקים, מופרדים בפסיקים (ריק = ברירת מחדל)
          </label>
          <input
            style={field}
            placeholder="הוט / נקסט, יס\\סטינג, פרטנר, סלקום, Free TV, אחר / ללא ספק"
            value={draft.suppliers}
            onChange={(e) => setDraft({ ...draft, suppliers: e.target.value })}
          />

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            נקודות ערך — שורה לכל נקודה, מוצגות מתחת לטופס
          </label>
          <textarea
            style={{ ...field, minHeight: 86, resize: "vertical" }}
            placeholder={"מאות ערוצים וסדרות מקור\nהתקנה מהירה ללא עלות\nליווי אישי עד החיבור"}
            value={draft.benefits}
            onChange={(e) => setDraft({ ...draft, benefits: e.target.value })}
          />

          <label style={{ fontSize: 12.5, color: "#667085" }}>
            הודעה למנוי קיים (yes או סטינג) — הוא לא ייכנס כליד
          </label>
          <input
            style={field}
            placeholder="הינך מנוי קיים של חברת yes. לקבלת שירות אנא פנה ל-*2080"
            value={draft.existingMsg}
            onChange={(e) =>
              setDraft({ ...draft, existingMsg: e.target.value })
            }
          />

          {/* ============================================================
           *  ההסכמה
           * ========================================================= */}
          <div style={groupTitle}>ההסכמה לפני השליחה</div>

          <div
            style={{
              fontSize: 12.5,
              color: "#667085",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            המשפט מופיע מעל כפתור השליחה, ו<strong>הלחיצה עצמה היא
            ההסכמה</strong> — בדיוק כמו בטופס של פייסבוק. אין מה לסמן, ואי
            אפשר לשלוח בלי זה, כך שכל מי שנכנס לרשימה הסכים.
            <br />
            על כל ליד נשמרת האסמכתא: מתי נשלח, מאיזו כתובת, ומה בדיוק היה
            כתוב באותו רגע — גם אם תשנה את הנוסח אחר כך.
          </div>

          <textarea
            style={{ ...field, minHeight: 104, resize: "vertical" }}
            value={draft.consentText}
            onChange={(e) =>
              setDraft({ ...draft, consentText: e.target.value })
            }
          />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              margin: "4px 0 12px",
            }}
          >
            <input
              type="checkbox"
              checked={draft.requireConsent}
              onChange={(e) =>
                setDraft({ ...draft, requireConsent: e.target.checked })
              }
            />
            להציג את משפט ההסכמה ולשמור אסמכתא
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              margin: "4px 0 12px",
            }}
          >
            <input
              type="checkbox"
              checked={draft.askSupplier}
              onChange={(e) =>
                setDraft({ ...draft, askSupplier: e.target.checked })
              }
            />
            לשאול מי הספק הנוכחי
          </label>

          {/* ============================================================
           *  מה חובה
           * ========================================================= */}
          <div style={groupTitle}>שדות חובה</div>

          <div
            style={{
              fontSize: 12.5,
              color: "#667085",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            שם וטלפון חובה תמיד — בלעדיהם אין ליד. את השאר אתה מחליט לכל
            קישור בנפרד. <strong>שדה חובה מקטין כמות ומעלה איכות</strong>,
            וזה שיקול שתלוי בפלטפורמה ובמבצע.
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              margin: "4px 0 10px",
            }}
          >
            <input
              type="checkbox"
              checked={draft.requireEmail}
              onChange={(e) =>
                setDraft({ ...draft, requireEmail: e.target.checked })
              }
            />
            מייל הוא שדה חובה
          </label>

          {draft.askSupplier ? (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                margin: "4px 0 12px",
              }}
            >
              <input
                type="checkbox"
                checked={draft.requireSupplier}
                onChange={(e) =>
                  setDraft({ ...draft, requireSupplier: e.target.checked })
                }
              />
              חובה לבחור ספק נוכחי
            </label>
          ) : null}

          {error ? (
            <div style={{ color: "#b42318", fontSize: 13, marginBottom: 10 }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={save} disabled={busy}>
              {busy ? "שומר..." : draft.id ? "שמור שינויים" : "צור קישור"}
            </button>

            {draft.id ? (
              <a
                className="btn"
                href={`/f/${draft.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none" }}
              >
                פתח את הדף
              </a>
            ) : null}

            <button
              className="btn"
              onClick={() => {
                setAdding(false);
                setDraft({ ...EMPTY });
                setError("");
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {forms.map((f) => (
          <div
            className="card"
            key={f.id}
            style={{ marginBottom: 10, opacity: f.active ? 1 : 0.55 }}
          >
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{f.name}</div>

            <div style={{ fontSize: 13, color: "#475467", marginTop: 2 }}>
              מקור: <strong>{f.source}</strong>
              {f.campaignName ? ` · קמפיין: ${f.campaignName}` : ""}
            </div>

            {f.priceAmount ? (
              <div style={{ fontSize: 13, color: "#475467", marginTop: 2 }}>
                מבצע: <strong>{f.priceAmount}</strong> {f.pricePeriod}
              </div>
            ) : null}

            <div
              style={{
                direction: "ltr",
                textAlign: "left",
                fontSize: 12.5,
                color: "#667085",
                background: "#f8fafc",
                padding: "8px 10px",
                borderRadius: 8,
                margin: "10px 0",
                wordBreak: "break-all",
              }}
            >
              {origin}/f/{f.id}
            </div>

            <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 10 }}>
              {f.views} צפיות · <strong>{f.submissions} לידים</strong>
              {f.views > 0
                ? ` · ${Math.round((f.submissions / f.views) * 100)}% השאירו פרטים`
                : ""}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={() => copy(f.id)}
                style={{ fontSize: 13 }}
              >
                {copied === f.id ? "הועתק" : "העתק קישור"}
              </button>

              <button
                className="btn"
                onClick={() => edit(f)}
                style={{ fontSize: 13 }}
              >
                ערוך מבצע
              </button>

              <a
                className="btn"
                href={`/f/${f.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, textDecoration: "none" }}
              >
                פתח
              </a>

              <button
                className="btn"
                onClick={() => toggle(f)}
                style={{ fontSize: 13 }}
              >
                {f.active ? "השהה" : "הפעל"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
