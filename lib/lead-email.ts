/**
 * ============================================================
 *  מייל על כל ליד שנכנס
 * ============================================================
 *
 *  עד היום ההתראה על ליד חדש הגיעה מליד מנגר. הטופס החדש
 *  של המכירה כבר לא עובר דרכו, ולכן ליד שנכנס דרכו היה
 *  נכנס בשקט - בלי שתדע.
 *
 *  המבנה מחקה את המייל שהכרת: פרטי הליד למעלה, ואחריהם
 *  טבלת כל השדות שהגיעו מפייסבוק. לא מתוך חיקוי לשמו - זה
 *  המבנה שאתה כבר יודע לסרוק בשנייה מהנייד.
 *
 *  הקובץ טהור - בלי מסד ובלי רשת - כדי שהתוכן יהיה מכוסה
 *  בבדיקות. מייל שיוצא עם שדה ריק או עם HTML שבור מתגלה
 *  רק אצלך בתיבה.
 */

export type LeadEmailInput = {
  leadId: string;
  firstName?: string | null;
  lastName?: string | null;
  phone: string;
  status: string;
  /** השדות הנוספים שהגיעו עם הליד */
  extra?: Record<string, unknown> | null;
  /** לאיזה ערוץ הליד נכנס, אם בכלל */
  channelName?: string | null;
  /** האם זה ליד של קונה */
  isSale?: boolean;
  at: Date;
  appUrl?: string | null;
};

/** התוויות בעברית, באותו סדר שבו הן מוצגות */
const ROWS: Array<{ key: string; label: string }> = [
  { key: "email", label: 'דוא"ל' },
  { key: "supplier_question", label: "שאלת ספק" },
  { key: "fb_campaign", label: "קמפיין" },
  { key: "fb_adset", label: "קבוצת מודעות" },
  { key: "fb_ad", label: "מודעה" },
  { key: "fb_form_name", label: "טופס" },
  { key: "fb_page", label: "עמוד פייסבוק" },
  { key: "fb_platform", label: "פלטפורמה" },
  { key: "fb_leadid", label: "מזהה ליד בפייסבוק" },
];

function str(extra: Record<string, unknown> | null | undefined, key: string) {
  const value = extra?.[key];
  if (typeof value !== "string") return "";
  return value.trim();
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fullNameOf(input: LeadEmailInput): string {
  const name = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  return name || input.phone;
}

/**
 * שורת הנושא.
 *
 * השם והטלפון בנושא בכוונה: ככה אפשר להחליט אם לפתוח בלי
 * לפתוח, וזה מה שהופך התראה לשימושית בנייד.
 */
export function subjectFor(input: LeadEmailInput): string {
  const who = fullNameOf(input);
  const where = input.channelName ? ` · ${input.channelName}` : "";
  const tag = input.isSale ? "ליד למכירה" : "ליד חדש";

  return `${tag}: ${who} · ${input.phone}${where}`;
}

/** גרסת טקסט, לתיבות שלא מציגות HTML */
export function textFor(input: LeadEmailInput): string {
  const lines = [
    `שם מלא: ${fullNameOf(input)}`,
    `טלפון: ${input.phone}`,
  ];

  for (const row of ROWS) {
    const value = str(input.extra, row.key);
    if (value) lines.push(`${row.label}: ${value}`);
  }

  lines.push(`סטטוס: ${input.status}`);

  if (input.channelName) lines.push(`ערוץ: ${input.channelName}`);

  if (input.appUrl) {
    lines.push("", `כרטיס הליד: ${input.appUrl}/leads/${input.leadId}`);
  }

  return lines.join("\n");
}

/**
 * גוף המייל ב-HTML.
 *
 * dir="rtl" על העטיפה, ועיצוב inline בלבד - תיבות מייל
 * מתעלמות מגיליונות סגנון חיצוניים, וטבלה בלי עיצוב פנימי
 * מגיעה כערימת טקסט.
 */
export function htmlFor(input: LeadEmailInput): string {
  const who = esc(fullNameOf(input));
  const phone = esc(input.phone);

  const when = input.at.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows = ROWS.map((row) => {
    const value = str(input.extra, row.key);
    if (!value) return "";

    return `<tr>
      <td style="padding:7px 12px;color:#667085;font-size:13px;white-space:nowrap;vertical-align:top">${esc(
        row.label
      )}</td>
      <td style="padding:7px 12px;color:#101828;font-size:14px;font-weight:600">${esc(
        value
      )}</td>
    </tr>`;
  })
    .filter(Boolean)
    .join("");

  const link = input.appUrl
    ? `<p style="margin:18px 0 0">
         <a href="${esc(input.appUrl)}/leads/${esc(input.leadId)}"
            style="background:#1b4d8f;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;display:inline-block">
           פתח את הליד
         </a>
       </p>`
    : "";

  const tag = input.isSale
    ? `<span style="background:#fef0c7;color:#b54708;padding:3px 10px;border-radius:999px;font-size:12px">ליד למכירה${
        input.channelName ? ` · ${esc(input.channelName)}` : ""
      }</span>`
    : "";

  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:22px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e7ec">

    <div style="background:#1b4d8f;padding:16px 20px">
      <div style="color:#fff;font-size:17px;font-weight:700">נכנס ליד חדש</div>
      <div style="color:#cfe0f5;font-size:12.5px;margin-top:3px">${esc(when)}</div>
    </div>

    <div style="padding:18px 20px">
      <div style="font-size:21px;font-weight:700;color:#101828">${who}</div>
      <div style="margin-top:5px">
        <a href="tel:${esc(input.phone.replace(/\D/g, ""))}"
           style="color:#1b4d8f;text-decoration:none;font-size:16px;direction:ltr;display:inline-block">${phone}</a>
      </div>
      ${tag ? `<div style="margin-top:9px">${tag}</div>` : ""}

      <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:1px solid #eef2f7">
        ${rows}
      </table>

      ${link}
    </div>

  </div>
</div>`;
}

/**
 * האם לשלוח מייל על הליד הזה.
 *
 * "all" הוא ברירת המחדל: ליד שנכנס בשקט הוא ליד שלא
 * מטופל, וזו הסיבה שביקשת את זה מלכתחילה.
 */
export type LeadEmailMode = "all" | "mine" | "sale" | "off";

export function shouldEmail(mode: LeadEmailMode, isSale: boolean): boolean {
  if (mode === "off") return false;
  if (mode === "all") return true;
  return mode === "sale" ? isSale : !isSale;
}
