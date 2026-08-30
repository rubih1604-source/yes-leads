/**
 * ============================================================
 *  תובנות
 * ============================================================
 *
 *  שתי שאלות שהמערכת יכולה לענות עליהן, ואף אחד לא שאל:
 *
 *  1. מתי באמת קורים דברים - מתי נכנסים לידים, מתי הם
 *     עונים, ומתי נסגרות עסקאות. לפי זה מתזמנים קמפיינים
 *     ויודעים מתי חייבים להיות זמינים.
 *
 *  2. מה מאפיין ליד שנסגר לעומת ליד שלא. אם יש הבדל
 *     עקבי - אפשר לשכפל אותו.
 *
 *  הכל מחושב מנתונים שכבר קיימים. שום מעקב חדש.
 */

import { db } from "./db";
import { getStatuses } from "./status-store";
import { isExistingCustomer } from "./existing-customer";
import { israelParts } from "./working-hours";
import type { Range } from "./periods";

export const DAY_NAMES = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

export type HeatCell = { day: number; hour: number; count: number };

export type Heatmap = {
  cells: HeatCell[];
  max: number;
  byDay: Array<{ day: number; name: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  total: number;
  peakDay: string | null;
  peakHour: number | null;
};

export type Comparison = {
  label: string;
  won: string;
  lost: string;
  hint: string | null;
};

export type Winner = {
  name: string;
  total: number;
  won: number;
  rate: number;
};

export type InsightsData = {
  arrivals: Heatmap;
  replies: Heatmap;
  closings: Heatmap;
  comparisons: Comparison[];
  byCampaign: Winner[];
  bySupplier: Winner[];
  byTemplate: Winner[];
  totalLeads: number;
  totalWon: number;
  label: string;
};

function emptyHeat(): Map<string, number> {
  return new Map();
}

function buildHeat(dates: Date[]): Heatmap {
  const map = emptyHeat();
  const dayTotals = new Array(7).fill(0);
  const hourTotals = new Array(24).fill(0);

  for (const d of dates) {
    const p = israelParts(d);
    const hour = Math.floor(p.minutes / 60);
    const key = `${p.weekday}-${hour}`;
    map.set(key, (map.get(key) ?? 0) + 1);
    dayTotals[p.weekday]++;
    hourTotals[hour]++;
  }

  const cells: HeatCell[] = [];
  let max = 0;
  for (const [key, count] of map) {
    const [day, hour] = key.split("-").map(Number);
    cells.push({ day, hour, count });
    if (count > max) max = count;
  }

  const peakDayIndex = dayTotals.indexOf(Math.max(...dayTotals));
  const peakHourIndex = hourTotals.indexOf(Math.max(...hourTotals));

  return {
    cells,
    max,
    byDay: dayTotals.map((count, day) => ({
      day,
      name: DAY_NAMES[day],
      count,
    })),
    byHour: hourTotals.map((count, hour) => ({ hour, count })),
    total: dates.length,
    peakDay: dates.length ? DAY_NAMES[peakDayIndex] : null,
    peakHour: dates.length ? peakHourIndex : null,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function humanMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m} דק'`;
  const h = Math.round((m / 60) * 10) / 10;
  if (h < 24) return `${h} שע'`;
  return `${Math.round(h / 24)} ימים`;
}

function rate(won: number, total: number): number {
  return total > 0 ? Math.round((won / total) * 1000) / 10 : 0;
}

function fieldOf(extra: unknown, keys: string[]): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const record = extra as Record<string, string>;
  for (const key of keys) {
    if (record[key]?.trim()) return record[key].trim();
  }
  return null;
}

