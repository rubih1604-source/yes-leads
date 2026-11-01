import { db } from "@/lib/db";
import { TEMPLATE_DRAFTS } from "@/lib/template-drafts";
import TemplateDraftsScreen, {
  type DraftRow,
} from "@/components/TemplateDraftsScreen";

export const dynamic = "force-dynamic";

/**
 * כל תבנית שחוק מצפה לה, מול מה שבאמת קיים בטקסטר.
 * ההשוואה היא לפי שם מדויק - בדיוק כמו שהמתזמן מחפש.
 */
export default async function TemplateDraftsPage() {
  const existing = await db.template
    .findMany({ select: { name: true } })
    .catch(() => [] as Array<{ name: string }>);

  const have = new Set(existing.map((t) => t.name));

  const rows: DraftRow[] = TEMPLATE_DRAFTS.map((d) => ({
    ...d,
    exists: have.has(d.name),
  }));

  return <TemplateDraftsScreen rows={rows} />;
}
