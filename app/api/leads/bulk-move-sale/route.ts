import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { SALE_ORIGIN } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * מעביר לידים קיימים למסלול מכירה של קמפיין מסוים.
 *
 * שימושי ללידים שנכנסו לפני שרשמת את הקמפיין, או ללידים
 * מהמערכת הקודמת שאין עליהם שם קמפיין בכלל.
 *
 * הכניסה נרשמת לפי תאריך הכניסה המקורי של הליד, כדי
 * שההכנסה תיפול בחודש הנכון ולא תנפח את החודש הנוכחי.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { leadIds, campaignId } = await request.json().catch(() => ({}));

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "לא נבחרו לידים" }, { status: 400 });
  }

  if (!campaignId) {
    return NextResponse.json(
      { error: "צריך לבחור קמפיין מכירה" },
      { status: 400 }
    );
  }

  const campaign = await db.salesCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return NextResponse.json({ error: "הקמפיין לא נמצא" }, { status: 404 });
  }

  const price = Number(campaign.pricePerLead ?? 0);

  const leads = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, intakeAt: true, source: true },
  });

  let moved = 0;
  let alreadyThere = 0;

  for (const lead of leads) {
    // אם כבר יש כניסת מכירה לקמפיין הזה - לא מכפילים
    const existing = await db.leadEntry.findFirst({
      where: { leadId: lead.id, campaign: campaign.name, isSale: true },
    });

    if (existing) {
      alreadyThere++;
      continue;
    }

    await db.leadEntry
      .create({
        data: {
          leadId: lead.id,
          campaign: campaign.name,
          source: lead.source,
          isSale: true,
          price,
          at: lead.intakeAt,
        },
      })
      .catch(() => null);

    await db.lead
      .update({ where: { id: lead.id }, data: { origin: SALE_ORIGIN } })
      .catch(() => null);

    /**
     * ליד שמועבר למכירה לא צריך יותר רצפים.
     * מבטלים מה שמתוזמן כדי שלא יקבל הודעה בטעות.
     */
    await db.scheduledJob
      .updateMany({
        where: { leadId: lead.id, state: "pending" },
        data: { state: "cancelled", lastError: "הליד הועבר למכירת לידים" },
      })
      .catch(() => null);

    moved++;
  }

  return NextResponse.json({
    ok: true,
    moved,
    alreadyThere,
    campaign: campaign.name,
    revenue: moved * price,
  });
}
