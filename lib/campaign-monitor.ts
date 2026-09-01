/**
 * ============================================================
 *  מעקב ביצועים לקמפיינים
 * ============================================================
 *
 *  הרעיון: קמפיין שלא סוגר לא צריך לחכות שתשים לב אליו.
 *
 *  אתה קובע יעד אחוז סגירה ומספר ימי חסד. מרגע שהקמפיין
 *  התחיל להביא לידים ועד סוף ימי החסד, המערכת נותנת לו
 *  לרוץ. בסוף התקופה היא בודקת:
 *
 *   - מתחת ליעד -> התראה, כדי שתבדוק את הנתונים
 *   - עומד ביעד -> ממשיכה לבדוק כל כמה ימים שהגדרת
 *
 *  אחוז הסגירה מחושב לפי הסטטוסים שאתה בוחר, לא לפי
 *  הגדרה קבועה. 2 סגירות מתוך 10 לידים = 20%.
 */

import { db } from "./db";
import { getStatuses } from "./status-store";
import { getSettings } from "./settings";

export type CampaignPerf = {
  name: string;
  leads: number;
  closes: number;
  percent: number;
  target: number;
  graceDays: number;
  recheckDays: number;
  ageDays: number;
  inGrace: boolean;
  passed: boolean;
  hasOwnRule: boolean;
  lastCheckedAt: Date | null;
  firstLeadAt: Date | null;
};

function campaignOf(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const e = extra as Record<string, string>;
  return e.fb_campaign || e.campaign || null;
}

function days(from: Date, to = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/** הסטטוסים שנחשבים סגירה - מה שבחרת, ואם לא בחרת אז סטטוסי הסגירה */
export async function closeStatusNames(): Promise<string[]> {
  const [settings, statuses] = await Promise.all([
    getSettings(),
    getStatuses(),
  ]);

  if (settings.closeStatuses.length > 0) return settings.closeStatuses;
  return statuses.filter((s) => s.won).map((s) => s.name);
}

export async function getCampaignPerformance(): Promise<CampaignPerf[]> {
  const [closeNames, rules, checks] = await Promise.all([
    closeStatusNames(),
    db.campaignRule.findMany().catch(() => []),
    db.campaignCheck
      .findMany({ orderBy: { checkedAt: "desc" } })
      .catch(() => []),
  ]);

  const defaultRule = rules.find((r) => r.campaignName === null);
  const ruleByName = new Map(
    rules.filter((r) => r.campaignName).map((r) => [r.campaignName!, r])
  );

  const lastCheck = new Map<string, Date>();
  for (const c of checks) {
    if (!lastCheck.has(c.campaignName)) lastCheck.set(c.campaignName, c.checkedAt);
  }

  const leads = await db.lead.findMany({
    where: { origin: "leadmanager" },
    select: { status: true, extra: true, intakeAt: true },
    take: 5000,
  });

  const byCampaign = new Map<
    string,
    { leads: number; closes: number; first: Date }
  >();

  for (const lead of leads) {
    const name = campaignOf(lead.extra);
    if (!name) continue;

    const row = byCampaign.get(name) ?? {
      leads: 0,
      closes: 0,
      first: lead.intakeAt,
    };

    row.leads++;
    if (closeNames.includes(lead.status)) row.closes++;
    if (lead.intakeAt < row.first) row.first = lead.intakeAt;

    byCampaign.set(name, row);
  }

  const out: CampaignPerf[] = [];

  for (const [name, row] of byCampaign) {
    const own = ruleByName.get(name);
    const rule = own ?? defaultRule;

    const target = rule?.targetPercent ?? 15;
    const graceDays = rule?.graceDays ?? 7;
    const recheckDays = rule?.recheckDays ?? 7;

    const percent =
      row.leads > 0 ? Math.round((row.closes / row.leads) * 1000) / 10 : 0;

    const age = days(row.first);

    out.push({
      name,
      leads: row.leads,
      closes: row.closes,
      percent,
      target,
      graceDays,
      recheckDays,
      ageDays: age,
      inGrace: age < graceDays,
      passed: percent >= target,
      hasOwnRule: Boolean(own),
      lastCheckedAt: lastCheck.get(name) ?? null,
      firstLeadAt: row.first,
    });
  }

  return out.sort((a, b) => a.percent - b.percent);
}

/**
 * מריץ את הבדיקה ומתריע על מי שלא עומד.
 * מחזיר את הקמפיינים שנבדקו בפועל.
 */
export async function runCampaignChecks(): Promise<CampaignPerf[]> {
  const all = await getCampaignPerformance();
  const now = new Date();
  const checked: CampaignPerf[] = [];

  for (const c of all) {
    // עדיין בימי החסד - נותנים לו לרוץ
    if (c.inGrace) continue;

    // כמה לידים צריך כדי שהאחוז יגיד משהו
    if (c.leads < 5) continue;

    if (c.lastCheckedAt) {
      const since = days(c.lastCheckedAt, now);
      if (since < c.recheckDays) continue;
    }

    await db.campaignCheck
      .create({
        data: {
          campaignName: c.name,
          leads: c.leads,
          closes: c.closes,
          percent: c.percent,
          target: c.target,
          passed: c.passed,
        },
      })
      .catch(() => null);

    checked.push(c);
  }

  return checked;
}
