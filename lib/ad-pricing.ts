/**
 * ============================================================
 *  מחיר לפי מודעה
 * ============================================================
 *
 *  **למה זה נחוץ.**
 *
 *  שתי מודעות באותו קמפיין בפייסבוק חולקות טופס אחד. זה
 *  המבנה הנכון - פיצול לשני קמפיינים גורם להם להתחרות זו
 *  בזו על אותו קהל ומייקר את הליד.
 *
 *  אבל אם הטופס אחד, גם הערוץ אחד, ולכן מחיר אחד לכל מה
 *  שנכנס. כשקונה משלם מחיר שונה על כל מודעה, זה לא מספיק.
 *
 *  לכן: הערוץ מחזיק מחיר ברירת מחדל, ומעליו טבלת חריגים
 *  לפי מודעה. ההתאמה נעשית גם לפי **שם** וגם לפי **מזהה**,
 *  כי השם משתנה כשמשנים אותו בפייסבוק והמזהה לא.
 *
 *  הקובץ טהור - המחיר נחתם על הכניסה ונשאר שם לתמיד, ולכן
 *  טעות כאן היא טעות בחיוב אמיתי.
 */

export type AdPriceRule = {
  /** שם המודעה או המזהה שלה - מה שהוקלד */
  match: string;
  price: number;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * קורא את הכללים מהשדה שנשמר במסד.
 *
 * צורה לא צפויה מוחזרת כרשימה ריקה ולא מפילה את הקליטה:
 * ליד שנכנס חשוב יותר מכלל תמחור שנשמר שבור.
 */
export function readAdPrices(raw: unknown): AdPriceRule[] {
  if (!Array.isArray(raw)) return [];

  const out: AdPriceRule[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const row = item as Record<string, unknown>;
    const match = String(row.match ?? "").trim();
    const price = Number(row.price);

    if (!match) continue;
    if (!Number.isFinite(price) || price < 0) continue;

    out.push({ match, price });
  }

  return out;
}

/**
 * המחיר לליד הזה.
 *
 * סדר ההכרעה:
 *   1. התאמה מדויקת למזהה המודעה
 *   2. התאמה מדויקת לשם המודעה
 *   3. התאמה חלקית בשם (מכילה), לכללים כמו "מבצע"
 *   4. מחיר הערוץ
 *
 * התאמה חלקית אחרונה בכוונה: היא הכי נוחה והכי מסוכנת,
 * ולכן היא לא גוברת על התאמה מדויקת.
 */
export function priceForAd(args: {
  adName?: string | null;
  adId?: string | null;
  rules: AdPriceRule[];
  fallback: number;
}): { price: number; matchedBy: string | null } {
  const name = norm(args.adName);
  const id = norm(args.adId);

  if (args.rules.length === 0) {
    return { price: args.fallback, matchedBy: null };
  }

  /**
   * 1: מזהה מודעה - **שתי מעברות, לא אחת**.
   *
   * כאן נתפס באג בבדיקות: לולאה אחת שבודקת מזהה ושם יחד
   * החזירה את הכלל שמופיע ראשון ברשימה, ולכן כלל לפי שם
   * גבר על כלל לפי מזהה רק כי הוקלד קודם. שם מודעה משתנה
   * בפייסבוק ומזהה לא, ולכן המזהה חייב לנצח תמיד.
   */
  if (id) {
    for (const rule of args.rules) {
      if (norm(rule.match) === id) {
        return { price: rule.price, matchedBy: rule.match };
      }
    }
  }

  // 2: שם מדויק
  if (name) {
    for (const rule of args.rules) {
      if (norm(rule.match) === name) {
        return { price: rule.price, matchedBy: rule.match };
      }
    }
  }

  // 3: התאמה חלקית בשם בלבד
  if (name) {
    for (const rule of args.rules) {
      const key = norm(rule.match);
      if (key && name.includes(key)) {
        return { price: rule.price, matchedBy: rule.match };
      }
    }
  }

  return { price: args.fallback, matchedBy: null };
}

/**
 * בדיקת שפיות על הכללים, להצגה במסך.
 *
 * כלל כפול או מחיר 0 הם בדרך כלל טעות הקלדה, ועדיף לראות
 * אותם לפני שליד נחתם לפיהם.
 */
export function checkAdPrices(rules: AdPriceRule[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    const key = norm(rule.match);

    if (seen.has(key)) {
      problems.push(`"${rule.match}" מופיע יותר מפעם אחת`);
    }
    seen.add(key);

    if (rule.price === 0) {
      problems.push(`"${rule.match}" מתומחר ב-0 ₪`);
    }
  }

  return problems;
}
