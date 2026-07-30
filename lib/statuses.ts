/**
 * כל הסטטוסים במערכת, לפי הסדר שבו הם מופיעים במסכים.
 * הצבע הוא הפס הצדדי שמאפשר לסרוק את הרשימה בלי לקרוא.
 * להוסיף סטטוס = להוסיף שורה כאן. שום מקום אחר בקוד לא צריך להשתנות.
 */

export type StatusDef = {
  id?: string;
  name: string;
  color: string;
  position?: number;
  builtin?: boolean;
  /** סטטוס סופי - לא ממשיכים לטפל בליד */
  terminal?: boolean;
  /** סטטוס של סגירת עסקה - נספר בדשבורד כהמרה */
  won?: boolean;
};

export const DEFAULT_STATUSES: StatusDef[] = [
  { name: "חדש",                      color: "#2563eb" },
  { name: "אין מענה",                 color: "#f59e0b" },
  { name: "קיבל הצעה/פולואפ",         color: "#7c3aed" },
  { name: "נשלחה הצעת מחיר",          color: "#0891b2" },
  { name: "שיחת המשך",                color: "#db2777" },
  { name: "מבצע חדש",                 color: "#ea580c" },
  { name: "אין מענה לאחר הצעת מחיר",  color: "#b45309" },
  { name: "לא מעוניין",               color: "#dc2626" },
  { name: "לא מעוניין/אין מענה הודעה", color: "#991b1b", terminal: true },
  { name: "לקוח קיים",                color: "#64748b", terminal: true },
  { name: "נסגר דאבל יס",             color: "#15803d", terminal: true, won: true },
  { name: "נסגר רק יס",               color: "#16a34a", terminal: true, won: true },
  { name: "נסגר דאבל סטינג",          color: "#059669", terminal: true, won: true },
];



/**
 * צבע לפי שם. אפשר להעביר רשימה מעודכנת מהמערכת,
 * ואם לא - נופלים לרשימת ברירת המחדל.
 */
export function statusColor(name: string, list?: StatusDef[]): string {
  const source = list && list.length ? list : DEFAULT_STATUSES;
  return source.find((s) => s.name === name)?.color ?? "#94a3b8";
}

export function isWonStatus(name: string, list?: StatusDef[]): boolean {
  const source = list && list.length ? list : DEFAULT_STATUSES;
  return source.find((s) => s.name === name)?.won === true;
}
