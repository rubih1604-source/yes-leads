/**
 * ============================================================
 *  טווחי תאריכים
 * ============================================================
 *
 *  כל המסכים שמציגים נתונים לפי תקופה משתמשים באותם טווחים,
 *  כדי שהמספרים תמיד ידברו באותה שפה.
 */

import { israelParts, fromIsrael } from "./working-hours";

export type PeriodKey =
  | "this_month"
  | "last_month"
  | "last_3"
  | "this_year"
  | "last_year"
  | "all"
  | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  this_month: "החודש",
  last_month: "חודש קודם",
  last_3: "3 חודשים",
  this_year: "השנה",
  last_year: "שנה אחרונה",
  all: "הכל",
  custom: "טווח שאבחר",
};

export type Range = { from: Date; to: Date; label: string };

function monthStart(year: number, month: number): Date {
  return fromIsrael(year, month, 1, 0);
}

/** התאריך שאחרי סוף הטווח, לצורך השוואה */
function nextMonthStart(year: number, month: number): Date {
  return month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1);
}

export function resolveRange(
  key: PeriodKey,
  from?: string | null,
  to?: string | null,
  now = new Date()
): Range {
  const p = israelParts(now);

  if (key === "custom" && from) {
    const start = new Date(`${from}T00:00:00+03:00`);
    const end = to
      ? new Date(`${to}T23:59:59+03:00`)
      : new Date(now.getTime());
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return {
        from: start,
        to: end,
        label: `${from} עד ${to ?? "היום"}`,
      };
    }
  }

  if (key === "last_month") {
    const year = p.month === 1 ? p.year - 1 : p.year;
    const month = p.month === 1 ? 12 : p.month - 1;
    return {
      from: monthStart(year, month),
      to: nextMonthStart(year, month),
      label: `${month}/${year}`,
    };
  }

  if (key === "last_3") {
    let year = p.year;
    let month = p.month - 2;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    return {
      from: monthStart(year, month),
      to: now,
      label: "3 החודשים האחרונים",
    };
  }

  if (key === "this_year") {
    return { from: monthStart(p.year, 1), to: now, label: `${p.year}` };
  }

  if (key === "last_year") {
    return {
      from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      to: now,
      label: "12 החודשים האחרונים",
    };
  }

  if (key === "all") {
    return { from: new Date(0), to: now, label: "כל הזמן" };
  }

  // ברירת מחדל: החודש הנוכחי
  return {
    from: monthStart(p.year, p.month),
    to: now,
    label: `${p.month}/${p.year}`,
  };
}
