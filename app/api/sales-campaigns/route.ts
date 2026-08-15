import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import {
  clearSalesCampaignCache,
  normalizeName,
  SALE_ORIGIN,
} from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/** רישום קמפיין כקמפיין מכירה */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { name, pricePerLead, buyer, moveExisting } = await request
    .json()
    .catch(() => ({}));

  if (!name?.trim()) {
    return NextResponse.json({ error: "צריך לבחור קמפיין" }, { status: 400 });
  }

  const price = Number(pricePerLead);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    return NextResponse.json({ error: "מחיר לא תקין" }, { status: 400 });
  }

  const exists = await db.salesCampaign.findUnique({
    where: { name: name.trim() },
  });
  if (exists) {
    return NextResponse.json(
      { error: "הקמפיין הזה כבר רשום" },
      { status: 400 }
    );
  }

  const created = await db.salesCampaign.create({
    data: {
      name: name.trim().slice(0, 200),
      pricePerLead: price,
      buyer: typeof buyer === "string" && buyer.trim() ? buyer.trim() : null,
    },
  });

  clearSalesCampaignCache();

  /**
   * לידים שכבר נכנסו מהקמפיין הזה לפני שרשמת אותו
   * יושבים ברשימה הרגילה. מעבירים אותם למכירת לידים.
   */
  let moved = 0;
  if (moveExisting === true) {
    const key = normalizeName(created.name);

    const candidates = await db.lead.findMany({
      where: { origin: "leadmanager" },
      select: { id: true, extra: true },
    });

    for (const lead of candidates) {
      const extra =
        lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
          ? (lead.extra as Record<string, string>)
          : {};
      const campaign = extra.fb_campaign || extra.campaign || "";
      if (!campaign || normalizeName(campaign) !== key) continue;

      await db.lead
        .update({ where: { id: lead.id }, data: { origin: SALE_ORIGIN } })
        .catch(() => null);
      moved++;
    }
  }

  return NextResponse.json({ ok: true, campaign: created, moved });
}
