import { db } from "@/lib/db";
import LeadList, { type LeadRow } from "@/components/LeadList";
import AutoRefresh from "@/components/AutoRefresh";
import { getStatuses } from "@/lib/status-store";
import { getSubStatusMap } from "@/lib/substatus";
import { getRevenue } from "@/lib/revenue";
import RevenueBar from "@/components/RevenueBar";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [statuses, subStatuses, revenue, templates] = await Promise.all([
    getStatuses(),
    getSubStatusMap(),
    getRevenue("month"),
    db.template.findMany({
      where: { approved: true },
      orderBy: { name: "asc" },
      select: { name: true, displayName: true },
    }),
  ]);

  const leads = await db.lead.findMany({
    // סדר קבוע: הליד האחרון שנכנס תמיד למעלה.
    // ההתכתבויות יושבות במסך נפרד ולא משנות את הסדר כאן.
    // רק לידים אמיתיים. מי שכתב בוואטסאפ בלי להיות ליד
    // יושב במסך השיחות בלבד.
    where: { origin: "leadmanager" },
    orderBy: { intakeAt: "desc" },
    take: 500,
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      subStatus: true,
      duplicateOf: true,
      intakeAt: true,
      extra: true,
    },
  });

  const rows: LeadRow[] = leads.map((l) => {
    const extra =
      l.extra && typeof l.extra === "object" && !Array.isArray(l.extra)
        ? (l.extra as Record<string, string>)
        : {};

    return {
      id: l.id,
      phone: l.phone,
      firstName: l.firstName,
      lastName: l.lastName,
      status: l.status,
      subStatus: l.subStatus,
      duplicateOf: l.duplicateOf,
      intakeAt: l.intakeAt.toISOString(),
      campaign: extra.fb_campaign || extra.campaign || null,
      supplier: extra.supplier_question || null,
    };
  });

  return (
    <div className="app">
      <AutoRefresh seconds={15} />
      <RevenueBar data={revenue} />
      <LeadList
        leads={rows}
        statuses={statuses}
        subStatuses={subStatuses}
        templates={templates}
      />
    </div>
  );
}
