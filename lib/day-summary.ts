/**
 * ============================================================
 *  סיכום לתקופה - בשביל מסך הצד
 * ============================================================
 *
 *  מסך הצד הוא מערכת נפרדת. הוא לא נוגע בבסיס הנתונים כאן,
 *  רק קורא את הסיכום הזה דרך /api/public/summary.
 *
 *  תקופות: היום · השבוע (מיום ראשון) · החודש · טווח חופשי.
 *  ההשוואה היא לתקופה הקודמת באותו אורך ועד אותה נקודה -
 *  היום מול אתמול עד אותה שעה, השבוע מול שבוע שעבר עד אותו
 *  רגע. ככה בוקר מושווה לבוקר ולא ליממה שלמה.
 */

import { db } from "./db";
import { getRevenue } from "./revenue";
import { startOfIsraelDay, israelParts, fromIsrael } from "./working-hours";
import { syncAdSpend } from "./ad-spend";
import { getWonStatusNames } from "./status-store";
import { normalize } from "./campaign-performance";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXISTING_STATUS = "לקוח קיים";
const NEW_STATUS = "חדש";

export type SummaryPeriod = "today" | "week" | "month" | "custom";

export type DaySummary = {
  generatedAt: string;
  period: { key: SummaryPeriod; label: string; from: string; to: string; compareLabel: string };
  leads: {
    mine: number;
    minePrev: number;
    sale: number;
    saleRevenue: number;
    existing: number;
    waiting: number;
  };
  sales: {
    deals: number;
    dealsPrev: number;
    earned: number;
    /** היעד חודשי, ולכן הפס תמיד מראה את החודש - בכל תקופה שנבחרה */
    earnedMonth: number;
    monthTarget: number;
    monthProgress: number;
  };
  ads: {
    /** null = עוד לא נשלפה הוצאה לתקופה מפייסבוק */
    spend: number | null;
    /** הוצאה על הקמפיינים שלך בלבד (בלי קמפיינים של מכירת לידים) */
    spendMine: number | null;
    /** הוצאה על הקמפיינים שלך חלקי הלידים שלך */
    costPerLead: number | null;
    spendMonth: number;
    /** מתי ההוצאה נשלפה לאחרונה מפייסבוק */
    syncedAt: string | null;
  };
  activity: {
    statusChanges: number;
    whatsappOut: number;
    whatsappIn: number;
  };
  /** null = מרכזייה עוד לא מחוברת */
  calls: null;
};

// ---------- טווחים ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayStartOf(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return fromIsrael(y, m, d, 0);
}

function nextDayStart(date: Date): Date {
  return startOfIsraelDay(new Date(date.getTime() + DAY_MS + 2 * 60 * 60 * 1000));
}

export function resolveSummaryRange(
  key: string | null,
  fromStr: string | null,
  toStr: string | null,
  now = new Date()
): { key: SummaryPeriod; label: string; from: Date; to: Date; prevFrom: Date; prevTo: Date; compareLabel: string } {
  const today = startOfIsraelDay(now);

  if (key === "custom" && fromStr && DATE_RE.test(fromStr)) {
    const from = dayStartOf(fromStr);
    const lastDay = toStr && DATE_RE.test(toStr) ? dayStartOf(toStr) : today;
    let to = nextDayStart(lastDay);
    if (to > now) to = now;
    if (to > from) {
      const len = to.getTime() - from.getTime();
      return {
        key: "custom",
        label: `${fromStr.split("-").reverse().join(".")} – ${(toStr && DATE_RE.test(toStr) ? toStr : "").split("-").reverse().join(".") || "היום"}`,
        from, to,
        prevFrom: new Date(from.getTime() - len), prevTo: from,
        compareLabel: "מהתקופה הקודמת",
      };
    }
  }

  if (key === "week") {
    const weekday = israelParts(now).weekday; // 0 = ראשון
    const from = startOfIsraelDay(new Date(today.getTime() - weekday * DAY_MS + 2 * 60 * 60 * 1000));
    const prevFrom = startOfIsraelDay(new Date(from.getTime() - 7 * DAY_MS + 2 * 60 * 60 * 1000));
    return {
      key: "week", label: "השבוע", from, to: now,
      prevFrom, prevTo: new Date(prevFrom.getTime() + (now.getTime() - from.getTime())),
      compareLabel: "משבוע שעבר",
    };
  }

  if (key === "month") {
    const p = israelParts(now);
    const from = fromIsrael(p.year, p.month, 1, 0);
    const prevFrom = p.month === 1 ? fromIsrael(p.year - 1, 12, 1, 0) : fromIsrael(p.year, p.month - 1, 1, 0);
    return {
      key: "month", label: "החודש", from, to: now,
      prevFrom, prevTo: new Date(prevFrom.getTime() + (now.getTime() - from.getTime())),
      compareLabel: "מחודש שעבר",
    };
  }

  return {
    key: "today", label: "היום", from: today, to: now,
    prevFrom: new Date(today.getTime() - DAY_MS), prevTo: new Date(now.getTime() - DAY_MS),
    compareLabel: "מאתמול",
  };
}

// ---------- הוצאת פרסום ----------

/**
 * המנוע שולף מפייסבוק פעם ביום ב-6 בבוקר, ולכן ההוצאה של היום
 * לא הייתה קיימת עד מחר. כאן מבקשים מאותו מנגנון (syncAdSpend)
 * לרענן את היום - לכל היותר פעם ב-10 דקות, ברקע, בלי לעכב.
 */
const SPEND_REFRESH_MS = 10 * 60 * 1000;
let lastSpendRefresh = 0;

