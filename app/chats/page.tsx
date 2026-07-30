import { db } from "@/lib/db";
import ChatsScreen, { type ChatRow } from "@/components/ChatsScreen";
import AutoRefresh from "@/components/AutoRefresh";
import { displayPhone } from "@/lib/phone";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  /**
   * תיבת ההתכתבויות: מסודרת לפי ההודעה האחרונה, כמו וואטסאפ.
   * לוקחים את ההודעות האחרונות ומקבצים לפי ליד.
   */
  const statuses = await getStatuses();

  const recent = await db.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 600,
    select: {
      leadId: true,
      bodyText: true,
      direction: true,
      createdAt: true,
      lead: {
        select: {
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  });

  const seen = new Set<string>();
  const chats: ChatRow[] = [];

  for (const m of recent) {
    if (!m.lead || seen.has(m.leadId)) continue;
    seen.add(m.leadId);

    const name =
      `${m.lead.firstName ?? ""} ${m.lead.lastName ?? ""}`.trim() ||
      displayPhone(m.lead.phone);

    chats.push({
      leadId: m.lead.id,
      name,
      phone: m.lead.phone,
      status: m.lead.status,
      lastText: m.bodyText,
      lastAt: m.createdAt.toISOString(),
      lastDirection: m.direction === "in" ? "in" : "out",
    });

    if (chats.length >= 150) break;
  }

  return (
    <div className="app">
      <AutoRefresh seconds={15} />
      <ChatsScreen chats={chats} statuses={statuses} />
    </div>
  );
}
