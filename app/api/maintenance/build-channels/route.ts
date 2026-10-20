import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { clearChannelCache } from "@/lib/channels";
import { clearLeadFormCache } from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  בונה קמפיינים וערוצים ממה שכבר מוגדר
 * ============================================================
 *
 *  לפני הערוצים ההגדרות היו מפוזרות: קונה החזיק את הוובוק,
 *  קמפיין מכירה החזיק את המחיר, וטופס החזיק את השיוך. כאן
 *  כל זה נאסף לערוצים, בלי שתגדיר מחדש.
 *
 *  מה נבנה:
 *   - קמפיין "מכירת לידים", ובתוכו ערוץ לכל קונה קיים,
 *     עם הוובוק, התבנית והכותרות שלו.
 *   - קמפיין "הלידים שלי", ובתוכו ערוץ לטפסים שסומנו כשלך.
 *   - טפסים שכבר שויכו מקבלים את הערוץ המתאים.
 *
 *  **לא נמחק שום דבר.** ההגדרות הוותיקות נשארות, והערוצים
 *  נבנים לידן. אם משהו לא נראה נכון - אפשר לתקן בערוץ ולא
 *  לאבד כלום.
 *
 *  GET  - מה ייבנה
 *  POST - בנייה
 */

const SALE_CAMPAIGN = "מכירת לידים";
const MINE_CAMPAIGN = "הלידים שלי";

async function plan() {
  const [buyers, forms, saleCampaigns, existing] = await Promise.all([
    db.leadBuyer.findMany().catch(() => []),
    db.leadForm.findMany().catch(() => []),
    db.salesCampaign.findMany({ where: { active: true } }).catch(() => []),
    db.channel
      .findMany({ include: { campaign: { select: { name: true } } } })
      .catch(() => []),
  ]);

  const have = new Set(
    existing.map((c) => `${c.campaign.name}·${c.name}`)
  );

  const channels: Array<{
    campaign: string;
    name: string;
    isSale: boolean;
    price: number;
    fromBuyer: string | null;
    forms: number;
    exists: boolean;
  }> = [];

  for (const buyer of buyers) {
    /**
     * המחיר מגיע מקמפיין מכירה שמשויך לקונה, אם יש כזה.
     */
    const campaign = saleCampaigns.find((c) => c.buyerId === buyer.id);

    channels.push({
      campaign: SALE_CAMPAIGN,
      name: buyer.name,
      isSale: true,
      price: Number(campaign?.pricePerLead ?? 0),
      fromBuyer: buyer.id,
      forms: forms.filter((f) => f.buyerId === buyer.id).length,
      exists: have.has(`${SALE_CAMPAIGN}·${buyer.name}`),
    });
  }

  const mineForms = forms.filter((f) => f.channel !== "sale" && !f.buyerId);

  if (mineForms.length > 0) {
    channels.push({
      campaign: MINE_CAMPAIGN,
      name: "טפסים שלי",
      isSale: false,
      price: 0,
      fromBuyer: null,
      forms: mineForms.length,
      exists: have.has(`${MINE_CAMPAIGN}·טפסים שלי`),
    });
  }

  return { channels, buyers, forms, saleCampaigns };
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { channels } = await plan();

  return NextResponse.json({
    ok: true,
    ייבנו: channels.filter((c) => !c.exists).length,
    כבר_קיימים: channels.filter((c) => c.exists).length,
    ערוצים: channels,
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { channels, buyers, forms } = await plan();

  let created = 0;
  let linkedForms = 0;

  for (const row of channels) {
    if (row.exists) continue;

    const campaign = await db.campaign
      .upsert({
        where: { name: row.campaign },
        create: { name: row.campaign },
        update: {},
      })
      .catch(() => null);

    if (!campaign) continue;

    const buyer = row.fromBuyer
      ? buyers.find((b) => b.id === row.fromBuyer)
      : null;

    const channel = await db.channel
      .create({
        data: {
          campaignId: campaign.id,
          name: row.name,
          isSale: row.isSale,
          pricePerLead: row.price,
          /** כל הגדרות השליחה מועתקות מהקונה, כדי שלא תגדיר מחדש */
          webhookUrl: buyer?.webhookUrl ?? null,
          webhookSecret: buyer?.webhookSecret ?? null,
          webhookFormat: buyer?.webhookFormat ?? "json",
          bodyTemplate: buyer?.bodyTemplate ?? null,
          headers: (buyer?.headers ?? null) as never,
          successContains: buyer?.successContains ?? null,
          failureContains: buyer?.failureContains ?? null,
          sendEnabled: buyer?.sendEnabled ?? true,
        },
      })
      .catch(() => null);

    if (!channel) continue;
    created++;

    /**
     * טפסים שכבר שויכו לקונה או סומנו כשלך מקבלים את הערוץ.
     */
    const mine = row.fromBuyer
      ? forms.filter((f) => f.buyerId === row.fromBuyer)
      : forms.filter((f) => f.channel !== "sale" && !f.buyerId);

    for (const form of mine) {
      const done = await db.leadForm
        .update({
          where: { id: form.id },
          data: { channelId: channel.id },
        })
        .catch(() => null);

      if (done) linkedForms++;
    }
  }

  clearChannelCache();
  clearLeadFormCache();

  return NextResponse.json({
    ok: true,
    ערוצים_שנבנו: created,
    טפסים_ששויכו: linkedForms,
  });
}
