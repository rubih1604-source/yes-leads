/**
 * ============================================================
 *  מה הלקוח אמר, ומה לעשות עם זה
 * ============================================================
 *
 *  **למה הקובץ הזה קיים.**
 *
 *  עד כה המנוע ידע דבר אחד על תגובה: שהיא קיימת. ליד
 *  שענה "תדבר איתי מחר" וליד שענה "לא מעוניין" קיבלו
 *  בדיוק אותו טיפול - ביטול האוטומציה ושקט. אחד מהם
 *  היה עסקה שהלכה לאיבוד.
 *
 *  כאן קוראים את התגובה ומחליטים מה הצעד הבא: להעביר
 *  סטטוס, לפתוח תזכורת לשעה שהלקוח ביקש, להתריע לך
 *  להתקשר עכשיו, או - כשאין שום דבר חדש - פשוט לשלוח
 *  את התבנית שתוכננה.
 *
 *  **מה המודול הזה לא עושה.** הוא לא מנחש. ניסוח שלא
 *  מזוהה בוודאות מקבל "לא ברור" - וזה אומר: עצור את
 *  האוטומציה והתרע לרובי. הודעה אוטומטית שגויה ללקוח
 *  יקרה יותר מהתראה מיותרת אליך.
 *
 *  טהור בכוונה: בלי מסד, בלי רשת, בלי שעון חיצוני.
 */

import { normalizeText, detectUnsubscribe } from "./unsubscribe";
import { statesExistingCustomer } from "./supplier-check";

export type ReplyIntent =
  /** ביקש שלא יפנו אליו יותר */
  | "remove"
  /** אמר שהוא כבר לקוח של יס או סטינג */
  | "existing_customer"
  /** אמר שאינו מעוניין */
  | "not_interested"
  /** ביקש שתחזור אליו במועד אחר */
  | "call_later"
  /** אמר משהו שמבטא עניין */
  | "interested"
  /** ענה משהו שלא מזוהה בוודאות */
  | "unclear";

export type ReplyAction =
  /** אין תגובה חדשה - אפשר לשלוח את התבנית שתוכננה */
  | "send"
  /** לעצור את האוטומציה ולהעביר סטטוס */
  | "set_status"
  /** לעצור ולפתוח תזכורת למועד שהלקוח ביקש */
  | "remind"
  /** לעצור ולהתריע לרובי עכשיו */
  | "alert";

export type ReplyDecision = {
  intent: ReplyIntent | null;
  action: ReplyAction;
  /** לאן להעביר, כשהפעולה היא העברת סטטוס */
  status: string | null;
  /** מתי להזכיר, כשהפעולה היא תזכורת */
  remindAt: Date | null;
  /**
   * האם להוסיף אותו לרשימה השחורה.
   *
   * נפרד מהסטטוס בכוונה: סטטוס הוא איפה הליד עומד,
   * רשימה שחורה היא האם מותר לדוור אליו. ניסוח אחד יכול
   * לחייב את שניהם, ואחר רק את הראשון.
   */
  blacklist: boolean;
  /** מה להציג לך בהתראה או ביומן */
  reason: string;
};

/* ============================================================
 *  זיהוי הכוונה
 * ============================================================ */

/** "תחזור אליי" על כל נטיותיו */
const CALL_LATER = [
  /(תדבר|נדבר|תדברו|דבר|דברו)\s+(איתי|אתי|איתנו|אתכמ)?/,
  /(תחזור|תחזרו|תתקשר|תתקשרו|תצלצל|תצלצלו)\s*(אלי|אלינו)?\s*(מחר|אחר|בהמשכ|בערב|בלילה|בבוקר|מאוחר)/,
  /(תחזור|תחזרו|תתקשר|תתקשרו)\s*(אלי)?\s*(בעוד|בשעה|ב|ל)?\s*\d/,
  /(אני|כרגע|עכשיו)\s+(בשיחה|בעבודה|בנהיגה|נוהג|נוהגת|עסוק|עסוקה|לא\s+פנוי|לא\s+פנויה)/,
  /(לא\s+)?(יכול|יכולה|מתאימ|נוח)\s+(לי\s+)?(לדבר|לענות|עכשיו|כרגע)/,
  /(מחר|אחר\s*כ|בהמשכ|בערב|בלילה|בבוקר)\s+(אפשר|נדבר|תתקשר|תחזור|נדברנ)/,
  /(בוא|תבוא|בואו)\s+נדבר/,
  /(נדבר|דבר)\s+(מחר|בערב|בהמשכ|אחר\s*כ)/,
];

