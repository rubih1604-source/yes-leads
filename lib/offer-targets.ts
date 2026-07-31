/**
 * ============================================================
 *  קהל היעד של מבצע
 * ============================================================
 *
 *  מבצע יכול להיות מכוון לשני דברים:
 *
 *  1. סטטוסים - "כל מי שנשלחה לו הצעת מחיר"
 *  2. תת-סטטוסים - "כל מי שחשוב לו ספורט"
 *
 *  אפשר לשלב. הרשימה נבנית מחדש בכל שליחה, אז ליד שסומן
 *  אתמול נכנס, וליד שהוזז לסטטוס אחר יוצא מעצמו.
 */

export type OfferTargets = {
  statuses: string[];
  subStatuses: string[];
};

const EMPTY: OfferTargets = { statuses: [], subStatuses: [] };

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

/**
 * קורא את קהל היעד. תומך גם במבנה הישן שהיה מערך שטוח
 * של תת-סטטוסים בלבד.
 */
export function readTargets(raw: unknown): OfferTargets {
  if (!raw) return { ...EMPTY };

  if (Array.isArray(raw)) {
    return { statuses: [], subStatuses: strings(raw) };
  }

  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return {
      statuses: strings(obj.statuses),
      subStatuses: strings(obj.subStatuses),
    };
  }

  return { ...EMPTY };
}

export function hasAnyTarget(t: OfferTargets): boolean {
  return t.statuses.length > 0 || t.subStatuses.length > 0;
}

/** תיאור קריא לקהל היעד */
export function describeTargets(t: OfferTargets): string {
  const parts: string[] = [];
  if (t.statuses.length) parts.push(`סטטוסים: ${t.statuses.join(" · ")}`);
  if (t.subStatuses.length)
    parts.push(`תת-סטטוסים: ${t.subStatuses.join(" · ")}`);
  return parts.length ? parts.join(" | ") : "לא נבחר קהל יעד";
}
