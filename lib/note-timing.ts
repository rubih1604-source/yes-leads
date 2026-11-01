/**
 * ============================================================
 *  קריאת תאריך מתוך הערה חופשית
 * ============================================================
 *
 *  **מה זה פותר.**
 *
 *  "נכנס עוד חודש לדירה, עושה בדיקה" היא השורה שמביאה
 *  עסקה - ובדיוק השורה שנשכחת. היא נכתבת פעם אחת ואז
 *  נקברת מתחת למאה לידים חדשים.
 *
 *  כאן קוראים מההערה **מתי** צריך לחזור, ופותחים תזכורת
 *  לבד. אתה כותב בשפה שלך; המערכת זוכרת.
 *
 *  **ההתראה יוצאת מראש, לא ביום עצמו.** מי שנכנס לדירה
 *  ב-1.12 כבר בדק ספקים בסוף נובמבר. שיחה ביום המעבר
 *  מאחרת.
 *
 *  **מה המודול הזה לא עושה.** הוא לא מנחש. ניסוח שאין
 *  בו מועד מזוהה מחזיר ריק, וההערה נשמרת בלי תזכורת -
 *  עדיף בלי תזכורת מאשר תזכורת לתאריך שגוי.
 *
 *  טהור בכוונה: בלי מסד, בלי שעון חיצוני.
 */

import { normalizeText } from "./unsubscribe";

/** כמה ימים לפני המועד להתריע */
export const LEAD_DAYS = 3;

/** שעת ההתראה ביום שנבחר */
const ALERT_HOUR = 10;

export type NoteTiming = {
  /** המועד שנקרא מההערה */
  dueAt: Date;
  /** מתי להתריע - שלושה ימים קודם, ולא בעבר */
  remindAt: Date;
  /** מה נקרא, לתצוגה: "עוד חודש", "1.12.2026" */
  label: string;
};

function atDay(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(ALERT_HOUR, 0, 0, 0);
  return d;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);

  /**
   * 31 בינואר ועוד חודש אינו 3 במרץ.
   *
   * JavaScript גולש לחודש הבא כשהיום לא קיים, ולכן
   * מחזירים ליום האחרון של חודש היעד.
   */
  if (d.getDate() < day) d.setDate(0);

  d.setHours(ALERT_HOUR, 0, 0, 0);
  return d;
}

const MONTHS: Record<string, number> = {
  ינואר: 0,
  פברואר: 1,
  מרס: 2,
  מרצ: 2,
  אפריל: 3,
  מאי: 4,
  יוני: 5,
  יולי: 6,
  אוגוסט: 7,
  ספטמבר: 8,
  אוקטובר: 9,
  נובמבר: 10,
  דצמבר: 11,
};

/**
 * מספרים כתובים שמופיעים בשפה יומיומית.
 *
 * **כתובים כאן אחרי נרמול.** "חודשיים" הופך ל"חודשימ"
 * (ם סופית ל-מ, ויו"ד כפולה לאחת), ומפתח בכתיב הרגיל
 * פשוט לא היה נמצא לעולם - כשל שקט שאי אפשר לראות
 * בקריאת הקוד.
 */
const WRITTEN: Record<string, number> = {
  חודש: 1,
  חודשימ: 2,
  שבוע: 1,
  שבועימ: 2,
  יומ: 1,
  יומימ: 2,
  שנה: 1,
};

function parseCount(word: string): number | null {
  if (WRITTEN[word] !== undefined) return WRITTEN[word];
  const n = Number(word);
  return Number.isFinite(n) && n > 0 && n < 400 ? n : null;
}

/**
 * תאריך מפורש: 1.12.26 · 15/12/2026 · 1.12
 *
 * שנה חסרה נקראת כשנה הקרובה קדימה - מי שכותב "1.12"
 * בנובמבר מתכוון לעוד חודש, לא לשנה אחורה.
 */
