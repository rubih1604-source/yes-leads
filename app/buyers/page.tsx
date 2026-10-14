import { db } from "@/lib/db";
import BuyersScreen from "@/components/BuyersScreen";

export const dynamic = "force-dynamic";

export default async function BuyersPage() {
  const [buyers, deliveries] = await Promise.all([
    db.leadBuyer.findMany({
      orderBy: { name: "asc" },
      include: {
        campaigns: { select: { name: true, active: true } },
        _count: { select: { deliveries: true } },
      },
    }),
    db.leadDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        buyer: { select: { name: true } },
        lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    }),
  ]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          קונים ושליחות
          <span className="count">{buyers.length} קונים</span>
        </h1>
      </div>

      <BuyersScreen
        buyers={buyers.map((b) => ({
          id: b.id,
          name: b.name,
          webhookUrl: b.webhookUrl ?? "",
          webhookSecret: b.webhookSecret ?? "",
          webhookFormat: b.webhookFormat,
          sendEnabled: b.sendEnabled,
          fieldMap:
            b.fieldMap && typeof b.fieldMap === "object"
              ? (b.fieldMap as Record<string, string>)
              : {},
          campaigns: b.campaigns.filter((c) => c.active).map((c) => c.name),
          totalSent: b._count.deliveries,
        }))}
        deliveries={deliveries.map((d) => ({
          id: d.id,
          buyer: d.buyer.name,
          leadId: d.lead.id,
          name:
            `${d.lead.firstName ?? ""} ${d.lead.lastName ?? ""}`.trim() ||
            d.lead.phone,
          phone: d.lead.phone,
          state: d.state,
          attempts: d.attempts,
          httpStatus: d.httpStatus,
          error: d.error,
          at: d.createdAt.toISOString(),
          sentAt: d.sentAt ? d.sentAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
