import { db } from "@/lib/db";
import BackLink from "@/components/BackLink";
import CampaignsScreen, {
  type CampaignRow,
} from "@/components/CampaignsScreen";
import { headersToText } from "@/lib/delivery-payload";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await db.campaign
    .findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: {
        channels: {
          orderBy: [{ position: "asc" }, { name: "asc" }],
          include: {
            forms: {
              select: {
                formId: true,
                formName: true,
                pageId: true,
                pageName: true,
              },
            },
            _count: { select: { entries: true } },
          },
        },
      },
    })
    .catch(() => []);

  const rows: CampaignRow[] = campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    active: campaign.active,
    channels: campaign.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      isSale: channel.isSale,
      pricePerLead: Number(channel.pricePerLead ?? 0),
      webhookUrl: channel.webhookUrl ?? "",
      webhookSecret: channel.webhookSecret ?? "",
      webhookFormat: channel.webhookFormat,
      bodyTemplate: channel.bodyTemplate ?? "",
      headersText: headersToText(
        channel.headers && typeof channel.headers === "object" && !Array.isArray(channel.headers)
          ? (channel.headers as Record<string, string>)
          : null
      ),
      successContains: channel.successContains ?? "",
      failureContains: channel.failureContains ?? "",
      fields: channel.fields ?? [],
      sendEnabled: channel.sendEnabled,
      autoSend: channel.autoSend,
      active: channel.active,
      forms: channel.forms,
      leads: channel._count.entries,
    })),
  }));

  return (
    <div className="app">
      <div className="topbar">
        <BackLink fallback="/more" label="חזרה" />
        <h1>
          קמפיינים וערוצים
          <span className="count">{rows.length} קמפיינים</span>
        </h1>
      </div>

      <CampaignsScreen campaigns={rows} />
    </div>
  );
}
