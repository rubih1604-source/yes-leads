import { db } from "@/lib/db";
import LeadList, { type LeadRow } from "@/components/LeadList";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const leads = await db.lead.findMany({
    orderBy: { intakeAt: "desc" },
    take: 500,
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      intakeAt: true,
    },
  });

  const rows: LeadRow[] = leads.map((l) => ({
    ...l,
    intakeAt: l.intakeAt.toISOString(),
  }));

  return (
    <div className="app">
      <AutoRefresh seconds={15} />
      <LeadList leads={rows} />
    </div>
  );
}
