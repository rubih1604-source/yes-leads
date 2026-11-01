/**
 * ============================================================
 *  בנק התבניות של חוק
 * ============================================================
 *
 *  **למה זה קיים.**
 *
 *  לחוק אחת הייתה תבנית אחת, ולכן כל מי שהגיע לסטטוס
 *  "אין מענה" קיבל בדיוק את אותו משפט. אין דרך לדעת אם
 *  ניסוח אחר היה מביא יותר תגובות, כי אין במה להשוות.
 *
 *  כאן לחוק יש **בנק** של תבניות, והן מתחלפות בסבב שווה:
 *  ליד ראשון מקבל את הראשונה, שני את השנייה, שלישי את
 *  השלישית, רביעי שוב את הראשונה. חלוקה שווה היא התנאי
 *  למדידה אמיתית - אם תבנית אחת תצא פי שלושה, אי אפשר
 *  יהיה לדעת אם היא ניצחה או שפשוט קיבלה יותר הזדמנויות.
 *
 *  **זה לא מנגנון שני.** החוק נשאר מה שמחליט מה נשלח;
 *  הוא פשוט מחזיק יותר מאפשרות אחת. התבנית שנבחרה נרשמת
 *  על המשימה ועל ההודעה, ומשם מגיעה המדידה.
 *
 *  טהור בכוונה: בלי מסד ובלי רשת, כדי שהחלוקה שקובעת
 *  מה הלקוח יקרא תהיה מכוסה בבדיקות.
 */

/** מפריד בין שמות בבנק. פסיק או שורה חדשה - שניהם מקובלים. */
const SEPARATOR = /[,\n]+/;

/**
 * מפרק בנק תבניות לרשימת שמות.
 *
 * מנקה רווחים, זורק ריקים, ומוריד כפילויות - תבנית
 * שמופיעה פעמיים הייתה מקבלת כפול הזדמנויות ומעוותת
 * את המדידה.
 */
export function parsePool(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of String(raw).split(SEPARATOR)) {
    const name = part.trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

/** מחזיר בנק לכתיבה חזרה למסד. ריק = אין בנק. */
export function serializePool(names: string[]): string | null {
  const clean = parsePool(names.join(","));
  return clean.length > 0 ? clean.join(",") : null;
}

/**
 * התבנית התורנית.
 *
 * מחזיר null אם אין בנק - ואז החוק נשאר עם התבנית
 * היחידה שלו, בדיוק כמו קודם.
 */
export function pickFromPool(
  pool: string[],
  cursor: number
): string | null {
  if (pool.length === 0) return null;

  /**
   * מודולו בטוח גם למונה שלילי. מונה פגום לא אמור לקרות,
   * אבל אם יקרה - עדיף תבנית תקינה מאשר התרסקות שתמנע
   * מכל ההודעות לצאת.
   */
  const safe = Number.isFinite(cursor) ? Math.trunc(cursor) : 0;
  const index = ((safe % pool.length) + pool.length) % pool.length;

  return pool[index];
}

/**
 * מה באמת יישלח בחוק הזה.
 *
 * **נקודת ההכרעה היחידה.** הבנק גובר על התבנית הבודדת
 * כשהוא קיים, ואחרת נופלים לתבנית הבודדת. כל מי ששואל
 * "מה ייצא" - המסך, המתזמן, האבחון - שואל כאן.
 */
export function templateForRule(
  rule: { templateName?: string | null; templatePool?: string | null },
  cursor: number
): string | null {
  const pool = parsePool(rule.templatePool);
  return pickFromPool(pool, cursor) ?? rule.templateName ?? null;
}

/** כמה תבניות בבנק - לתצוגה במסך */
export function poolSize(raw: string | null | undefined): number {
  return parsePool(raw).length;
}

/**
 * הסבר בעברית על מה שהחוק יעשה עם הבנק.
 * מופיע במסך החוקים כדי שלא תצטרך לנחש מה יצא למי.
 */
export function poolLabel(raw: string | null | undefined): string {
  const size = poolSize(raw);
  if (size === 0) return "תבנית אחת קבועה";
  if (size === 1) return "תבנית אחת בבנק";
  return `${size} תבניות מתחלפות בסבב שווה`;
}

/**
 * ============================================================
 *  מתי מותר להכריז על מנצחת
 * ============================================================
 *
 *  **הסף קיים כדי שלא תחליף ניסוח בגלל מקריות.** בעשר
 *  שליחות, תבנית שקיבלה שתי תגובות במקום אחת נראית
 *  כפולה טובה יותר - ובפועל זה רעש. שלושים שליחות לכל
 *  תבנית הוא המינימום שבו הפרש ניכר מתחיל להיות אמיתי.
 */
export const MIN_SENDS_FOR_VERDICT = 30;

export type TemplateScore = {
  templateName: string;
  sent: number;
  replied: number;
};

export type PoolVerdict = {
  /** האם יש מספיק דאטה כדי להמליץ */
  ready: boolean;
  /** התבנית המובילה, אם יש מספיק דאטה */
  winner: string | null;
  /** מה להציג לך במסך */
  reason: string;
};

export function replyRate(score: TemplateScore): number {
  if (score.sent === 0) return 0;
  return score.replied / score.sent;
}

/**
 * מי מובילה, ומתי זה אומר משהו.
 *
 * מחזיר "עוד אין מספיק" כל עוד התבנית החלשה ביותר לא
 * הגיעה לסף - כי השוואה בין 40 שליחות ל-6 היא לא
 * השוואה.
 */
export function poolVerdict(scores: TemplateScore[]): PoolVerdict {
  if (scores.length === 0) {
    return { ready: false, winner: null, reason: "אין עדיין שליחות" };
  }

  if (scores.length === 1) {
    return {
      ready: false,
      winner: null,
      reason: "יש תבנית אחת בלבד - אין למה להשוות",
    };
  }

  const lowest = Math.min(...scores.map((s) => s.sent));

  if (lowest < MIN_SENDS_FOR_VERDICT) {
    const missing = MIN_SENDS_FOR_VERDICT - lowest;
    return {
      ready: false,
      winner: null,
      reason: `עוד ${missing} שליחות לתבנית החלשה ביותר, ואז אפשר להשוות`,
    };
  }

  const ranked = [...scores].sort((a, b) => replyRate(b) - replyRate(a));
  const best = ranked[0];
  const second = ranked[1];

  if (replyRate(best) === replyRate(second)) {
    return {
      ready: true,
      winner: null,
      reason: "אין הפרש בין המובילות - אפשר להשאיר את שתיהן",
    };
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return {
    ready: true,
    winner: best.templateName,
    reason: `${best.templateName} מביאה ${pct(replyRate(best))} תגובות מול ${pct(replyRate(second))}`,
  };
}
