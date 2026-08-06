/**
 * ============================================================
 *  ציר ההכנסות
 * ============================================================
 *
 *  לכל סטטוס סגירה, ולכל תת-סטטוס שלו, אפשר להגדיר עמלה.
 *  תת-סטטוס גובר על הסטטוס - ככה "נסגר דאבל יס" עם 3 ממירים
 *  יכול להיות שווה יותר מאותו סטטוס עם ממיר אחד.
 *
 *  הציר נבנה מהלידים עצמם, בזמן אמת. אין טבלה נפרדת שצריך
 *  לתחזק, ולכן אין מצב שהמספרים יסתרו את הרשימה.
 */

import { db } from "./db";
import { getStatuses } from "./status-store";
import { getSubStatuses } from "./substatus";
import { getSettings } from "./settings";
import { startOfIsraelDay, israelParts, fromIsrael } from "./working-hours";

export type RevenueBreakdown = {
  label: string;
  count: number;
  perDeal: number;
  total: number;
};

export type RevenueSummary = {
  earned: number;
  target: number;
  progress: number;
  deals: number;
  breakdown: RevenueBreakdown[];
  periodLabel: string;
};

/** מתחילת החודש הנוכחי בשעון ישראל */
function startOfMonth(now = new Date()): Date {
  const p = israelParts(now);
  return fromIsrael(p.year, p.month, 1, 0);
}

export async function getRevenue(
  period: "today" | "month" = "month"
): Promise<RevenueSummary> {
  const now = new Date();
  const from = period === "today" ? startOfIsraelDay(now) : startOfMonth(now);

  const [statuses, subs, settings] = await Promise.all([
    getStatuses(),
    getSubStatuses(),
    getSettings(),
  ]);

  const wonNames = statuses.filter((s) => s.won).map((s) => s.name);

  if (wonNames.length === 0) {
    return {
      earned: 0,
      target: settings.revenueTarget,
      progress: 0,
      deals: 0,
      breakdown: [],
      periodLabel: period === "today" ? "היום" : "החודש",
    };
  }

  /**
   * סופרים לפי רגע הסגירה, לא לפי הסטטוס הנוכחי -
   * ככה עסקה שנסגרה בחודש שעבר לא נספרת שוב החודש.
   */
  const closings = await db.leadEvent.findMany({
    where: {
      type: "status_changed",
      toStatus: { in: wonNames },
      createdAt: { gte: from },
    },
    select: { leadId: true, toStatus: true },
  });

  const leadIds = Array.from(new Set(closings.map((c) => c.leadId)));

  const leads = leadIds.length
    ? await db.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, status: true, subStatus: true },
      })
    : [];

  const commissionByStatus = new Map(
    statuses.map((s) => [s.name, s.commission ?? 0])
  );
  const commissionBySub = new Map(
    subs.map((s) => [s.name, s.commission ?? 0])
  );

  const buckets = new Map<string, { count: number; perDeal: number }>();
  let earned = 0;
  let deals = 0;

  for (const lead of leads) {
    // נספר רק אם הוא עדיין בסטטוס סגירה
    if (!wonNames.includes(lead.status)) continue;

    const subValue = lead.subStatus
      ? commissionBySub.get(lead.subStatus) ?? 0
      : 0;
    const perDeal =
      subValue > 0 ? subValue : commissionByStatus.get(lead.status) ?? 0;

    const label = lead.subStatus
      ? `${lead.status} · ${lead.subStatus}`
      : lead.status;

    const row = buckets.get(label) ?? { count: 0, perDeal };
    row.count++;
    row.perDeal = perDeal;
    buckets.set(label, row);

    earned += perDeal;
    deals++;
  }

  const breakdown: RevenueBreakdown[] = Array.from(buckets.entries())
    .map(([label, row]) => ({
      label,
      count: row.count,
      perDeal: row.perDeal,
      total: row.count * row.perDeal,
    }))
    .sort((a, b) => b.total - a.total);

  const target = settings.revenueTarget;

  return {
    earned: Math.round(earned),
    target,
    progress: target > 0 ? Math.min(100, Math.round((earned / target) * 100)) : 0,
    deals,
    breakdown,
    periodLabel: period === "today" ? "היום" : "החודש",
  };
}
