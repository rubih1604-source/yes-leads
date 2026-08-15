import { getLeadSales } from "@/lib/lead-sales";
import LeadSalesScreen from "@/components/LeadSalesScreen";

export const dynamic = "force-dynamic";

export default async function LeadSalesPage() {
  const data = await getLeadSales();

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          מכירת לידים
          <span className="count">{data.campaigns.length} קמפיינים</span>
        </h1>
      </div>

      <LeadSalesScreen
        campaigns={data.campaigns}
        totalMonth={data.totalMonth}
        revenueMonth={data.revenueMonth}
        unregistered={data.unregistered}
        monthLabel={data.monthLabel}
      />
    </div>
  );
}
