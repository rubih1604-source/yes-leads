/**
 * ============================================================
 *  שעות פעילות
 * ============================================================
 *
 *  ראשון-חמישי  08:00-18:30
 *  שישי          08:30-14:00
 *  שבת           סגור
 *
 *  כל שליחה מתוזמנת שנופלת מחוץ לחלון נדחית לתחילת
 *  חלון העבודה הבא. הכל מחושב בשעון ישראל, לא בשעון השרת.
 */

const TZ = "Asia/Jerusalem";

/** 0=ראשון ... 6=שבת */
export type WorkingWindow = { openMin: number; closeMin: number } | null;

export function windowForDay(day: number): WorkingWindow {
  if (day >= 0 && day <= 4) return { openMin: 8 * 60, closeMin: 18 * 60 + 30 };
  if (day === 5) return { openMin: 8 * 60 + 30, closeMin: 14 * 60 };
  return null; // שבת
}

/** כמה דקות הפרש יש בין שעון ישראל ל-UTC ברגע מסוים */
function israelOffsetMinutes(date: Date): number {
  const asUtc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const asIsrael = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  return Math.round((asIsrael.getTime() - asUtc.getTime()) / 60000);
}

export type IsraelParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
};

/** מפרק תאריך לרכיבים בשעון ישראל */
export function israelParts(date: Date): IsraelParts {
  const local = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    weekday: local.getDay(),
    minutes: local.getHours() * 60 + local.getMinutes(),
  };
}

/** בונה תאריך אמיתי משעה מסוימת בשעון ישראל */
export function fromIsrael(
  year: number,
  month: number,
  day: number,
  minutes: number
): Date {
  const naiveUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0
  );
  // ניחוש ראשון לפי ההיסט באותו רגע, ואז תיקון אם ההיסט שונה
  let guess = new Date(naiveUtc - israelOffsetMinutes(new Date(naiveUtc)) * 60000);
  const corrected = new Date(naiveUtc - israelOffsetMinutes(guess) * 60000);
  if (corrected.getTime() !== guess.getTime()) guess = corrected;
  return guess;
}

export function isWithinWorkingHours(date: Date): boolean {
  const p = israelParts(date);
  const win = windowForDay(p.weekday);
  if (!win) return false;
  return p.minutes >= win.openMin && p.minutes < win.closeMin;
}

/**
 * מחזיר את הזמן עצמו אם הוא בתוך שעות הפעילות,
 * ואחרת את תחילת חלון העבודה הבא.
 */
export function shiftToWorkingHours(date: Date): Date {
  if (isWithinWorkingHours(date)) return date;

  let p = israelParts(date);

  // אם עוד לא נפתח היום - פותחים היום
  const todayWindow = windowForDay(p.weekday);
  if (todayWindow && p.minutes < todayWindow.openMin) {
    return fromIsrael(p.year, p.month, p.day, todayWindow.openMin);
  }

  // אחרת - היום הבא שיש בו חלון
  for (let i = 1; i <= 8; i++) {
    const probe = new Date(date.getTime() + i * 24 * 60 * 60 * 1000);
    p = israelParts(probe);
    const win = windowForDay(p.weekday);
    if (win) {
      return fromIsrael(p.year, p.month, p.day, win.openMin);
    }
  }

  return date; // לא אמור לקרות
}

const DAY_NAMES = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

/**
 * מנסח מתי אתה חוזר לעבוד, בעברית טבעית.
 *
 * חמישי בערב  -> "מחר בבוקר"
 * שישי בערב   -> "ביום ראשון"
 * שבת         -> "מחר בבוקר"
 *
 * זה מונע מצב שבו לקוח מקבל "מחר בבוקר" ביום שישי בערב.
 */
export function nextWorkingPhrase(now: Date = new Date()): string {
  if (isWithinWorkingHours(now)) return "היום";

  const next = shiftToWorkingHours(now);
  const today = israelParts(now);
  const target = israelParts(next);

  // אותו יום - נפתח בהמשך היום
  if (
    today.year === target.year &&
    today.month === target.month &&
    today.day === target.day
  ) {
    return "היום";
  }

  // מחר
  const tomorrow = israelParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  if (
    tomorrow.year === target.year &&
    tomorrow.month === target.month &&
    tomorrow.day === target.day
  ) {
    return "מחר בבוקר";
  }

  return `ביום ${DAY_NAMES[target.weekday]}`;
}

/** תחילת היום הנוכחי בשעון ישראל */
export function startOfIsraelDay(date: Date = new Date()): Date {
  const p = israelParts(date);
  return fromIsrael(p.year, p.month, p.day, 0);
}
