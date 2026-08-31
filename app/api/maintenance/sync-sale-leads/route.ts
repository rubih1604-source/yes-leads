import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizeName, SALE_ORIGIN } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * מעביר למכירה כל ליד ששייך לקמפיין מכירה רשום.
 *
 * נחוץ כי לידים דלפו לרשימה הרגילה משתי סיבות: כלל שגוי
 * בקליטה שהחזיר אותם, ולידים שנכנסו לפני שרשמת את הקמפיין.
 *
 * הפעולה גם מבטלת משימות ממתינות שלהם, כדי שלא תצא
 * הודעה ללקוח של הקונה.
 */

function campaignOf(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const e = extra as Record<string, string>;
  return e.fb_campaign || e.campaign || null;
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const campaigns = await db.salesCampaign.findMany({ where: { active: true } });
  const keys = new Set(campaigns.map((c) => normalizeName(c.name)));

  if (keys.size === 0) {
    return NextResponse.json({ ok: true, count: 0, campaigns: 0 });
  }

  const leads = await db.lead.findMany({
    where: { origin: { not: SALE_ORIGIN } },
    select: { id: true, extra: true },
  });

  const count = leads.filter((l) => {
    const name = campaignOf(l.extra);
    return name ? keys.has(normalizeName(name)) : false;
  }).length;

  return NextResponse.json({ ok: true, count, campaigns: keys.size });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const campaigns = await db.salesCampaign.findMany({ where: { active: true } });
  const priceByKey = new Map<string, number>(
    campaigns.map((c) => [normalizeName(c.name), Number(c.pricePerLead ?? 0)])
  );

  if (priceByKey.size === 0) {
    return NextResponse.json(
      { error: "לא רשומים קמפיינים של מכירה" },
      { status: 400 }
    );
  }

  const leads = await db.lead.findMany({
    where: { origin: { not: SALE_ORIGIN } },
    select: { id: true, extra: true, intakeAt: true, source: true },
  });

  let moved = 0;
  let cancelled = 0;

  for (const lead of leads) {
    const name = campaignOf(lead.extra);
    if (!name) continue;

    const key = normalizeName(name);
    const price = priceByKey.get(key);
    if (price === undefined) continue;

    await db.lead
      .update({ where: { id: lead.id }, data: { origin: SALE_ORIGIN } })
      .catch(() => null);

    // כניסת מכירה, אם עוד אין כזו
    const existingEntry = await db.leadEntry.findFirst({
      where: { leadId: lead.id, campaign: name, isSale: true },
    });

    if (!existingEntry) {
      await db.leadEntry
        .create({
          data: {
            leadId: lead.id,
            campaign: name,
            source: lead.source,
            isSale: true,
            price,
            at: lead.intakeAt,
          },
        })
        .catch(() => null);
    }

    const res = await db.scheduledJob
      .updateMany({
        where: { leadId: lead.id, state: "pending" },
        data: { state: "cancelled", lastError: "ליד מכירה - הועבר" },
      })
      .catch(() => ({ count: 0 }));

    cancelled += res.count;
    moved++;
  }

  return NextResponse.json({ ok: true, moved, cancelled });
}
