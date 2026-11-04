/**
 * ============================================================
 *  סיכום היום - בשביל מסך הצד
 * ============================================================
 *
 *  מסך הצד הוא מערכת נפרדת. הוא לא נוגע בבסיס הנתונים כאן,
 *  רק קורא את הסיכום הזה דרך /api/public/summary.
 *
 *  "היום" = מחצות בשעון ישראל. ההשוואה לאתמול היא עד אותה
 *  שעה, כדי שבוקר יושווה לבוקר ולא ליממה שלמה.
 */

import { db } from "./db";
import { getRevenue } from "./revenue";
import { startOfIsraelDay, israelParts } from "./working-hours";
import { syncAdSpend } from "./ad-spend";
import { getWonStatusNames } from "./status-store";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXISTING_STATUS = "לקוח קיים";
const NEW_STATUS = "חדש";

export type DaySummary = {
  generatedAt: string;
  leads: {
    mine: number;
    mineYesterday: number;
    sale: number;
    saleRevenue: number;
    existing: number;
    waiting: number;
  };
  sales: {
    deals: number;
    dealsYesterday: number;
    earnedToday: number;
    earnedMonth: number;
    monthTarget: number;
    monthProgress: number;
  };
  ads: {
    /** null = עוד לא נשלפה הוצאה להיום מפייסבוק */
    spendToday: number | null;
    spendMonth: number;
    /** הוצאה היום חלקי כל הלידים שנכנסו היום (שלך + מכירה) */
    costPerLead: number | null;
  };
  activity: {
    statusChanges: number;
    whatsappOut: number;
    whatsappIn: number;
  };
  callsToday: Array<{ time: string | null; title: string; leadName: string | null }>;
  /** null = מרכזייה עוד לא מחוברת */
  calls: null;
};

function personName(first?: string | null, last?: string | null): string | null {
  const n = [first, last].filter(Boolean).join(" ").trim();
  return n || null;
}

/**
 * ההוצאה של היום.
 *
 * המנוע שולף מפייסבוק פעם ביום ב-6 בבוקר, ולכן ההוצאה של
 * היום עצמו לא הייתה קיימת עד מחר. כאן מבקשים מאותו מנגנון
 * בדיוק (syncAdSpend) לרענן את היום - לכל היותר פעם בחצי
 * שעה, ברקע, בלי לעכב את הסיכום. הקריאה הבאה כבר רואה אותו.
 */
const SPEND_REFRESH_MS = 30 * 60 * 1000;
let lastSpendRefresh = 0;

function refreshTodaySpend(now: Date) {
  if (now.getTime() - lastSpendRefresh < SPEND_REFRESH_MS) return;
  lastSpendRefresh = now.getTime();
  syncAdSpend(1, true).catch(() => null);
}

function ymdKey(date: Date): Date {
  const p = israelParts(date);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return new Date(`${p.year}-${mm}-${dd}T00:00:00.000Z`);
}

function monthKey(date: Date): Date {
  const p = israelParts(date);
  return new Date(`${p.year}-${String(p.month).padStart(2, "0")}-01T00:00:00.000Z`);
}

async function arrivals(from: Date, to: Date) {
  return db.leadEntry.findMany({
    where: { at: { gte: from, lt: to } },
    select: {
      isSale: true,
      billable: true,
      price: true,
      lead: { select: { status: true } },
    },
  });
}

async function closings(from: Date, to: Date): Promise<number> {
  const won = await db.leadEvent.findMany({
    where: {
      type: "status_changed",
      createdAt: { gte: from, lt: to },
      toStatus: { in: await getWonStatusNames() },
    },
    select: { leadId: true },
  });
  return new Set(won.map((w) => w.leadId)).size;
}

export async function getDaySummary(now = new Date()): Promise<DaySummary> {
  const today = startOfIsraelDay(now);
  const tomorrow = new Date(today.getTime() + DAY_MS + 60 * 60 * 1000);
  const endOfToday = startOfIsraelDay(tomorrow);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const yesterdaySameHour = new Date(now.getTime() - DAY_MS);

  const [
    todayEntries,
    yEntries,
    revToday,
    revMonth,
    dealsYesterday,
    statusChanges,
    waOut,
    waIn,
    tasks,
    spendTodayRows,
    spendMonthAgg,
  ] = await Promise.all([
    arrivals(today, now),
    arrivals(yesterday, yesterdaySameHour),
    getRevenue("today"),
    getRevenue("month"),
    closings(yesterday, yesterdaySameHour),
    db.leadEvent.count({
      where: { type: "status_changed", createdAt: { gte: today } },
    }),
    db.message.count({
      where: { direction: "out", broadcast: false, createdAt: { gte: today } },
    }),
    db.message.count({
      where: { direction: "in", createdAt: { gte: today } },
    }),
    db.task.findMany({
      where: { done: false, leadId: { not: null }, dueAt: { lt: endOfToday } },
      orderBy: { dueAt: "asc" },
      take: 8,
      select: {
        title: true,
        dueAt: true,
        lead: { select: { firstName: true, lastName: true } },
      },
    }),
    db.adSpend.findMany({
      where: { date: ymdKey(now) },
      select: { spend: true },
    }),
    db.adSpend.aggregate({
      where: { date: { gte: monthKey(now), lte: ymdKey(now) } },
      _sum: { spend: true },
    }),
  ]);

  refreshTodaySpend(now);

  const spendToday = spendTodayRows.length
    ? Math.round(spendTodayRows.reduce((sum, r) => sum + (r.spend || 0), 0))
    : null;

  const mine = todayEntries.filter((e) => !e.isSale);
  const sale = todayEntries.filter((e) => e.isSale);

  return {
    generatedAt: now.toISOString(),
    leads: {
      mine: mine.length,
      mineYesterday: yEntries.filter((e) => !e.isSale).length,
      sale: sale.length,
      saleRevenue: Math.round(
        sale.filter((e) => e.billable).reduce((sum, e) => sum + (e.price || 0), 0)
      ),
      existing: mine.filter((e) => e.lead?.status === EXISTING_STATUS).length,
      waiting: mine.filter((e) => e.lead?.status === NEW_STATUS).length,
    },
    sales: {
      deals: revToday.deals,
      dealsYesterday,
      earnedToday: revToday.earned,
      earnedMonth: revMonth.earned,
      monthTarget: revMonth.target,
      monthProgress: revMonth.progress,
    },
    ads: {
      spendToday,
      spendMonth: Math.round(spendMonthAgg._sum.spend || 0),
      costPerLead:
        spendToday !== null && todayEntries.length > 0
          ? Math.round(spendToday / todayEntries.length)
          : null,
    },
    activity: {
      statusChanges,
      whatsappOut: waOut,
      whatsappIn: waIn,
    },
    callsToday: tasks.map((t) => ({
      time: t.dueAt ? t.dueAt.toISOString() : null,
      title: t.title,
      leadName: t.lead ? personName(t.lead.firstName, t.lead.lastName) : null,
    })),
    calls: null,
  };
}
