/**
 * ============================================================
 *  מתי נוח לך שנדבר
 * ============================================================
 *
 *  הלקוח עונה בעברית חופשית - "עוד שעה", "מחר בבוקר",
 *  "ביום שני ב-10", "אחרי 5" - וצריך מזה זמן אחד מדויק
 *  לתזכורת.
 *
 *  **למה מודול טהור.** זה בדיוק החלק שאם הוא טועה, אתה
 *  מקבל תזכורת בשלוש לפנות בוקר או לא מקבל בכלל. בלי
 *  מסד ובלי רשת, ולכן הוא נבדק על עשרות ניסוחים אמיתיים.
 *
 *  **הכתיב חייב להיות אחרי נרמול.** האותיות הסופיות
 *  מומרות לרגילות ויו"ד כפולה מתאחדת, ולכן התבניות כאן
 *  כתובות "צהרימ" ולא "צהריים", "שעתימ" ולא "שעתיים".
 *  כל תבנית שתיכתב בכתיב הרגיל פשוט לא תתפוס - וזה כבר
 *  קרה כאן שוב ושוב.
 */

/** השעה שנבחרת לכל חלק של היום */
export const DAY_PART_HOUR = {
  morning: 9,
  noon: 12,
  afternoon: 16,
  evening: 19,
} as const;

export type DayPart = keyof typeof DAY_PART_HOUR;

export type WhenResult =
  | {
      kind: "at";
      at: Date;
      /** איך להציג את זה לך בתזכורת */
      label: string;
    }
  | { kind: "unclear" };

/**
 * נרמול קל, ש**שומר על ספרות ועל נקודתיים**.
 *
 * הנרמול הכללי של המערכת מוחק סימני פיסוק, ולכן "14:30"
 * היה הופך ל-"14 30" ושעה מדויקת הייתה נעלמת.
 */
