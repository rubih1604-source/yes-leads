/**
 * ============================================================
 *  התאמת שמות בין דוח המכירות למערכת
 * ============================================================
 *
 *  הצלבה לפי שם היא מסוכנת - "יוסי כהן" יכול להיות שלושה
 *  אנשים שונים. לכן הכלל כאן:
 *
 *  **התאמה נחשבת רק אם היא חד-משמעית.**
 *
 *  אם שם בדוח מתאים לשני לידים - לא נוגעים באף אחד מהם
 *  ומדווחים לך. עדיף שתעדכן ידנית שני לידים מאשר שהמערכת
 *  תשנה סטטוס ללקוח הלא נכון.
 *
 *  טלפון, כשהוא קיים בדוח, תמיד גובר על שם.
 */

/** מנקה שם להשוואה: רווחים, ניקוד, וסימנים */
export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/["'`׳״]/g, "")
    .replace(/[\u0591-\u05C7]/g, "") // ניקוד עברי
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** מפרק שם למילים, למקרה ששם פרטי ומשפחה מוחלפים */
function nameTokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * שני שמות נחשבים זהים אם הם זהים לחלוטין,
 * או אם הם מכילים בדיוק את אותן מילים בסדר שונה.
 * "כהן יוסי" = "יוסי כהן". "יוסי כהן" != "יוסי לוי".
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length < 2 || ta.length !== tb.length) return false;

  const sorted = (arr: string[]) => [...arr].sort().join(" ");
  return sorted(ta) === sorted(tb);
}

export type MatchCandidate = {
  id: string;
  phone: string;
  fullName: string;
  status: string;
};

export type MatchResult =
  | { kind: "phone"; lead: MatchCandidate }
  | { kind: "name"; lead: MatchCandidate }
  | { kind: "ambiguous"; leads: MatchCandidate[] }
  | { kind: "none" };

/**
 * מוצא ליד יחיד שמתאים לשורה מהדוח.
 * טלפון גובר. שם מתקבל רק אם יש התאמה אחת בלבד.
 */
export function findMatch(params: {
  name?: string | null;
  phone?: string | null;
  candidates: MatchCandidate[];
}): MatchResult {
  if (params.phone) {
    const byPhone = params.candidates.filter((c) => c.phone === params.phone);
    if (byPhone.length === 1) return { kind: "phone", lead: byPhone[0] };
    if (byPhone.length > 1) return { kind: "ambiguous", leads: byPhone };
  }

  if (params.name) {
    const byName = params.candidates.filter((c) =>
      namesMatch(c.fullName, params.name!)
    );
    if (byName.length === 1) return { kind: "name", lead: byName[0] };
    if (byName.length > 1) return { kind: "ambiguous", leads: byName };
  }

  return { kind: "none" };
}
