import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { existingCustomerReason } from "@/lib/existing-customer";
import { displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * מראה בדיוק מי נספר כלקוח קיים ולמה.
 *
 * כשמספר לא מסתדר, זו הדרך לראות את הנתון הגולמי במקום
 * לנחש - איזה שדה הכיל את התשובה, ומה בדיוק היה כתוב בו.
 */
export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const campaign = new URL(request.url).searchParams.get("campaign");

  const leads = await db.lead.findMany({
    where: { origin: "leadmanager" },
    orderBy: { intakeAt: "desc" },
    take: 2000,
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      intakeAt: true,
      extra: true,
    },
  });

  const rows = leads
    .filter((l) => {
      if (!campaign) return true;
      const e =
        l.extra && typeof l.extra === "object" && !Array.isArray(l.extra)
          ? (l.extra as Record<string, string>)
          : {};
      return (e.fb_campaign || e.campaign || "") === campaign;
    })
    .map((l) => ({
      id: l.id,
      name: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || displayPhone(l.phone),
      status: l.status,
      intakeAt: l.intakeAt.toISOString(),
      reason: existingCustomerReason(l.extra, l.status),
    }));

  const existing = rows.filter((r) => r.reason !== null);

  return NextResponse.json({
    ok: true,
    campaign: campaign ?? "כל הקמפיינים",
    total: rows.length,
    existing: existing.length,
    existingLeads: existing,
    others: rows.filter((r) => r.reason === null).slice(0, 200),
  });
}