/** ביטויי עניין ברורים */
const INTERESTED = [
  /**
   * **המעקה החשוב כאן.** בלי החסימה של "לא" שלפני,
   * "לא מעוניין" נתפס כהבעת עניין - והמערכת הייתה
   * מתריעה לך להתקשר בדחיפות ללקוח שבדיוק סירב.
   */
  /(^|\s)(?<!לא\s)(מעונינ|מענינ)/,
  /(כנ)\s+(בשמחה|אשמח|בטח|סבבה|מעונינ)/,
  /(אשמח|ישמח\s+לי)\s+(לשמוע|לקבל|לדעת)/,
  /(שלח|תשלח|שלחו|תשלחו|תשלחי)\s*(לי|לנו)?\s*(את)?\s*(פרטימ|הצעה|מחיר|מידע|הפרטימ|ההצעה)/,
  /(מה\s+המחיר|כמה\s+זה\s+עולה|כמה\s+עולה|מה\s+ההצעה)/,
  /(המבצע|ההצעה)\s+(עדינ|עוד)?\s*(בתוקפ|רלוונטי|רלוונטית|קימ|קימת)/,
  /(בוא|תבוא|בואו)\s+נתקדמ/,
  /(אני\s+)?(רוצה|מוכנ|מוכנה)\s+(להתקדמ|לסגור|לשמוע|לעבור)/,
];

/** חוסר עניין שאינו בקשת הסרה */
const NOT_INTERESTED = [
  /לא\s+מעונינ/,
  /לא\s+מענינ/,
  /לא\s+רלוונטי/,
  /לא\s+(מתאימ|מענינ)\s+לי/,
  /(ויתרתי|התחרטתי|כבר\s+לא\s+רלוונטי)/,
  /(^|\s)(לא\s+תודה|לא\s+צריכ)(\s|$)/,
];

function matches(patterns: RegExp[], clean: string): boolean {
  return patterns.some((p) => p.test(clean));
}

/* ============================================================
 *  מתי הלקוח ביקש שתחזור
 * ============================================================
 *
 *  **למה ברירת מחדל ולא ויתור.** לקוח שכתב "תדבר איתי
 *  מחר" בלי שעה עדיין ביקש מחר. אם לא נקבע מועד, הפנייה
 *  פשוט נשכחת - וזה הפסד ודאי. מחר ב-10:00 הוא ניחוש
 *  סביר שאפשר לזוז ממנו, ולא חור בתהליך.
 */

const MORNING = 9;
const DEFAULT_HOUR = 10;
const EVENING = 18;

