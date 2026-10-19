import { db } from "@/lib/db";
import BackLink from "@/components/BackLink";
import AdPerformanceScreen from "@/components/AdPerformanceScreen";
import { combine, totalsOf, type SpendRow, type LeadRow } from "@/lib/campaign-performance";
import { resolveRange } from "@/lib/periods";
import { getSubStatuses } from "@/lib/substatus";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  האם הקמפיין משתלם
 * ============================================================
 *
 *  מחבר שלושה דברים שעד היום ישבו בנפרד: כמה שילמת לפייסבוק,
 *  כמה לידים נכנסו, וכמה מהם החזירו כסף.
 *
 *  ההכנסה מחושבת לכל הגעה לפי הערוץ שלה: ליד של מכירה שווה
 *  את המחיר שהקונה משלם, וליד שלך שווה את העמלה - אבל רק אם
 *  הוא נסגר.
 */

export default async function AdPerformancePage() {
  const range = resolveRange("this_month");

  const [spendRows, entries, statuses, subStatuses] = await Promise.all([
    db.adSpend
      .findMany({ where: { date: { gte: range.from, lt: range.to } } })
      .catch(() => []),
    db.leadEntry
      .findMany({
        where: { at: { gte: range.from, lt: range.to } },
        select: {
          campaign: true,
          isSale: true,
          price: true,
          billable: true,
          lead: { select: { status: true, subStatus: true } },
        },
      })
      .catch(() => []),
    getStatuses().catch(() => []),
    getSubStatuses().catch(() => []),
  ]);

  /**
   * סגירה ועמלה נלקחות **מאותן הגדרות** שמסך ההכנסות
   * משתמש בהן: סטטוס שסומן "נסגר בהצלחה" והעמלה שעליו.
   *
   * חשוב שזה יהיה אותו מקור: שני מסכים שמחשבים עמלה
   * בדרכים שונות יראו לך שני רווחים שונים על אותו חודש.
   */
  const closingStatuses = new Set(
    statuses.filter((s) => s.won).map((s) => s.name)
  );

  const commissionByStatus = new Map(
    statuses.map((s) => [s.name, Number(s.commission ?? 0)])
  );

  const commissionBySub = new Map(
    subStatuses.map((s) => [
      s.name,
      Number((s as unknown as { commission?: number }).commission ?? 0),
    ])
  );

  const leads: LeadRow[] = entries.map((entry) => {
    if (entry.isSale) {
      /**
       * ליד שנמכר מחזיר כסף בעצם ההגעה, בלי קשר לסגירה -
       * ולכן הוא נחשב "סגור" לצורך החישוב, אלא אם סומן
       * כלא לחיוב.
       */
      const paid = entry.billable ? Number(entry.price ?? 0) : 0;
      return { campaign: entry.campaign, closed: paid > 0, revenue: paid };
    }

    const closed = closingStatuses.has(entry.lead.status);

    /**
     * עמלת תת-הסטטוס גוברת, ואם אין לה ערך נופלים לעמלת
     * הסטטוס - בדיוק כמו בחישוב ההכנסות.
     */
    const subValue = entry.lead.subStatus
      ? commissionBySub.get(entry.lead.subStatus) ?? 0
      : 0;

    const commission =
      subValue > 0
        ? subValue
        : commissionByStatus.get(entry.lead.status) ?? 0;

    return {
      campaign: entry.campaign,
      closed,
      revenue: closed ? commission : 0,
    };
  });

  const spend: SpendRow[] = spendRows.map((row) => ({
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    spend: Number(row.spend ?? 0),
    impressions: row.impressions,
    clicks: row.clicks,
    fbLeads: row.fbLeads,
  }));

  const rows = combine(spend, leads);
  const totals = totalsOf(rows);

  const lastSync = spendRows.reduce<Date | null>(
    (latest, row) =>
      !latest || row.syncedAt > latest ? row.syncedAt : latest,
    null
  );

  return (
    <div className="app">
      <div className="topbar">
        <BackLink fallback="/more" label="חזרה" />
        <h1>
          ביצועי קמפיינים
          <span className="count">החודש</span>
        </h1>
      </div>

      <AdPerformanceScreen
        rows={rows}
        totals={totals}
        hasSpend={spendRows.length > 0}
        lastSync={lastSync ? lastSync.toISOString() : null}
      />
    </div>
  );
}
