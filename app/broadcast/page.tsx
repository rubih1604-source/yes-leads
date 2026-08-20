import { db } from "@/lib/db";
import BroadcastScreen, { type ListRow } from "@/components/BroadcastScreen";

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const [lists, templates] = await Promise.all([
    db.broadcastList.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { contacts: true } },
        sends: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.template.findMany({
      where: { approved: true },
      orderBy: { name: "asc" },
      select: { name: true, displayName: true },
    }),
  ]);

  const rows: ListRow[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    contacts: l._count.contacts,
    createdAt: l.createdAt.toISOString(),
    lastSend: l.sends[0]
      ? {
          templateName: l.sends[0].templateName,
          sent: l.sends[0].sent,
          failed: l.sends[0].failed,
          total: l.sends[0].total,
          state: l.sends[0].state,
        }
      : null,
  }));

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          דאטה לדיוור
          <span className="count">{rows.length} רשימות</span>
        </h1>
      </div>

      <BroadcastScreen lists={rows} templates={templates} />
    </div>
  );
}