function atHour(from: Date, days: number, hour: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** היום בשעה הזו, ואם כבר עבר - מחר */
function todayOrTomorrow(now: Date, hour: number): Date {
  const today = atHour(now, 0, hour);
  return today.getTime() > now.getTime() ? today : atHour(now, 1, hour);
}

const WEEKDAYS: Array<{ names: string[]; day: number }> = [
  { names: ["ראשונ"], day: 0 },
  { names: ["שני"], day: 1 },
  { names: ["שלישי"], day: 2 },
  { names: ["רביעי"], day: 3 },
  { names: ["חמישי"], day: 4 },
  { names: ["שישי"], day: 5 },
  { names: ["שבת"], day: 6 },
];

function nextWeekday(now: Date, day: number, hour: number): Date {
  const diff = (day - now.getDay() + 7) % 7 || 7;
  return atHour(now, diff, hour);
}

/**
 * השעה שהלקוח ביקש, מתוך מה שכתב.
 *
 * הסדר כאן חשוב: "מחר בערב" חייב להיבדק לפני "מחר"
 * לבדו, אחרת הוא ייקרא כ-10:00 במקום 18:00.
 */
export function readRequestedTime(text: string, now: Date): Date | null {
  const clean = normalizeText(text);
  if (!clean) return null;

  /* "בעוד שעה" / "בעוד שעתיים" / "בעוד 20 דקות" */
  const inHours = clean.match(/בעוד\s+(שעה|שעתימ|\d+)\s*(שעות|דקות)?/);
  if (inHours) {
    const word = inHours[1];
    const unit = inHours[2] ?? "";

    if (word === "שעה") return new Date(now.getTime() + 60 * 60000);
    if (word === "שעתימ") return new Date(now.getTime() + 120 * 60000);

    const n = Number(word);
    if (Number.isFinite(n) && n > 0) {
      const minutes = unit.includes("דקות") ? n : n * 60;
      return new Date(now.getTime() + Math.min(minutes, 60 * 24 * 7) * 60000);
    }
  }

  const tomorrow = /מחר/.test(clean);
  const evening = /(בערב|ערב|בלילה|אחה\s*צ|אחרי\s+הצהרימ)/.test(clean);
  const morning = /(בבוקר|בוקר)/.test(clean);

  /* שעה מפורשת: "ב-17", "בשעה 5", "אחרי 18:30" */
  const explicit = clean.match(
    /(?:בשעה|אחרי|ב|מ)\s*(\d{1,2})(?:[:.](\d{2}))?/
  );

  if (explicit) {
    let hour = Number(explicit[1]);
    const minute = Number(explicit[2] ?? 0);

    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      /**
       * "תחזור ב-5" בערב, לא ב-5 לפנות בוקר. שעה חד ספרתית
       * בלי ציון בוקר מפורש נקראת כשעת אחר הצהריים - ככה
       * אנשים מדברים.
       */
      if (hour <= 7 && !morning) hour += 12;

      const target = tomorrow ? atHour(now, 1, hour) : atHour(now, 0, hour);
      target.setMinutes(Number.isFinite(minute) ? minute : 0);

      if (!tomorrow && target.getTime() <= now.getTime()) {
        return atHour(target, 1, hour);
      }
      return target;
    }
  }

  if (tomorrow) {
    if (evening) return atHour(now, 1, EVENING);
    if (morning) return atHour(now, 1, MORNING);
    return atHour(now, 1, DEFAULT_HOUR);
  }

  for (const { names, day } of WEEKDAYS) {
    if (names.some((n) => clean.includes(`יומ ${n}`) || clean.includes(n))) {
      return nextWeekday(now, day, evening ? EVENING : DEFAULT_HOUR);
    }
  }

  if (/שבוע\s+הבא/.test(clean)) return atHour(now, 7, DEFAULT_HOUR);
  if (evening) return todayOrTomorrow(now, EVENING);
  if (morning) return atHour(now, 1, MORNING);

  return null;
}

/* ============================================================
 *  ההכרעה
 * ============================================================ */

/** כשאין שום תגובה חדשה - התבנית שתוכננה יוצאת כרגיל */
export const NOTHING_NEW: ReplyDecision = {
  intent: null,
  action: "send",
  status: null,
  remindAt: null,
  blacklist: false,
  reason: "אין תגובה חדשה מהלקוח",
};

/**
 * מה לעשות עם מה שהלקוח כתב.
 *
 * **סדר הבדיקה הוא סדר הנזק.** בקשת הסרה נבדקת ראשונה
 * כי התעלמות ממנה היא תלונה; לקוח קיים אחריה כי הודעה
 * נוספת אליו היא בזבוז; ורק אחר כך הניואנסים.
 */
