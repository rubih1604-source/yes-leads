import { db } from "@/lib/db";
import LeadList, { type LeadRow } from "@/components/LeadList";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const leads = await db.lead.findMany({
    orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }, { intakeAt: "desc" }],
    take: 500,
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      intakeAt: true,
      lastInboundAt: true,
    },
  });

  const openTasks = await db.task.count({ where: { done: false } });

  const rows: LeadRow[] = leads.map((l) => ({
    ...l,
    intakeAt: l.intakeAt.toISOString(),
    lastInboundAt: l.lastInboundAt ? l.lastInboundAt.toISOString() : null,
  }));

  return (
    <div className="app">
      <AutoRefresh seconds={15} />
      <LeadList leads={rows} openTasks={openTasks} />
    </div>
  );
}
