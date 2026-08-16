import { db } from "@/lib/db";
import { getLeadSales } from "@/lib/lead-sales";
import LeadSalesScreen from "@/components/LeadSalesScreen";

export const dynamic = "force-dynamic";

export default async function LeadSalesPage() {
  const data = await getLeadSales();

  // כמה לידים ותיקים עדיין בלי כניסה רשומה
  const [leadCount, withEntries] = await Promise.all([
    db.lead.count().catch(() => 0),
    db.leadEntry
      .findMany({ select: { leadId: true }, distinct: ["leadId"] })
      .catch(() => []),
  ]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          מכירת לידים
          <span className="count">{data.monthLabel}</span>
        </h1>
      </div>

      <LeadSalesScreen
        campaigns={data.campaigns}
        buyers={data.buyers}
        entries={data.entries}
        totalMonth={data.totalMonth}
        revenueMonth={data.revenueMonth}
        unregistered={data.unregistered}
        monthLabel={data.monthLabel}
        missingEntries={Math.max(0, leadCount - withEntries.length)}
      />
    </div>
  );
}
