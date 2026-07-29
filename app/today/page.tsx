import Link from "next/link";
import { db } from "@/lib/db";
import TodayScreen, { type TaskRow } from "@/components/TodayScreen";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const tasks = await db.task.findMany({
    where: { done: false },
    orderBy: [
      { urgent: "desc" },
      { dueAt: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 100,
  });

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    leadId: t.leadId,
    title: t.title,
    body: t.body,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    needsReview: t.needsReview,
    urgent: t.urgent,
    createdAt: t.createdAt.toISOString(),
    sourceQuestion: t.sourceQuestion,
  }));

  return (
    <div className="app">
      <AutoRefresh seconds={20} />
      <div className="topbar">
        <Link href="/" className="nav-back">
          <span>→</span>
          <span>חזרה לרשימה</span>
        </Link>
        <h1>
          היום
          <span className="count">{rows.length} משימות</span>
        </h1>
      </div>

      <TodayScreen tasks={rows} />
    </div>
  );
}
