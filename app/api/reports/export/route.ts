import { isLoggedIn } from "@/lib/auth";
import { resolveRange, type PeriodKey } from "@/lib/periods";
import { getReport, reportToCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** מוריד את הדוח כקובץ CSV */
export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const period = (url.searchParams.get("period") ?? "this_month") as PeriodKey;
  const range = resolveRange(
    period,
    url.searchParams.get("from"),
    url.searchParams.get("to")
  );

  const report = await getReport(range);
  const csv = reportToCsv(report);

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-report-${stamp}.csv"`,
    },
  });
}
