import { db } from "@/lib/db";
import OffersScreen, {
  type OfferRow,
  type SubStatusOption,
  type StatusOption,
  type TemplateChoice,
} from "@/components/OffersScreen";
import { getSubStatuses } from "@/lib/substatus";
import { getStatuses } from "@/lib/status-store";
import { readTargets } from "@/lib/offer-targets";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const [offers, subs, templates, statuses] = await Promise.all([
    db.offer.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    getSubStatuses(),
    db.template.findMany({
      where: { approved: true },
      orderBy: { name: "asc" },
      select: { name: true, displayName: true },
    }),
    getStatuses(),
  ]);

  const rows: OfferRow[] = offers.map((o) => ({
    id: o.id,
    title: o.title,
    price: o.price,
    decoders: o.decoders,
    streaming: o.streaming,
    sports: o.sports,
    freeText: o.freeText,
    targets: readTargets(o.targets),
    active: o.active,
  }));

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          מבצעים
          <span className="count">{rows.length}</span>
        </h1>
      </div>

      <OffersScreen
        offers={rows}
        statuses={statuses as StatusOption[]}
        subStatuses={subs as SubStatusOption[]}
        templates={templates as TemplateChoice[]}
      />
    </div>
  );
}
