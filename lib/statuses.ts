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
  commission?: number;
  /** הקטגוריה שהסטטוס שייך אליה. ריק = "אחרים" */
  category?: string | null;
  /** סטטוס סופי - לא ממשיכים לטפל בליד */
  terminal?: boolean;
  /** סטטוס של סגירת עסקה - נספר בדשבורד כהמרה */
  won?: boolean;
  /** סטטוס שמעביר את הליד לקונה. ריק = לא מעביר */
  transferBuyerId?: string | null;
  /** המחיר שהקונה משלם על ליד שהועבר ככה */
  transferPrice?: number;
  /** הערוץ שאליו הסטטוס מעביר את הליד */
  transferChannelId?: string | null;
  /** כתובת שאליה נשלחת הודעה בשינוי לסטטוס הזה. שולח בלבד */
  hookUrl?: string | null;
  hookTemplate?: string | null;
  hookSecret?: string | null;
  hookActive?: boolean;
};

export const CAT_NEW = "לידים חדשים";
export const CAT_NO_ANSWER = "סטטוסי אין מענה";
export const CAT_ONGOING = "המשכי טיפול עם הלקוח";
export const CAT_CLOSED = "סגירות";
export const CAT_OUT = "לא רלוונטי";

/** מופיעה אחרונה, ואוספת כל סטטוס בלי קטגוריה */
export const CAT_OTHER = "אחרים";

export const DEFAULT_STATUSES: StatusDef[] = [
  { name: "חדש",                      color: "#2563eb", category: CAT_NEW },
  { name: "אין מענה",                 color: "#f59e0b", category: CAT_NO_ANSWER },
  { name: "אין מענה 2",               color: "#d97706", category: CAT_NO_ANSWER },
  { name: "אין מענה לאחר הצעת מחיר",  color: "#b45309", category: CAT_NO_ANSWER },
  { name: "קיבל הצעה/פולואפ",         color: "#7c3aed", category: CAT_ONGOING },
  { name: "נשלחה הצעת מחיר",          color: "#0891b2", category: CAT_ONGOING },
  { name: "שיחת המשך",                color: "#db2777", category: CAT_ONGOING },
  { name: "מבצע חדש",                 color: "#ea580c", category: CAT_ONGOING },
  { name: "לא מעוניין",               color: "#dc2626", category: CAT_OUT },
  { name: "לא מעוניין/אין מענה הודעה", color: "#991b1b", terminal: true, category: CAT_OUT },
  { name: "לקוח קיים",                color: "#64748b", terminal: true, category: CAT_OUT },
  { name: "נסגר דאבל יס",             color: "#15803d", terminal: true, won: true, category: CAT_CLOSED },
  { name: "נסגר רק יס",               color: "#16a34a", terminal: true, won: true, category: CAT_CLOSED },
  { name: "נסגר דאבל סטינג",          color: "#059669", terminal: true, won: true, category: CAT_CLOSED },
];

/**
 * ============================================================
 *  קיבוץ לקטגוריות
 * ============================================================
 *
 *  **למה זה קיים.** רשימת סטטוסים ארוכה היא גלילה בכל
 *  שינוי, ובסוף לוחצים על מה שקרוב במקום על מה שנכון.
 *
 *  סדר הקטגוריות נגזר מסדר הסטטוסים שבתוכן - הקטגוריה
 *  שהסטטוס הראשון שלה מוקדם ברשימה מופיעה ראשונה. ככה
 *  אין סדר שני לתחזק, וגרירת סטטוס במסך ההגדרות מזיזה
 *  גם את הקטגוריה.
 */
export type StatusGroup = {
  category: string;
  statuses: StatusDef[];
};

export function groupByCategory(list: StatusDef[]): StatusGroup[] {
  const groups = new Map<string, StatusDef[]>();

  for (const status of list) {
    const key = (status.category ?? "").trim() || CAT_OTHER;
    const bucket = groups.get(key);
    if (bucket) bucket.push(status);
    else groups.set(key, [status]);
  }

  const out: StatusGroup[] = [];
  for (const [category, statuses] of groups) {
    out.push({ category, statuses });
  }

  /** "אחרים" תמיד אחרונה; השאר לפי הסדר שבו נפגשו */
  return out.sort((a, b) => {
    if (a.category === CAT_OTHER) return 1;
    if (b.category === CAT_OTHER) return -1;
    return 0;
  });
}

/** שמות הקטגוריות הקיימות - להשלמה אוטומטית במסך ההגדרות */
export function categoryNames(list: StatusDef[]): string[] {
  const seen = new Set<string>();
  for (const s of list) {
    const name = (s.category ?? "").trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

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
