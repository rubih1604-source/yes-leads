/**
 * ============================================================
 *  דאטה - הלידים שלא נסגרו, כנכס
 * ============================================================
 *
 *  ליד שלא נסגר הוא לא ליד מת. הוא אדם שהתעניין בשירות
 *  שאתה מוכר, ויום אחד תרצה לפנות אליו שוב - במבצע, בדיוור,
 *  או כקהל לוק-אלייק בפייסבוק.
 *
 *  המסך הזה אוסף אותם במקום אחד, לפי סטטוסים שאתה בוחר,
 *  ומוריד אותם בפורמט שמתאים ליעד.
 *
 *  **על הפורמטים.**
 *
 *  פייסבוק מצפה לקובץ עם כותרות מוכרות (email, phone, fn,
 *  ln, country). קובץ עם כותרות אחרות יעלה, אבל פייסבוק לא
 *  תזהה את העמודות ותתאים אחוז קטן מהאנשים - ואז הקהל
 *  שתבנה יהיה חלש בלי שתדע למה.
 *
 *  הטלפון נשלח בפורמט בינלאומי בלי סימנים, כי זה מה
 *  שמשפר התאמה.
 *
 *  הקובץ טהור כדי שהפורמטים יהיו מכוסים בבדיקות.
 */

export type DataLead = {
  phone: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  campaign: string | null;
  createdAt: string;
};

export type ExportFormat = "lookalike" | "full" | "phones";

export const EXPORT_FORMATS: Array<{
  key: ExportFormat;
  label: string;
  note: string;
}> = [
  {
    key: "lookalike",
    label: "קהל לוק-אלייק לפייסבוק",
    note: "עמודות שפייסבוק מזהה: מייל, טלפון, שם פרטי, שם משפחה, מדינה",
  },
  {
    key: "full",
    label: "קובץ מלא",
    note: "כל השדות, כולל סטטוס, קמפיין ותאריך",
  },
  {
    key: "phones",
    label: "טלפונים בלבד",
    note: "עמודה אחת, לדיוור SMS או לייבוא למערכת אחרת",
  },
];

/**
 * האם הליד נכנס לדאטה.
 *
 * הסטטוסים שמוחרגים נבחרים על ידך - ברירת המחדל היא נסגר
 * ולקוח קיים, אבל זה ניתן לשינוי כי "נסגר" אצלך יכול
 * להיקרא אחרת.
 */
export function inData(
  lead: { phone: string; status: string },
  excluded: string[]
): boolean {
  if (!lead.phone?.trim()) return false;

  const blocked = new Set(excluded.map((s) => s.trim()).filter(Boolean));
  return !blocked.has(lead.status?.trim());
}

/** מנקה טלפון לפורמט שפייסבוק מתאימה הכי טוב */
export function exportPhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";

  // 0521234567 -> 972521234567
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function esc(value: string): string {
  const text = value ?? "";
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * בונה את הקובץ.
 *
 * מחזיר מחרוזת CSV מוכנה, כולל כותרות. שורה בלי טלפון לא
 * נכנסת - היא רק מורידה את אחוז ההתאמה בפייסבוק.
 */
export function buildCsv(
  leads: DataLead[],
  format: ExportFormat
): { csv: string; rows: number } {
  const lines: string[] = [];
  let rows = 0;

  if (format === "phones") {
    lines.push("phone");
    for (const lead of leads) {
      const phone = exportPhone(lead.phone);
      if (!phone) continue;
      lines.push(phone);
      rows++;
    }
    return { csv: lines.join("\n"), rows };
  }

  if (format === "lookalike") {
    /**
     * הכותרות האלה הן מה שפייסבוק מזהה אוטומטית.
     * אל תשנה אותן בלי לבדוק מול פייסבוק - שם עמודה אחר
     * פירושו עמודה שלא תותאם.
     */
    lines.push("email,phone,fn,ln,country");

    for (const lead of leads) {
      const phone = exportPhone(lead.phone);
      if (!phone) continue;

      lines.push(
        [
          esc(lead.email ?? ""),
          phone,
          esc(lead.firstName ?? ""),
          esc(lead.lastName ?? ""),
          "IL",
        ].join(",")
      );
      rows++;
    }

    return { csv: lines.join("\n"), rows };
  }

  lines.push("שם פרטי,שם משפחה,טלפון,מייל,סטטוס,קמפיין,נכנס בתאריך");

  for (const lead of leads) {
    const phone = exportPhone(lead.phone);
    if (!phone) continue;

    lines.push(
      [
        esc(lead.firstName ?? ""),
        esc(lead.lastName ?? ""),
        phone,
        esc(lead.email ?? ""),
        esc(lead.status ?? ""),
        esc(lead.campaign ?? ""),
        esc(lead.createdAt),
      ].join(",")
    );
    rows++;
  }

  return { csv: lines.join("\n"), rows };
}

/** שם הקובץ שיורד */
export function fileNameFor(format: ExportFormat, label: string): string {
  const clean = label.replace(/[^\w֐-׿-]+/g, "-");
  const base =
    format === "lookalike"
      ? "lookalike"
      : format === "phones"
      ? "phones"
      : "data";

  return `${base}-${clean}.csv`;
}
