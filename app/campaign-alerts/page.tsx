import { db } from "@/lib/db";
import {
  getCampaignPerformance,
  closeStatusNames,
} from "@/lib/campaign-monitor";
import { getStatuses } from "@/lib/status-store";
import CampaignAlertsScreen from "@/components/CampaignAlertsScreen";

export const dynamic = "force-dynamic";

export default async function CampaignAlertsPage() {
  const [perf, statuses, closes, rules] = await Promise.all([
    getCampaignPerformance(),
    getStatuses(),
    closeStatusNames(),
    db.campaignRule.findMany().catch(() => []),
  ]);

  const fallback = rules.find((r) => r.campaignName === null);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          יעדי קמפיינים
          <span className="count">{perf.length} קמפיינים</span>
        </h1>
      </div>

      <CampaignAlertsScreen
        campaigns={perf.map((c) => ({
          ...c,
          lastCheckedAt: c.lastCheckedAt ? c.lastCheckedAt.toISOString() : null,
          firstLeadAt: c.firstLeadAt ? c.firstLeadAt.toISOString() : null,
        }))}
        statuses={statuses}
        closeStatuses={closes}
        defaultTarget={fallback?.targetPercent ?? 15}
        defaultGrace={fallback?.graceDays ?? 7}
        defaultRecheck={fallback?.recheckDays ?? 7}
        rules={rules.map((r) => ({ id: r.id, campaignName: r.campaignName }))}
      />
    </div>
  );
}
