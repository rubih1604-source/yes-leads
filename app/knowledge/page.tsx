import Link from "next/link";
import { db } from "@/lib/db";
import KnowledgeScreen, { type KnowledgeRow } from "@/components/KnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const prefill = searchParams?.q?.trim() || "";
  const items = await db.knowledgeItem.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="app">
      <div className="topbar">
        <Link href="/" className="nav-back">
          <span>→</span>
          <span>חזרה לרשימה</span>
        </Link>
        <h1>
          מאגר הידע
          <span className="count">{items.length} נושאים</span>
        </h1>
      </div>

      <KnowledgeScreen items={items as KnowledgeRow[]} prefill={prefill} />
    </div>
  );
}
