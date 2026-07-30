import { db } from "@/lib/db";
import Nav from "./Nav";

/** שולף את המונים לניווט. נטען בכל מסך דרך ה-layout. */
export default async function NavData() {
  try {
    const [openTasks, recent] = await Promise.all([
      db.task.count({ where: { done: false } }),
      db.message.findMany({
        orderBy: { createdAt: "desc" },
        take: 600,
        select: { leadId: true, direction: true },
      }),
    ]);

    const seen = new Set<string>();
    let waitingReply = 0;
    for (const m of recent) {
      if (seen.has(m.leadId)) continue;
      seen.add(m.leadId);
      if (m.direction === "in") waitingReply++;
    }

    return <Nav openTasks={openTasks} waitingReply={waitingReply} />;
  } catch {
    return <Nav />;
  }
}