export function decideReply(args: {
  text: string | null | undefined;
  now: Date;
}): ReplyDecision {
  const raw = (args.text ?? "").trim();
  if (!raw) return NOTHING_NEW;

  /**
   * **הודעה שאי אפשר לקרוא היא עדיין הודעה.**
   *
   * "?" או אימוג'י בלבד מתרוקנים בנרמול. קודם זה היה
   * נקרא כ"אין תגובה" והתבנית הייתה יוצאת - כלומר
   * הודעה אוטומטית נופלת על לקוח שבדיוק כתב לך. עדיף
   * התראה אליך.
   */
  const clean = normalizeText(raw);
  if (!clean) {
    return {
      intent: "unclear",
      action: "alert",
      status: null,
      remindAt: null,
      blacklist: false,
      reason: `ענה משהו שאי אפשר לקרוא: "${raw.slice(0, 40)}"`,
    };
  }

  /**
   * 1. בקשת הסרה - הכי חמור, נבדק ראשון.
   *
   * **רק אמירה מפורשת חוסמת.** "אל תפנו אליי יותר",
   * "תסירו אותי". "לא מעוניין" לבדו אינו חסימה - הוא
   * סירוב להצעה הנוכחית, והליד נשאר דאטה שאפשר לחזור
   * אליה כשהמחירים משתנים.
   */
  const removal = detectUnsubscribe(raw);

  if (removal.blacklist) {
    return {
      intent: "remove",
      action: "set_status",
      status: "לא מעוניין/אין מענה הודעה",
      remindAt: null,
      blacklist: true,
      reason: removal.reason ?? "ביקש להסיר",
    };
  }

  /* 2. כבר לקוח שלנו - אין מה למכור לו */
  if (statesExistingCustomer(raw)) {
    return {
      intent: "existing_customer",
      action: "set_status",
      status: "לקוח קיים",
      remindAt: null,
      blacklist: false,
      reason: "אמר שהוא כבר לקוח קיים",
    };
  }

  /**
   * 3. ביקש שתחזור אליו.
   *
   * **נבדק לפני חוסר עניין בכוונה.** "לא מעוניין לדבר
   * עכשיו, תתקשר מחר" הוא בקשה לדחות שיחה, לא סירוב -
   * וסדר הפוך היה סוגר לקוח חי.
   */
  if (matches(CALL_LATER, clean)) {
    const at = readRequestedTime(raw, args.now);
    return {
      intent: "call_later",
      action: "remind",
      status: null,
      remindAt: at ?? atHour(args.now, 1, DEFAULT_HOUR),
      blacklist: false,
      reason: at
        ? "ביקש שתחזור אליו במועד שציין"
        : "ביקש שתחזור אליו · לא ציין מתי, נקבע למחר",
    };
  }

  /* 4. עניין מפורש - זה הרגע להתקשר, לא לשלוח עוד הודעה */
  if (matches(INTERESTED, clean)) {
    return {
      intent: "interested",
      action: "alert",
      status: null,
      remindAt: null,
      blacklist: false,
      reason: "הביע עניין - להתקשר עכשיו",
    };
  }

  /* 5. חוסר עניין שאינו בקשת הסרה */
  if (matches(NOT_INTERESTED, clean)) {
    return {
      intent: "not_interested",
      action: "set_status",
      status: "לא מעוניין",
      remindAt: null,
      blacklist: false,
      reason: "אמר שאינו מעוניין",
    };
  }

  /**
   * 6. ענה משהו שלא זוהה.
   *
   * **לא שולחים.** הלקוח כתב משהו, ותבנית אוטומטית
   * שתיפול עליו עכשיו תיראה כאילו לא קראת אותו. עדיף
   * התראה אליך.
   */
  return {
    intent: "unclear",
    action: "alert",
    status: null,
    remindAt: null,
    blacklist: false,
    reason: `ענה ולא זוהה בוודאות: "${raw.slice(0, 80)}"`,
  };
}

/** כותרת ההתראה לפי הכוונה - מה שתראה ברשימה */
export function alertTitleFor(decision: ReplyDecision): string {
  switch (decision.intent) {
    case "interested":
      return "להתקשר עכשיו · הביע עניין";
    case "call_later":
      return "לחזור ללקוח · ביקש מועד אחר";
    case "unclear":
      return "לקרוא ולענות · הלקוח כתב משהו";
    default:
      return "תגובה מהלקוח";
  }
}

/** לבדיקות: כל התבניות, כדי לאמת שהן שורדות נרמול */
export function intentPatternSources(): string[] {
  return [...CALL_LATER, ...INTERESTED, ...NOT_INTERESTED].map(
    (p) => p.source
  );
}
