/**
 * ============================================================
 *  העמודות של דוח המכירה
 * ============================================================
 *
 *  הגדרה אחת שמשרתת גם את בורר העמודות במסך וגם את הקובץ
 *  שיורד. ככה אי אפשר שהמסך יציע עמודה שהקובץ לא מכיר,
 *  או להפך.
 *
 *  הסדר כאן הוא הסדר שבו העמודות יופיעו בקובץ, בלי קשר
 *  לסדר שבו סימנת אותן.
 */

export type SaleColumnKey =
  | "date"
  | "time"
  | "name"
  | "phone"
  | "email"
  | "campaign"
  | "buyer"
  | "price"
  | "billable"
  | "existing";

export const SALE_COLUMNS: Array<{
  key: SaleColumnKey;
  label: string;
  note?: string;
}> = [
  { key: "date", label: "תאריך" },
  { key: "time", label: "שעה" },
  { key: "name", label: "שם" },
  { key: "phone", label: "טלפון" },
  { key: "email", label: 'דוא"ל' },
  { key: "campaign", label: "קמפיין" },
  { key: "buyer", label: "קונה" },
  { key: "price", label: "מחיר לליד" },
  { key: "billable", label: "לחיוב", note: "כן / לא" },
  { key: "existing", label: "לקוח קיים", note: "כן / לא" },
];

/** מה שמסומן כשלא בחרת כלום */
export const DEFAULT_SALE_COLUMNS: SaleColumnKey[] = [
  "date",
  "name",
  "phone",
  "email",
];

const ALL_KEYS = new Set<string>(SALE_COLUMNS.map((c) => c.key));

/**
 * קורא בחירת עמודות ממחרוזת, ומחזיר אותה **בסדר הקבוע**.
 *
 * מפתח שלא מוכר פשוט נזרק, ובחירה ריקה חוזרת לברירת המחדל -
 * כדי שקובץ אף פעם לא יירד בלי אף עמודה.
 */
export function readSaleColumns(raw: string | null | undefined): SaleColumnKey[] {
  const asked = (raw ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => ALL_KEYS.has(x)) as SaleColumnKey[];

  if (asked.length === 0) return [...DEFAULT_SALE_COLUMNS];

  const chosen = new Set<string>(asked);
  return SALE_COLUMNS.filter((c) => chosen.has(c.key)).map((c) => c.key);
}

/** מה שמוצג בשורת ליד ברשימת המכירה כשלא בחרת כלום */
export const DEFAULT_SALE_ROW_FIELDS: SaleColumnKey[] = [
  "name",
  "phone",
  "price",
  "campaign",
  "date",
];

/**
 * אותה קריאה, אבל ממה שנשמר בהגדרות (מערך ולא מחרוזת).
 *
 * בחירה ריקה חוזרת לברירת המחדל במכוון: שורה בלי אף שדה
 * היא רשימה של מלבנים ריקים, וזו לא בחירה שמישהו התכוון
 * אליה.
 */
export function readSaleRowFields(raw: unknown): SaleColumnKey[] {
  const list = Array.isArray(raw) ? raw : [];

  const asked = list
    .map((x) => String(x ?? "").trim())
    .filter((x) => ALL_KEYS.has(x)) as SaleColumnKey[];

  if (asked.length === 0) return [...DEFAULT_SALE_ROW_FIELDS];

  const chosen = new Set<string>(asked);
  return SALE_COLUMNS.filter((c) => chosen.has(c.key)).map((c) => c.key);
}