function explicitDate(raw: string, now: Date): NoteTiming | null {
  /**
   * **נקרא מהטקסט המקורי ולא מהמנורמל.** הנרמול מחליף
   * כל סימן שאינו אות או ספרה ברווח, ולכן "15.12.26"
   * הופך ל"15 12 26" ושום תבנית תאריך לא מתאימה לו.
   */
  const m = raw.match(/(^|\s)(\d{1,2})[.\/\-](\d{1,2})(?:[.\/\-](\d{2,4}))?(\s|$)/);
  if (!m) return null;

  const day = Number(m[2]);
  const month = Number(m[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  let year: number;

  if (m[4]) {
    const raw = Number(m[4]);
    year = raw < 100 ? 2000 + raw : raw;
  } else {
    year = now.getFullYear();
  }

  const due = new Date(year, month - 1, day, ALERT_HOUR, 0, 0, 0);

  /** תאריך בלי שנה שכבר עבר - השנה הבאה */
  if (!m[4] && due.getTime() < now.getTime()) {
    due.setFullYear(year + 1);
  }

  if (Number.isNaN(due.getTime())) return null;

  return finish(due, now, `${day}.${month}.${due.getFullYear()}`);
}

/** שם חודש: "בדצמבר", "בתחילת ינואר" */
function monthName(clean: string, now: Date): NoteTiming | null {
  for (const [name, index] of Object.entries(MONTHS)) {
    if (!clean.includes(name)) continue;

    const due = new Date(now.getFullYear(), index, 1, ALERT_HOUR, 0, 0, 0);
    if (due.getTime() < now.getTime()) due.setFullYear(now.getFullYear() + 1);

    return finish(due, now, `תחילת ${name}`);
  }
  return null;
}

/** "עוד חודש", "בעוד שבועיים", "עוד 10 ימים" */
function relative(clean: string, now: Date): NoteTiming | null {
  /** הצורות הארוכות קודם, אחרת "חודשימ" נקרא כ"חודש" */
  const m = clean.match(
    /(?:בעוד|עוד|תוכ)\s+(\d{1,3}|חודשימ|חודש|שבועימ|שבוע|יומימ|יומ|שנה)\s*(חודשימ|חודש|שבועות|שבוע|ימימ|יומ|שנימ|שנה)?/
  );
  if (!m) return null;

  const count = parseCount(m[1]);
  if (count === null) return null;

  const unit = m[2] ?? m[1];

  if (/חודש/.test(unit)) {
    return finish(addMonths(now, count), now, `עוד ${count === 1 ? "חודש" : `${count} חודשים`}`);
  }
  if (/שבוע/.test(unit)) {
    return finish(atDay(now, count * 7), now, `עוד ${count === 1 ? "שבוע" : `${count} שבועות`}`);
  }
  if (/שנ/.test(unit)) {
    return finish(addMonths(now, count * 12), now, `עוד ${count === 1 ? "שנה" : `${count} שנים`}`);
  }
  if (/יומ|ימימ/.test(unit)) {
    return finish(atDay(now, count), now, `עוד ${count === 1 ? "יום" : `${count} ימים`}`);
  }

  return null;
}

/**
 * בונה את התזכורת מהמועד.
 *
 * ההתראה שלושה ימים קודם; אם זה כבר בעבר - מחר, כי
 * תזכורת בעבר לא תופיע לעולם.
 */
function finish(due: Date, now: Date, label: string): NoteTiming {
  const early = new Date(due);
  early.setDate(early.getDate() - LEAD_DAYS);
  early.setHours(ALERT_HOUR, 0, 0, 0);

  const tomorrow = atDay(now, 1);

  return {
    dueAt: due,
    remindAt: early.getTime() > now.getTime() ? early : tomorrow,
    label,
  };
}

/**
 * המועד שההערה מדברת עליו, אם יש כזה.
 *
 * הסדר: תאריך מפורש גובר על ניסוח יחסי, וזה על שם
 * חודש. מי שטרח לכתוב "1.12.26" התכוון בדיוק לזה.
 */
export function readNoteTiming(
  text: string | null | undefined,
  now: Date
): NoteTiming | null {
  const clean = normalizeText(text ?? "");
  if (!clean) return null;

  const found =
    explicitDate(text ?? "", now) ??
    relative(clean, now) ??
    monthName(clean, now);

  if (!found) return null;

  /** מועד בעבר אינו תזכורת - כנראה תיעוד של משהו שהיה */
  if (found.dueAt.getTime() <= now.getTime()) return null;

  return found;
}

/**
 * כותרת ההתראה.
 *
 * ההערה עצמה היא הכותרת, כי היא כבר כתובה בשפה שלך -
 * "נכנס לדירה", "מסיים חוזה". ניסוח כללי כמו "תזכורת
 * מהערה" היה מאבד בדיוק את המידע שבגללו פתחת אותה.
 */
export function noteAlertTitle(note: string, timing: NoteTiming): string {
  const clean = note.trim().replace(/\s+/g, " ").slice(0, 90);
  return `להתקשר · ${clean}`;
}

/**
 * לבדיקות: המילים שנבדקות מול טקסט מנורמל.
 *
 * אות סופית או יו"ד כפולה כאן פירושה תבנית שלא תתאים
 * לעולם - ולכן יש בדיקה שסורקת אותן.
 */
export function normalizedWordSources(): string[] {
  return [...Object.keys(WRITTEN), ...Object.keys(MONTHS)];
}
