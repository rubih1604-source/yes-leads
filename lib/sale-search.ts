import { phoneMatches } from "./phone";

/**
 * ============================================================
 *  האם הכניסה הזו מתאימה לחיפוש
 * ============================================================
 *
 *  מחפשים בכל מה שמקשר לליד: שם פרטי, שם משפחה, השם המלא,
 *  טלפון בכל כתיב, מייל, קמפיין וסטטוס.
 *
 *  כמה מילים מופרדות ברווח מתנהגות כ-"וגם": "דנה יס" ימצא
 *  רק מי שגם השם שלו מכיל דנה וגם משהו אצלו מכיל יס. ככה
 *  אפשר לצמצם תוצאות במקום להציף.
 */
export function matchesQuery(
  entry: { campaign: string | null },
  lead: {
    phone: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    extra: unknown;
  },
  query: string
): boolean {
  const extra =
    lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
      ? (lead.extra as Record<string, string>)
      : {};

  const haystack = [
    lead.firstName ?? "",
    lead.lastName ?? "",
    `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim(),
    lead.status ?? "",
    entry.campaign ?? "",
    extra.email ?? "",
    extra.address ?? "",
    extra.package ?? "",
    lead.phone,
  ]
    .join(" ")
    .toLowerCase();

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  return words.every((word) => {
    if (haystack.includes(word)) return true;

    // מספרים: משווים ספרות בלבד, כדי ש-052 ימצא גם +972
    const digits = word.replace(/\D/g, "");
    if (digits.length >= 3 && phoneMatches(lead.phone, word)) return true;

    return false;
  });
}
