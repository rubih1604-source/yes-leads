/**
 * ============================================================
 *  מה מוצג בשורת הליד
 * ============================================================
 *
 *  לכל ליד יש הרבה נתונים, אבל שורה בנייד מחזיקה מעט.
 *  במקום שאני אחליט בשבילך - אתה בוחר.
 *
 *  השם תמיד מוצג, הוא מה שמזהה את הליד.
 */

export type RowFieldKey =
  | "status"
  | "subStatus"
  | "phone"
  | "intakeAt"
  | "supplier"
  | "campaign"
  | "source"
  | "package"
  | "price"
  | "email"
  | "address";

export type RowFieldDef = {
  key: RowFieldKey;
  label: string;
  hint: string;
};

export const ROW_FIELDS: RowFieldDef[] = [
  { key: "status", label: "סטטוס", hint: "בצבע הסטטוס" },
  { key: "phone", label: "טלפון", hint: "לחיצה מחייגת" },
  { key: "intakeAt", label: "תאריך ושעת כניסה", hint: "" },
  { key: "subStatus", label: "תת-סטטוס", hint: "מה חשוב ללקוח" },
  { key: "supplier", label: "ספק נוכחי", hint: "מתוך שאלת הספק" },
  { key: "campaign", label: "קמפיין", hint: "מפייסבוק" },
  { key: "source", label: "מקור", hint: "" },
  { key: "package", label: "חבילה", hint: "" },
  { key: "price", label: "מחיר", hint: "" },
  { key: "email", label: 'דוא"ל', hint: "" },
  { key: "address", label: "כתובת", hint: "" },
];

/** ברירת המחדל - מה שהיה עד היום, בתוספת טלפון */
export const DEFAULT_ROW_FIELDS: RowFieldKey[] = [
  "status",
  "phone",
  "intakeAt",
  "subStatus",
  "supplier",
];

export function readRowFields(raw: unknown): RowFieldKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ROW_FIELDS];

  const valid = new Set(ROW_FIELDS.map((f) => f.key));
  const picked = raw.filter(
    (k): k is RowFieldKey => typeof k === "string" && valid.has(k as RowFieldKey)
  );

  return picked.length ? picked : [...DEFAULT_ROW_FIELDS];
}
