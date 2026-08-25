import { getExpenses } from "@/lib/expenses";
import { resolveRange, type PeriodKey } from "@/lib/periods";
import ExpensesScreen from "@/components/ExpensesScreen";

export const dynamic = "force-dynamic";

const VALID: PeriodKey[] = [
  "this_month",
  "last_month",
  "last_3",
  "this_year",
  "all",
];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const period = VALID.includes(searchParams?.period as PeriodKey)
    ? (searchParams!.period as PeriodKey)
    : "this_month";

  const range = resolveRange(period);
  const data = await getExpenses(range);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          הוצאות ורווח
          <span className="count">{data.label}</span>
        </h1>
      </div>

      <ExpensesScreen
        rows={data.rows}
        categories={data.categories}
        moneyPicture={data.money}
        label={data.label}
        period={period}
      />
    </div>
  );
}
