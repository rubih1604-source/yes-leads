import Link from "next/link";
import { db } from "@/lib/db";
import RulesScreen, { type RuleRow } from "@/components/RulesScreen";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const rules = await db.rule.findMany({
    orderBy: [{ triggerStatus: "asc" }, { stepIndex: "asc" }],
  });

  const pending = await db.scheduledJob.count({ where: { state: "pending" } });

  return (
    <div className="app">
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

      <RulesScreen rules={rules as RuleRow[]} />
    </div>
  );
}
