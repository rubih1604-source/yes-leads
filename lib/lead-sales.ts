/**
 * ============================================================
 *  מכירת לידים - ספירה וכסף
 * ============================================================
 *
 *  לכל קמפיין מכירה: כמה לידים נכנסו, כמה מתוכם לקוחות
 *  קיימים (כלומר פחות שווים לקונה), וכמה כסף זה שווה.
 *
 *  הכל מחושב בזמן אמת מהלידים עצמם.
 */

import { db } from "./db";
import { normalizeName, SALE_ORIGIN } from "./sales-campaigns";
import { israelParts, fromIsrael } from "./working-hours";

export type CampaignStat = {
  id: string;
  name: string;
  buyer: string | null;
  pricePerLead: number;
  active: boolean;
  leadsMonth: number;
  leadsTotal: number;
  existingMonth: number;
  existingPercent: number;
  revenueMonth: number;
};

export type LeadSalesSummary = {
  campaigns: CampaignStat[];
  totalMonth: number;
  revenueMonth: number;
  unregistered: Array<{ name: string; count: number }>;
  monthLabel: string;
};

function startOfMonth(now = new Date()): Date {
  const p = israelParts(now);
  return fromIsrael(p.year, p.month, 1, 0);
}

function campaignOf(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const e = extra as Record<string, string>;
  return e.fb_campaign || e.campaign || null;
}

function isExistingCustomer(extra: unknown): boolean {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;
  const answer = (extra as Record<string, string>).supplier_question;
  if (!answer) return false;
  return /(^|[\s,\/\\|-])(yes|סטינג|sting|יס)([\s,\/\\|-]|$)/i.test(answer);
}

export async function getLeadSales(): Promise<LeadSalesSummary> {
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [registered, saleLeads, otherLeads] = await Promise.all([
    db.salesCampaign.findMany({ orderBy: { createdAt: "desc" } }),
    db.lead.findMany({
      where: { origin: SALE_ORIGIN },
      select: { id: true, extra: true, intakeAt: true },
    }),
    // קמפיינים שעוד לא נרשמו - כדי שתוכל לסמן אותם
    db.lead.findMany({
      where: { origin: "leadmanager" },
      select: { extra: true },
      take: 3000,
    }),
  ]);

  const byCampaign = new Map<
    string,
    { month: number; total: number; existingMonth: number }
  >();

  for (const lead of saleLeads) {
    const name = campaignOf(lead.extra);
    if (!name) continue;

    const key = normalizeName(name);
    const row = byCampaign.get(key) ?? { month: 0, total: 0, existingMonth: 0 };

    row.total++;
    if (lead.intakeAt >= monthStart) {
      row.month++;
      if (isExistingCustomer(lead.extra)) row.existingMonth++;
    }

    byCampaign.set(key, row);
  }

  const campaigns: CampaignStat[] = registered.map((c) => {
    const row = byCampaign.get(normalizeName(c.name)) ?? {
      month: 0,
      total: 0,
      existingMonth: 0,
    };
    const price = Number(c.pricePerLead ?? 0);

    return {
      id: c.id,
      name: c.name,
      buyer: c.buyer,
      pricePerLead: price,
      active: c.active,
      leadsMonth: row.month,
      leadsTotal: row.total,
      existingMonth: row.existingMonth,
      existingPercent:
        row.month > 0 ? Math.round((row.existingMonth / row.month) * 1000) / 10 : 0,
      revenueMonth: Math.round(row.month * price),
    };
  });

  // קמפיינים שיש בהם לידים אבל לא סומנו כמכירה
  const registeredKeys = new Set(registered.map((c) => normalizeName(c.name)));
  const unregisteredCounts = new Map<string, number>();

  for (const lead of otherLeads) {
    const name = campaignOf(lead.extra);
    if (!name) continue;
    if (registeredKeys.has(normalizeName(name))) continue;
    unregisteredCounts.set(name, (unregisteredCounts.get(name) ?? 0) + 1);
  }

  const unregistered = Array.from(unregisteredCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  return {
    campaigns,
    totalMonth: campaigns.reduce((sum, c) => sum + c.leadsMonth, 0),
    revenueMonth: campaigns.reduce((sum, c) => sum + c.revenueMonth, 0),
    unregistered,
    monthLabel: now.toLocaleDateString("he-IL", {
      timeZone: "Asia/Jerusalem",
      month: "long",
      year: "numeric",
    }),
  };
}
