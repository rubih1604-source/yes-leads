import { db } from "@/lib/db";
import RoutingScreen from "@/components/RoutingScreen";

export const dynamic = "force-dynamic";

/**
 * שידור וניתוב לידים.
 *
 * המקום האחד שבו רואים ומגדירים: שינוי לאיזה סטטוס משדר
 * את הליד לאיזה ערוץ.
 */
export default async function RoutingPage() {
  const [statuses, channels] = await Promise.all([
    db.status
      .findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] })
      .catch(() => []),
    db.channel
      .findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        include: { campaign: { select: { name: true } } },
      })
      .catch(() => []),
  ]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          שידור וניתוב לידים
          <span className="count">
            {statuses.filter((s) => s.transferChannelId).length} פעילים
          </span>
        </h1>
      </div>

      <RoutingScreen
        statuses={statuses.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          transferChannelId: s.transferChannelId ?? null,
          transferPrice: Number(s.transferPrice ?? 0),
        }))}
        channels={channels.map((c) => ({
          id: c.id,
          name: c.name,
          campaignName: c.campaign?.name ?? "",
          isSale: c.isSale,
          hasUrl: Boolean(c.webhookUrl?.trim()),
          pricePerLead: Number(c.pricePerLead ?? 0),
        }))}
      />
    </div>
  );
}
