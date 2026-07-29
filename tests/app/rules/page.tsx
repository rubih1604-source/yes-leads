import Link from "next/link";
import { db } from "@/lib/db";
import RulesScreen, {
  type RuleRow,
  type TemplateChoice,
} from "@/components/RulesScreen";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [rules, templates, pending] = await Promise.all([
    db.rule.findMany({
      orderBy: [{ triggerStatus: "asc" }, { stepIndex: "asc" }],
    }),
    db.template.findMany({
      orderBy: { name: "asc" },
      select: { name: true, displayName: true },
    }),
    db.scheduledJob.count({ where: { state: "pending" } }),
  ]);

  return (
    <div className="app">
      <AutoRefresh seconds={30} />
      <div className="topbar">
        <Link href="/" className="nav-back">
          <span>→</span>
          <span>חזרה לרשימה</span>
        </Link>
        <h1>
          חוקים
          <span className="count">{pending} משימות ממתינות</span>
        </h1>
      </div>

      <RulesScreen
        rules={rules as RuleRow[]}
        templates={templates as TemplateChoice[]}
      />
    </div>
  );
}