export function soften(input: string): string {
  const FINAL: Record<string, string> = {
    "ם": "מ",
    "ן": "נ",
    "ך": "כ",
    "ף": "פ",
    "ץ": "צ",
  };

  return (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[^\p{L}\p{N}\s:]/gu, " ")
    .replace(/[םןךףץ]/g, (ch) => FINAL[ch] ?? ch)
    .replace(/יי/g, "י")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
 *  עזרים
 * ============================================================ */

/**
 * ============================================================
 *  למה אין כאן \b
 * ============================================================
 *
 *  **הבאג שהפיל כל תבנית בקובץ הזה.** ב-JavaScript הגבול
 *  \b מוגדר על תווי ASCII בלבד, ולכן /\bמחר\b/ **לעולם לא
 *  מתאים** למלה עברית. כל התבניות כאן נכשלו בשקט, והתשובה
 *  לכל הודעה הייתה "לא ברור".
 *
 *  הפתרון: הטקסט מרופד ברווחים משני הצדדים, והתבניות
 *  מחפשות את המלה בין רווחים. `soften` כבר מאחד רווחים
 *  לרווח אחד, ולכן זה מדויק.
 */
function padded(text: string): string {
  return ` ${text} `;
}

/** המלה מופיעה כמלה שלמה, ולא כחלק ממלה אחרת */
function has(text: string, ...words: string[]): boolean {
  const t = padded(text);
  return words.some((w) => t.includes(` ${w} `));
}

function atHour(base: Date, hour: number, minute = 0): Date {
  const out = new Date(base);
  out.setHours(hour, minute, 0, 0);
  return out;
}

function addDays(base: Date, days: number): Date {
  const out = new Date(base);
  out.setDate(out.getDate() + days);
  return out;
}

const PART_WORDS: Array<[string[], DayPart]> = [
  /** אחר הצהריים נבדק לפני "צהריים", אחרת הוא ייקרא כצהריים */
  [["אחהצ", "אחרי הצהרימ", "אחרי צהרימ", "אחר הצהרימ"], "afternoon"],
  [["בוקר", "בבוקר", "מהבוקר"], "morning"],
  [["צהרימ", "בצהרימ", "בצהרי"], "noon"],
  [["ערב", "בערב", "לעת ערב", "אחרי העבודה"], "evening"],
  [["לילה", "בלילה"], "evening"],
];

function partOf(text: string): DayPart | null {
  const t = padded(text);

  for (const [words, part] of PART_WORDS) {
    for (const w of words) {
      if (t.includes(` ${w} `) || t.includes(`${w} `)) {
        /** "אחרי הצהרימ" הוא שני מלים - חיפוש רצף, לא מלה */
        if (w.includes(" ") ? t.includes(w) : t.includes(` ${w} `)) return part;
      }
    }
  }

  return null;
}

const PART_LABEL: Record<DayPart, string> = {
  morning: "בוקר",
  noon: "צהריים",
  afternoon: "אחר הצהריים",
  evening: "ערב",
};

/** ראשון=0, כמו getDay */
const WEEKDAYS: Array<[string[], number]> = [
  [["ראשונ", "יומ ראשונ", "בראשונ"], 0],
  [["שני", "יומ שני", "בשני"], 1],
  [["שלישי", "יומ שלישי", "בשלישי"], 2],
  [["רביעי", "יומ רביעי", "ברביעי"], 3],
  [["חמישי", "יומ חמישי", "בחמישי"], 4],
  [["שישי", "יומ שישי", "בשישי"], 5],
  [["שבת", "בשבת", "מוצש"], 6],
];

const WEEKDAY_LABEL = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

function nextWeekday(now: Date, target: number, hour: number, minute: number): Date {
  let days = (target - now.getDay() + 7) % 7;

  /** "יום שני" כשהיום יום שני ושהשעה עברה = שבוע הבא */
  if (days === 0) {
    const today = atHour(now, hour, minute);
    if (today.getTime() <= now.getTime()) days = 7;
  }

  return atHour(addDays(now, days), hour, minute);
}

/**
 * מילים שמשמעותן "לא עכשיו ובלי זמן" - ואסור לקרוא אותן
 * כזמן. בלי זה "לא מעוניין" או "אני בעבודה" היו מייצרים
 * תזכורת מומצאת.
 */
const NO_TIME = [
  "לא מעונינ",
  "תפסיק",
  "הסר",
  "אחכ",
  "בהמשכ",
  "מתי שנוח",
  "מתי שנוח לכ",
  "לא יודע",
  "לא בטוח",
];

/* ============================================================
 *  ההכרעה
 * ============================================================ */

export function parseWhen(input: string, now: Date): WhenResult {
  const text = soften(input);
  if (!text) return { kind: "unclear" };

  if (has(text, ...NO_TIME)) return { kind: "unclear" };

  /* ---------- "עכשיו" ---------- */
  if (has(text, "עכשיו", "מיד", "עכשוי", "כבר")) {
    return {
      kind: "at",
      at: new Date(now.getTime() + 5 * 60000),
      label: "עכשיו",
    };
  }

  /* ---------- בעוד X ---------- */
  const relative = relativeOffset(text);
  if (relative) {
    return {
      kind: "at",
      at: new Date(now.getTime() + relative.minutes * 60000),
      label: relative.label,
    };
  }

  /** שעה מדויקת, אם נכתבה */
  const clock = clockOf(text);
  const part = partOf(text);

  /* ---------- מחר / מחרתיים ---------- */
  const dayAfter = has(text, "מחרתימ");
  const tomorrow = !dayAfter && has(text, "מחר");

  if (tomorrow || dayAfter) {
    const base = addDays(now, dayAfter ? 2 : 1);
    const when = clock
      ? atHour(base, clock.hour, clock.minute)
      : atHour(base, DAY_PART_HOUR[part ?? "morning"]);

    const dayLabel = dayAfter ? "מחרתיים" : "מחר";
    return {
      kind: "at",
      at: when,
      label: clock
        ? `${dayLabel} ב-${hhmm(when)}`
        : `${dayLabel} ב${PART_LABEL[part ?? "morning"]}`,
    };
  }

  /* ---------- יום בשבוע ---------- */
  for (const [words, day] of WEEKDAYS) {
    if (!has(text, ...words)) continue;

    const hour = clock ? clock.hour : DAY_PART_HOUR[part ?? "morning"];
    const minute = clock ? clock.minute : 0;
    const when = nextWeekday(now, day, hour, minute);

    return {
      kind: "at",
      at: when,
      label: `יום ${WEEKDAY_LABEL[day]} ב-${hhmm(when)}`,
    };
  }

  /* ---------- שעה מדויקת היום ---------- */
  if (clock) {
    let when = atHour(now, clock.hour, clock.minute);

    /** השעה כבר עברה - מחר באותה שעה */
    if (when.getTime() <= now.getTime()) {
      when = atHour(addDays(now, 1), clock.hour, clock.minute);
      return { kind: "at", at: when, label: `מחר ב-${hhmm(when)}` };
    }

    return { kind: "at", at: when, label: `היום ב-${hhmm(when)}` };
  }

  /* ---------- חלק של היום בלבד ---------- */
  if (part) {
    const today = atHour(now, DAY_PART_HOUR[part]);

    if (today.getTime() > now.getTime()) {
      return { kind: "at", at: today, label: `היום ב${PART_LABEL[part]}` };
    }

    const when = atHour(addDays(now, 1), DAY_PART_HOUR[part]);
    return { kind: "at", at: when, label: `מחר ב${PART_LABEL[part]}` };
  }

  return { kind: "unclear" };
}

/* ============================================================
 *  "בעוד שעה", "עוד כמה שעות", "בעוד 20 דקות"
 * ============================================================ */

const HEB_NUMBERS: Record<string, number> = {
  שעה: 1,
  שעתימ: 2,
  שלוש: 3,
  ארבע: 4,
  חמש: 5,
  שש: 6,
  שבע: 7,
};

function relativeOffset(text: string): { minutes: number; label: string } | null {
  /** חייב להיות "עוד" או "בעוד" - אחרת "שעה 10" ייקרא כהיסט */
  if (!has(text, "עוד", "בעוד")) return null;

  if (/(עוד|בעוד)\s+חצי\s+שעה/.test(text)) {
    return { minutes: 30, label: "בעוד חצי שעה" };
  }

  const minutes = /(עוד|בעוד)\s+(\d{1,3})\s*(דקות|דק)/.exec(text);
  if (minutes) {
    const n = Number(minutes[2]);
    if (n > 0 && n <= 600) {
      return { minutes: n, label: `בעוד ${n} דקות` };
    }
  }

  const hours = /(עוד|בעוד)\s+(\d{1,2})\s*(שעות|שעה)/.exec(text);
  if (hours) {
    const n = Number(hours[2]);
    if (n > 0 && n <= 12) {
      return { minutes: n * 60, label: `בעוד ${n} שעות` };
    }
  }

  /**
   * "עוד כמה שעות" - אין מספר, אבל יש כוונה ברורה.
   * שלוש שעות היא הקריאה הסבירה, ועדיף לקבוע משהו
   * מאשר לשאול שוב על משהו שהלקוח כבר ענה.
   */
  if (/(עוד|בעוד)\s+(כמה|מספר)\s+שעות/.test(text)) {
    return { minutes: 3 * 60, label: "בעוד כמה שעות" };
  }

  for (const [word, n] of Object.entries(HEB_NUMBERS)) {
    if (padded(text).includes(` עוד ${word} `) ||
        padded(text).includes(` בעוד ${word} `)) {
      return {
        minutes: n * 60,
        label: n === 1 ? "בעוד שעה" : `בעוד ${n} שעות`,
      };
    }
  }

  return null;
}

/* ============================================================
 *  שעה מדויקת
 * ============================================================ */

function clockOf(text: string): { hour: number; minute: number } | null {
  /** 14:30 */
  const full = /(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/.exec(text);
  if (full) {
    const hour = Number(full[1]);
    const minute = Number(full[2]);
    if (hour <= 23 && minute <= 59) {
      return { hour: shiftToDay(hour, text), minute };
    }
  }

  /**
   * שעה בלי דקות. חייבת הקשר - "ב-10", "בשעה 10", "אחרי
   * 5" - אחרת כל מספר בהודעה היה נקרא כשעה, כולל מחיר
   * ומספר טלפון.
   */
  const bare =
    /(?:^|\s)(בשעה|אחרי|סביב|בסביבות|ב|מ)\s+(\d{1,2})(?:\s|$)/.exec(text);

  if (bare) {
    const hour = Number(bare[2]);
    if (hour >= 1 && hour <= 23) {
      return { hour: shiftToDay(hour, text), minute: 0 };
    }
  }

  return null;
}

/**
 * 1 עד 7 בלי ציון "בבוקר" הם אחר הצהריים.
 *
 * **זה מה שמונע תזכורת בשלוש לפנות בוקר.** מי שכותב
 * "תתקשר ב-5" מתכוון לחמש אחר הצהריים; אף לקוח לא מתכוון
 * לחמש לפנות בוקר. מי שכן התכוון לבוקר כותב את זה.
 */
function shiftToDay(hour: number, text: string): number {
  if (hour >= 1 && hour <= 7 && !has(text, "בוקר", "בבוקר")) {
    return hour + 12;
  }

  if (hour === 12 && has(text, "לילה", "בלילה")) return 0;

  return hour;
}

function hhmm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/* ============================================================
 *  שלא שתי תזכורות ייפלו על אותה דקה
 * ============================================================ */

/** קפיצה בין תזכורות שנפלו על אותו זמן */
export const SLOT_STEP_MINUTES = 5;

/**
 * הזמן הפנוי הראשון מהזמן המבוקש והלאה.
 *
 * **למה.** אם חמישה לקוחות אמרו "מחר בבוקר", כולם נופלים
 * על 9:00 - חמש תזכורות באותה דקה, ואין שום סיכוי לטפל
 * בהן. הם נפרסים 9:00, 9:05, 9:10 לפי סדר הלידים.
 */
export function freeSlot(
  desired: Date,
  taken: Date[],
  stepMinutes = SLOT_STEP_MINUTES
): Date {
  const used = new Set(
    taken.map((t) => Math.floor(t.getTime() / 60000) * 60000)
  );

  let at = Math.floor(desired.getTime() / 60000) * 60000;

  /** גבול: 24 שעות קדימה, כדי שלא ייווצר לופ אינסופי */
  const limit = at + 24 * 60 * 60 * 1000;

  while (used.has(at) && at < limit) {
    at += stepMinutes * 60000;
  }

  return new Date(at);
}