export async function getInsights(range: Range): Promise<InsightsData> {
  const statuses = await getStatuses();
  const wonNames = new Set(statuses.filter((s) => s.won).map((s) => s.name));

  const leads = await db.lead.findMany({
    where: {
      origin: "leadmanager",
      intakeAt: { gte: range.from, lt: range.to },
    },
    select: {
      id: true,
      status: true,
      intakeAt: true,
      extra: true,
    },
  });

  const ids = leads.map((l) => l.id);

  const messages = ids.length
    ? await db.message.findMany({
        where: { leadId: { in: ids } },
        select: {
          leadId: true,
          direction: true,
          templateName: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  /**
   * מפת הסגירות מודדת מתי **שינית סטטוס במערכת**, לא מתי
   * העסקה נסגרה בפועל.
   *
   * לכן מסננים עדכונים שהגיעו מטעינת דוח או מייבוא: שם כל
   * הסגירות מקבלות את חותמת הזמן של רגע הטעינה, וזה מייצר
   * שיא מדומה ביום שבו טענת את הקובץ - כולל שבת.
   */
  const rawClosings = ids.length
    ? await db.leadEvent.findMany({
        where: {
          leadId: { in: ids },
          type: "status_changed",
          toStatus: { in: Array.from(wonNames) },
        },
        select: { leadId: true, createdAt: true, payload: true },
      })
    : [];

  const closings = rawClosings.filter((e) => {
    if (!e.payload || typeof e.payload !== "object") return true;
    const note = (e.payload as Record<string, unknown>).note;
    if (typeof note !== "string") return true;
    return !/דוח|ייבוא|יובא/.test(note);
  });

  // ---- קיבוץ לפי ליד ----
  const firstOut = new Map<string, Date>();
  const firstIn = new Map<string, Date>();
  const touches = new Map<string, number>();
  const firstTemplate = new Map<string, string>();

  for (const m of messages) {
    if (m.direction === "out") {
      if (!firstOut.has(m.leadId)) firstOut.set(m.leadId, m.createdAt);
      if (m.templateName && !firstTemplate.has(m.leadId)) {
        firstTemplate.set(m.leadId, m.templateName);
      }
    } else if (!firstIn.has(m.leadId)) {
      firstIn.set(m.leadId, m.createdAt);
    }
    touches.set(m.leadId, (touches.get(m.leadId) ?? 0) + 1);
  }

  const wonSet = new Set(
    leads.filter((l) => wonNames.has(l.status)).map((l) => l.id)
  );

  // ---- מפות חום ----
  const arrivals = buildHeat(leads.map((l) => l.intakeAt));
  const replies = buildHeat(Array.from(firstIn.values()));
  const closingHeat = buildHeat(closings.map((c) => c.createdAt));

  // ---- השוואה: נסגר מול לא נסגר ----
  const speedWon: number[] = [];
  const speedLost: number[] = [];
  const touchWon: number[] = [];
  const touchLost: number[] = [];
  let repliedWon = 0;
  let repliedLost = 0;
  let notRepliedWon = 0;
  let notRepliedLost = 0;

  for (const lead of leads) {
    const isWon = wonSet.has(lead.id);
    const out = firstOut.get(lead.id);

    if (out) {
      const mins = Math.round(
        (out.getTime() - lead.intakeAt.getTime()) / 60000
      );
      if (mins >= 0) (isWon ? speedWon : speedLost).push(mins);
    }

    (isWon ? touchWon : touchLost).push(touches.get(lead.id) ?? 0);

    if (firstIn.has(lead.id)) {
      if (isWon) repliedWon++;
      else repliedLost++;
    } else {
      if (isWon) notRepliedWon++;
      else notRepliedLost++;
    }
  }

  const medWon = median(speedWon);
  const medLost = median(speedLost);

  const comparisons: Comparison[] = [
    {
      label: "זמן עד המגע הראשון",
      won: humanMinutes(medWon),
      lost: humanMinutes(medLost),
      hint:
        medWon !== null && medLost !== null && medLost > medWon * 1.5
          ? "לידים שנסגרו קיבלו מענה מהר יותר. זה המנוף הכי זול שיש לך."
          : null,
    },
    {
      label: "כמה הודעות הוחלפו",
      won: `${median(touchWon) ?? 0}`,
      lost: `${median(touchLost) ?? 0}`,
      hint: null,
    },
    {
      label: "אחוז סגירה כשהלקוח ענה",
      won: `${rate(repliedWon, repliedWon + repliedLost)}%`,
      lost: `${rate(notRepliedWon, notRepliedWon + notRepliedLost)}%`,
      hint:
        rate(repliedWon, repliedWon + repliedLost) >
        rate(notRepliedWon, notRepliedWon + notRepliedLost) * 1.5
          ? "לגרום ללקוח לענות זה חצי מהעבודה. שווה להשקיע בתבנית הפותחת."
          : null,
    },
  ];

  // ---- מי מביא סגירות ----
  function group(
    keyFor: (lead: (typeof leads)[number]) => string | null
  ): Winner[] {
    const map = new Map<string, { total: number; won: number }>();
    for (const lead of leads) {
      const key = keyFor(lead);
      if (!key) continue;
      const row = map.get(key) ?? { total: 0, won: 0 };
      row.total++;
      if (wonSet.has(lead.id)) row.won++;
      map.set(key, row);
    }
    return Array.from(map.entries())
      .map(([name, row]) => ({
        name,
        total: row.total,
        won: row.won,
        rate: rate(row.won, row.total),
      }))
      .filter((r) => r.total >= 5)
      .sort((a, b) => b.rate - a.rate);
  }

  const byCampaign = group((l) => fieldOf(l.extra, ["fb_campaign", "campaign"]));
  const bySupplier = group((l) => fieldOf(l.extra, ["supplier_question"]));
  const byTemplate = group((l) => firstTemplate.get(l.id) ?? null);

  return {
    arrivals,
    replies,
    closings: closingHeat,
    comparisons,
    byCampaign,
    bySupplier,
    byTemplate,
    totalLeads: leads.length,
    totalWon: wonSet.size,
    label: range.label,
  };
}
