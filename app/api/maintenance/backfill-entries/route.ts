import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { salesPriceFor } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * יוצר כניסה אחת לכל ליד קיים שאין לו עדיין.
 *
 * לידים שנכנסו לפני שהוספנו מעקב כניסות לא נספרים במכירה.
 * הפעולה הזו משלימה אותם לפי הקמפיין שרשום עליהם - כניסה
 * אחת לכל ליד, לפי תאריך הכניסה שלו.
 */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [leads, withEntries] = await Promise.all([
    db.lead.count(),
    db.leadEntry.findMany({ select: { leadId: true }, distinct: ["leadId"] }),
  ]);

  return NextResponse.json({
    ok: true,
    missing: Math.max(0, leads - withEntries.length),
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const existing = await db.leadEntry.findMany({
    select: { leadId: true },
    distinct: ["leadId"],
  });
  const has = new Set(existing.map((e) => e.leadId));

  const leads = await db.lead.findMany({
    select: { id: true, extra: true, source: true, intakeAt: true },
  });

  let created = 0;

  for (const lead of leads) {
    if (has.has(lead.id)) continue;

    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, string>)
        : {};

    const campaign = extra.fb_campaign || extra.campaign || null;
    const price = await salesPriceFor(campaign);

    await db.leadEntry
      .create({
        data: {
          leadId: lead.id,
          campaign,
          source: lead.source,
          isSale: price !== null,
          price: price ?? 0,
          at: lead.intakeAt,
        },
      })
      .catch(() => null);

    created++;
  }

  return NextResponse.json({ ok: true, created });
}
