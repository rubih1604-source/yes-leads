/**
 * ============================================================
 *  מכירת לידים
 * ============================================================
 *
 *  ההכנסה נספרת לפי **כניסות**, לא לפי לידים.
 *
 *  אותו אדם יכול להיכנס מקמפיין של אלעד וגם מקמפיין שלך.
 *  שתי הכניסות אמיתיות, ומגיע לך תשלום על זו שנמכרה -
 *  גם אם הליד עצמו נשאר ברשימת העבודה שלך.
 */

import { db } from "./db";
import { normalizeName } from "./sales-campaigns";
import { israelParts, fromIsrael } from "./working-hours";

export type CampaignStat = {
  id: string;
  name: string;
  buyerId: string | null;
  buyerName: string | null;
  pricePerLead: number;
  active: boolean;
  leadsMonth: number;
  leadsTotal: number;
  existingMonth: number;
  existingPercent: number;
  revenueMonth: number;
  excludedMonth: number;
};

export type BuyerStat = {
  id: string;
  name: string;
  campaigns: number;
  leadsMonth: number;
  revenueMonth: number;
};

export type SaleEntryRow = {
  id: string;
  leadId: string;
  name: string;
  phone: string;
  campaign: string | null;
  price: number;
  at: string;
  existingCustomer: boolean;
  billable: boolean;
};

export type LeadSalesSummary = {
  campaigns: CampaignStat[];
  buyers: BuyerStat[];
  entries: SaleEntryRow[];
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

const YES_ANSWER = /(^|[\s,\/\\|-])(yes|סטינג|sting|יס)([\s,\/\\|-]|$)/i;

/**
 * האם הליד כבר לקוח של yes.
 *
 * שלושה מקורות, כי הדאטה הגיע משלושה מקומות:
 *  1. שאלת הספק מהטופס בפייסבוק
 *  2. עמודה בקובץ CSV - השם שלה יכול להיות בעברית
 *  3. הסטטוס שאתה עצמך קבעת
 *
 * מספיק שאחד מהם אומר כן.
 */
function isExistingCustomer(extra: unknown, status?: string | null): boolean {
  if (status && status.includes("לקוח קיים")) return true;

  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;

  const record = extra as Record<string, string>;

  const direct = record.supplier_question;
  if (direct && YES_ANSWER.test(direct)) return true;

  // עמודות מקובץ - שם העמודה יכול להיות "ספק", "ספק נוכחי" וכו'
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (!/ספק|supplier|provider|חברה נוכחית/i.test(key)) continue;
    if (YES_ANSWER.test(value)) return true;
  }

  return false;
}

export type SalesPeriod = "month" | "all";

export async function getLeadSales(
  period: SalesPeriod = "month"
): Promise<LeadSalesSummary> {
  const now = new Date();
  // "הכל" סופר מתחילת הזמן, כדי לכלול גם מה שיובא מקובץ
  const from = period === "all" ? new Date(0) : startOfMonth(now);

  const [registered, buyers, saleEntries, normalLeads] = await Promise.all([
    db.salesCampaign.findMany({ orderBy: { createdAt: "desc" } }),
    db.leadBuyer.findMany({ orderBy: { name: "asc" } }),
    db.leadEntry.findMany({
      where: { isSale: true },
      orderBy: { at: "desc" },
      take: 2000,
      include: {
        lead: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            status: true,
            extra: true,
          },
        },
      },
    }),
    db.lead.findMany({
      where: { origin: "leadmanager" },
      select: { extra: true },
      take: 3000,
    }),
  ]);

  const buyerById = new Map(buyers.map((b) => [b.id, b]));

  // ---- צבירה לפי קמפיין ----
  const byCampaign = new Map<
    string,
    {
      month: number;
      billableMonth: number;
      total: number;
      existingMonth: number;
      excludedMonth: number;
    }
  >();

  const entries: SaleEntryRow[] = [];

  for (const entry of saleEntries) {
    const key = entry.campaign ? normalizeName(entry.campaign) : "";
    const row = byCampaign.get(key) ?? {
      month: 0,
      billableMonth: 0,
      total: 0,
      existingMonth: 0,
      excludedMonth: 0,
    };

    const existing = isExistingCustomer(
      entry.lead?.extra,
      entry.lead?.status
    );
    const billable = entry.billable !== false;

    row.total++;
    if (entry.at >= from) {
      row.month++;
      if (billable) row.billableMonth++;
      else row.excludedMonth++;
      if (existing) row.existingMonth++;
    }
    byCampaign.set(key, row);

    if (entries.length < 300 && entry.lead) {
      entries.push({
        id: entry.id,
        leadId: entry.lead.id,
        name:
          `${entry.lead.firstName ?? ""} ${entry.lead.lastName ?? ""}`.trim() ||
          entry.lead.phone,
        phone: entry.lead.phone,
        campaign: entry.campaign,
        price: Number(entry.price ?? 0),
        at: entry.at.toISOString(),
        existingCustomer: existing,
        billable,
      });
    }
  }

  const campaigns: CampaignStat[] = registered.map((c) => {
    const row = byCampaign.get(normalizeName(c.name)) ?? {
      month: 0,
      billableMonth: 0,
      total: 0,
      existingMonth: 0,
      excludedMonth: 0,
    };
    const price = Number(c.pricePerLead ?? 0);
    const buyer = c.buyerId ? buyerById.get(c.buyerId) : null;

    return {
      id: c.id,
      name: c.name,
      buyerId: c.buyerId ?? null,
      buyerName: buyer?.name ?? c.buyer ?? null,
      pricePerLead: price,
      active: c.active,
      leadsMonth: row.month,
      leadsTotal: row.total,
      existingMonth: row.existingMonth,
      existingPercent:
        row.month > 0
          ? Math.round((row.existingMonth / row.month) * 1000) / 10
          : 0,
      revenueMonth: Math.round(row.billableMonth * price),
      excludedMonth: row.excludedMonth,
    };
  });

  // ---- צבירה לפי לקוח ----
  const buyerStats: BuyerStat[] = buyers.map((b) => {
    const mine = campaigns.filter((c) => c.buyerId === b.id);
    return {
      id: b.id,
      name: b.name,
      campaigns: mine.length,
      leadsMonth: mine.reduce((s, c) => s + c.leadsMonth, 0),
      revenueMonth: mine.reduce((s, c) => s + c.revenueMonth, 0),
    };
  });

  // ---- קמפיינים שעוד לא נרשמו ----
  const registeredKeys = new Set(registered.map((c) => normalizeName(c.name)));
  const unregisteredCounts = new Map<string, number>();

  for (const lead of normalLeads) {
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
    buyers: buyerStats,
    entries,
    totalMonth: campaigns.reduce((s, c) => s + c.leadsMonth, 0),
    revenueMonth: campaigns.reduce((s, c) => s + c.revenueMonth, 0),
    unregistered,
    monthLabel:
      period === "all"
        ? "כל הזמן"
        : now.toLocaleDateString("he-IL", {
            timeZone: "Asia/Jerusalem",
            month: "long",
            year: "numeric",
          }),
  };
}
