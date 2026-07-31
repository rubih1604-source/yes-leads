/**
 * ============================================================
 *  מתי הלקוח ביקש שנחזור אליו
 * ============================================================
 *
 *  לקוח כותב "תדבר איתי יום שני בשעה 10" - זו שעה מדויקת.
 *  לקוח כותב "יום שני בבוקר" - זו לא שעה, אבל זו כן כוונה
 *  ברורה, ולא נכון לזרוק אותה. אנחנו בוחרים שעה סבירה
 *  בתוך אותו חלק של היום ופותחים משימה.
 *
 *  עדיף משימה ב-9:30 שאתה מזיז, מאשר לקוח שנשכח.
 */

import {
  israelParts,
  fromIsrael,
  isWithinWorkingHours,
  shiftToWorkingHours,
} from "./working-hours";

export type DayPart = "morning" | "noon" | "afternoon" | "evening";

/** השעה שנבחרת לכל חלק של היום */
export const DAY_PART_MINUTES: Record<DayPart, number> = {
  morning: 9 * 60 + 30, // 09:30 - בתוך 9-10
  noon: 12 * 60 + 30, // 12:30
  afternoon: 17 * 60, // 17:00 - בתוך 16:30-17:30
  evening: 18 * 60, // 18:00 - עוד בשעות העבודה
};

/** ביום שישי אין אחר צהריים - סוגרים ב-14:00 */
const FRIDAY_FALLBACK = 12 * 60 + 30;

export type ResolvedCallback = {
  at: Date;
  precise: boolean;
  note: string;
};

export function resolveCallbackTime(params: {
  isoDateTime?: string | null;
  confident?: boolean;
  date?: string | null;
  dayPart?: DayPart | null;
  now?: Date;
}): ResolvedCallback | null {
  const now = params.now ?? new Date();

  // ---- שעה מדויקת שהמודל חילץ ----
  if (params.isoDateTime && params.confident) {
    const parsed = new Date(params.isoDateTime);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      return {
        at: shiftToWorkingHours(parsed),
        precise: true,
        note: "הלקוח ציין שעה מדויקת",
      };
    }
  }

  const part: DayPart | null = params.dayPart ?? null;

  // ---- יום מסוים, עם או בלי חלק יום ----
  if (params.date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.date.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);

      let minutes = DAY_PART_MINUTES[part ?? "morning"];

      // בדיקת יום בשבוע ליעד
      const probe = fromIsrael(year, month, day, minutes);
      const weekday = israelParts(probe).weekday;
      if (weekday === 5 && minutes > FRIDAY_FALLBACK) {
        minutes = FRIDAY_FALLBACK;
      }

      const at = fromIsrael(year, month, day, minutes);
      if (at.getTime() > now.getTime()) {
        return {
          at: shiftToWorkingHours(at),
          precise: false,
          note: part
            ? `הלקוח ביקש ${hebrewPart(part)}, נקבע לשעה ${formatHour(minutes)}`
            : `הלקוח ציין יום, נקבע לשעה ${formatHour(minutes)}`,
        };
      }
    }
  }

  // ---- רק חלק יום, בלי תאריך ----
  if (part) {
    const today = israelParts(now);
    let minutes = DAY_PART_MINUTES[part];

    if (today.weekday === 5 && minutes > FRIDAY_FALLBACK) {
      minutes = FRIDAY_FALLBACK;
    }

    let at = fromIsrael(today.year, today.month, today.day, minutes);

    // אם השעה הזו כבר עברה היום - מחר
    if (at.getTime() <= now.getTime()) {
      const tomorrow = israelParts(
        new Date(now.getTime() + 24 * 60 * 60 * 1000)
      );
      let m = DAY_PART_MINUTES[part];
      if (tomorrow.weekday === 5 && m > FRIDAY_FALLBACK) m = FRIDAY_FALLBACK;
      at = fromIsrael(tomorrow.year, tomorrow.month, tomorrow.day, m);
    }

    return {
      at: shiftToWorkingHours(at),
      precise: false,
      note: `הלקוח ביקש ${hebrewPart(part)}, נקבע לשעה ${formatHour(
        israelParts(at).minutes
      )}`,
    };
  }

  return null;
}

function formatHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hebrewPart(part: DayPart): string {
  return {
    morning: "בוקר",
    noon: "צהריים",
    afternoon: "אחר הצהריים",
    evening: "ערב",
  }[part];
}

export { isWithinWorkingHours };
