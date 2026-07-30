import { db } from "@/lib/db";
import RulesScreen, {
  type RuleRow,
  type TemplateChoice,
} from "@/components/RulesScreen";
import AutoRefresh from "@/components/AutoRefresh";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const statuses = await getStatuses();

  const [rules, templates, pending] = await Promise.all([
    db.rule.findMany({
      orderBy: [{ triggerStatus: "asc" }, { stepIndex: "asc" }],
    }),
    db.template.findMany({
      where: { approved: true },
      orderBy: { name: "asc" },
      select: { name: true, displayName: true },
    }),
    db.scheduledJob.count({ where: { state: "pending" } }),
  ]);

  return (
    <div className="app">
      <AutoRefresh seconds={30} />
      <div className="topbar">
        <h1>
          חוקים
          <span className="count">{pending} משימות ממתינות</span>
        </h1>
      </div>

      <RulesScreen
        rules={rules as RuleRow[]}
        templates={templates as TemplateChoice[]}
        statuses={statuses}
      />
    </div>
  );
}
