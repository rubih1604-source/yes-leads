import { getInsights } from "@/lib/insights";
import { resolveRange, type PeriodKey } from "@/lib/periods";
import InsightsScreen from "@/components/InsightsScreen";

export const dynamic = "force-dynamic";

const VALID: PeriodKey[] = [
  "this_month",
  "last_month",
  "last_3",
  "this_year",
  "all",
];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const period = VALID.includes(searchParams?.period as PeriodKey)
    ? (searchParams!.period as PeriodKey)
    : "last_3";

  const data = await getInsights(resolveRange(period));

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          תובנות
          <span className="count">{data.label}</span>
        </h1>
      </div>

      <InsightsScreen data={data} period={period} />
    </div>
  );
}
