import { getReport } from "@/lib/reports";
import { resolveRange, type PeriodKey } from "@/lib/periods";
import ReportScreen from "@/components/ReportScreen";

export const dynamic = "force-dynamic";

const VALID: PeriodKey[] = [
  "this_month",
  "last_month",
  "last_3",
  "this_year",
  "last_year",
  "all",
  "custom",
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string };
}) {
  const period = VALID.includes(searchParams?.period as PeriodKey)
    ? (searchParams!.period as PeriodKey)
    : "this_month";

  const range = resolveRange(period, searchParams?.from, searchParams?.to);
  const report = await getReport(range);

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          דוחות
          <span className="count">{report.label}</span>
        </h1>
      </div>

      <ReportScreen
        report={report}
        period={period}
        from={searchParams?.from ?? isoDate(monthAgo)}
        to={searchParams?.to ?? isoDate(now)}
      />
    </div>
  );
}
