import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import {
  clearSalesCampaignCache,
  normalizeName,
} from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.pricePerLead !== undefined) {
    const n = Number(body.pricePerLead);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return NextResponse.json({ error: "מחיר לא תקין" }, { status: 400 });
    }
    data.pricePerLead = n;
  }

  if (typeof body.buyer === "string") {
    data.buyer = body.buyer.trim() || null;
  }

  if (typeof body.active === "boolean") data.active = body.active;

  // שיוך לקמפיין של לקוח מסוים. null מנתק.
  if (body.buyerId !== undefined) {
    data.buyerId =
      typeof body.buyerId === "string" && body.buyerId ? body.buyerId : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  await db.salesCampaign.update({ where: { id: params.id }, data });
  clearSalesCampaignCache();
  return NextResponse.json({ ok: true });
}

/**
 * הסרת קמפיין מרשימת המכירה.
 * הלידים חוזרים לרשימה הרגילה, כדי שלא ייעלמו.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const campaign = await db.salesCampaign.findUnique({
    where: { id: params.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }

  const key = normalizeName(campaign.name);

  const saleLeads = await db.lead.findMany({
    where: { origin: "sale" },
    select: { id: true, extra: true },
  });

  let returned = 0;
  for (const lead of saleLeads) {
    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, string>)
        : {};
    const name = extra.fb_campaign || extra.campaign || "";
    if (!name || normalizeName(name) !== key) continue;

    await db.lead
      .update({ where: { id: lead.id }, data: { origin: "leadmanager" } })
      .catch(() => null);
    returned++;
  }

  await db.salesCampaign.delete({ where: { id: params.id } });
  clearSalesCampaignCache();

  return NextResponse.json({ ok: true, returned });
}
