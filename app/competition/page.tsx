import { getCompetition } from "@/lib/competition";
import { resolveRange, type PeriodKey } from "@/lib/periods";
import { getStatuses } from "@/lib/status-store";
import { getSettings } from "@/lib/settings";
import CompetitionScreen from "@/components/CompetitionScreen";

export const dynamic = "force-dynamic";

const VALID: PeriodKey[] = [
  "this_month",
  "last_month",
  "last_3",
  "this_year",
  "all",
];

export default async function CompetitionPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const period = VALID.includes(searchParams?.period as PeriodKey)
    ? (searchParams!.period as PeriodKey)
    : "last_3";

  const range = resolveRange(period);

  const [data, statuses, settings] = await Promise.all([
    getCompetition(range),
    getStatuses(),
    getSettings(),
  ]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          איפה אני מאבד
          <span className="count">{range.label}</span>
        </h1>
      </div>

      <CompetitionScreen
        data={data}
        period={period}
        statuses={statuses.map((s) => s.name)}
        selected={settings.lostStatuses}
      />
    </div>
  );
}
