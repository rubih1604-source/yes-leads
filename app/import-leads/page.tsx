import { db } from "@/lib/db";
import ImportLeadsScreen from "@/components/ImportLeadsScreen";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function ImportLeadsPage() {
  const [statuses, saleCampaigns] = await Promise.all([
    getStatuses(),
    db.salesCampaign
      .findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, pricePerLead: true },
      })
      .catch(() => []),
  ]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>ייבוא לידים</h1>
      </div>
      <ImportLeadsScreen statuses={statuses} saleCampaigns={saleCampaigns} />
    </div>
  );
}