function refreshTodaySpend(now: Date) {
  if (now.getTime() - lastSpendRefresh < SPEND_REFRESH_MS) return;
  lastSpendRefresh = now.getTime();
  syncAdSpend(1, true).catch(() => null);
}

/** ההוצאה נשמרת לפי יום בשעון ישראל, כחצות UTC של אותו תאריך */
function ymdKey(date: Date): Date {
  const p = israelParts(date);
  return new Date(`${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T00:00:00.000Z`);
}

/**
 * קמפיין של מכירת לידים = קמפיין שרוב הלידים שלו (מאז ומעולם)
 * הגיעו כמכירה. ההצלבה לפי שם הקמפיין - כמו במסך ביצועי
 * הקמפיינים, כדי ששני המסכים יגידו את אותו מספר.
 * קמפיין בלי לידים בכלל נחשב שלך: זה כסף שיצא ממך.
 */
async function saleCampaignKeys(names: string[]): Promise<Set<string>> {
  if (!names.length) return new Set();
  const grouped = await db.leadEntry.groupBy({
    by: ["campaign", "isSale"],
    where: { campaign: { not: null } },
    _count: { _all: true },
  });
  const tally = new Map<string, { sale: number; mine: number }>();
  for (const g of grouped) {
    const key = normalize(g.campaign || "");
    const t = tally.get(key) ?? { sale: 0, mine: 0 };
    if (g.isSale) t.sale += g._count._all;
    else t.mine += g._count._all;
    tally.set(key, t);
  }
  const out = new Set<string>();
  for (const name of names) {
    const t = tally.get(normalize(name));
    if (t && t.sale > t.mine) out.add(normalize(name));
  }
  return out;
}

// ---------- הסיכום ----------

async function arrivals(from: Date, to: Date) {
  return db.leadEntry.findMany({
    where: { at: { gte: from, lt: to } },
    select: { isSale: true, billable: true, price: true, lead: { select: { status: true } } },
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

export async function getDaySummary(
  opts: { period?: string | null; from?: string | null; to?: string | null } = {},
  now = new Date()
): Promise<DaySummary> {
  const r = resolveSummaryRange(opts.period ?? "today", opts.from ?? null, opts.to ?? null, now);
  const p = israelParts(now);
  const monthStart = fromIsrael(p.year, p.month, 1, 0);

  const [entries, prevEntries, rev, revMonth, dealsPrev, statusChanges, waOut, waIn, spendRows, spendMonthAgg] =
    await Promise.all([
      arrivals(r.from, r.to),
      arrivals(r.prevFrom, r.prevTo),
      getRevenue({ from: r.from, to: r.to, label: r.label }),
      getRevenue("month"),
      closings(r.prevFrom, r.prevTo),
      db.leadEvent.count({ where: { type: "status_changed", createdAt: { gte: r.from, lt: r.to } } }),
      db.message.count({ where: { direction: "out", broadcast: false, createdAt: { gte: r.from, lt: r.to } } }),
      db.message.count({ where: { direction: "in", createdAt: { gte: r.from, lt: r.to } } }),
      db.adSpend.findMany({
        where: { date: { gte: ymdKey(r.from), lte: ymdKey(new Date(r.to.getTime() - 1)) } },
        select: { campaignName: true, spend: true, syncedAt: true },
      }),
      db.adSpend.aggregate({
        where: { date: { gte: ymdKey(monthStart), lte: ymdKey(now) } },
        _sum: { spend: true },
      }),
    ]);

  refreshTodaySpend(now);

  const mine = entries.filter((e) => !e.isSale);
  const sale = entries.filter((e) => e.isSale);

  let spend: number | null = null;
  let spendMine: number | null = null;
  let syncedAt: string | null = null;
  if (spendRows.length) {
    const saleKeys = await saleCampaignKeys(Array.from(new Set(spendRows.map((s) => s.campaignName))));
    spend = spendRows.reduce((sum, s) => sum + (s.spend || 0), 0);
    spendMine = spendRows
      .filter((s) => !saleKeys.has(normalize(s.campaignName)))
      .reduce((sum, s) => sum + (s.spend || 0), 0);
    const latest = spendRows.reduce((a, s) => (s.syncedAt > a ? s.syncedAt : a), spendRows[0].syncedAt);
    syncedAt = latest.toISOString();
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    generatedAt: now.toISOString(),
    period: { key: r.key, label: r.label, from: r.from.toISOString(), to: r.to.toISOString(), compareLabel: r.compareLabel },
    leads: {
      mine: mine.length,
      minePrev: prevEntries.filter((e) => !e.isSale).length,
      sale: sale.length,
      saleRevenue: Math.round(sale.filter((e) => e.billable).reduce((sum, e) => sum + (e.price || 0), 0)),
      existing: mine.filter((e) => e.lead?.status === EXISTING_STATUS).length,
      waiting: mine.filter((e) => e.lead?.status === NEW_STATUS).length,
    },
    sales: {
      deals: rev.deals,
      dealsPrev,
      earned: rev.earned,
      earnedMonth: revMonth.earned,
      monthTarget: revMonth.target,
      monthProgress: revMonth.progress,
    },
    ads: {
      spend: spend === null ? null : round2(spend),
      spendMine: spendMine === null ? null : round2(spendMine),
      costPerLead: spendMine !== null && mine.length > 0 ? round2(spendMine / mine.length) : null,
      spendMonth: round2(spendMonthAgg._sum.spend || 0),
      syncedAt,
    },
    activity: { statusChanges, whatsappOut: waOut, whatsappIn: waIn },
    calls: null,
  };
}
