import { db } from "@/lib/db";
import GeneralTasks, { type GeneralTask } from "@/components/GeneralTasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tasks = await db.task.findMany({
    where: { leadId: null },
    orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const rows: GeneralTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    body: t.body,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    urgent: t.urgent,
    done: t.done,
  }));

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          משימות עסק
          <span className="count">
            {rows.filter((t) => !t.done).length} פתוחות
          </span>
        </h1>
      </div>

      <GeneralTasks tasks={rows} />
    </div>
  );
}
