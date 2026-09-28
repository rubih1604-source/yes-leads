import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizeName } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  מחזיר כל ליד לבעלים הנכון
 * ============================================================
 *
 *  הכלל הישן היה "מי שנכנס למכירה נשאר במכירה לנצח". התוצאה:
 *  אדם שנכנס פעם מקמפיין של הקונה, ואחר כך נכנס שוב מקמפיין
 *  שלך, נשאר מסומן כשל הקונה - ופשוט נעלם לך מהרשימה.
 *
 *  הכלל הנכון: **הכניסה האחרונה שיש בה קמפיין קובעת.**
 *  נכנס אחרון מקמפיין מכירה -> של הקונה.
 *  נכנס אחרון מקמפיין שלך -> שלך.
 *
 *  לידים בלי אף כניסה עם קמפיין לא נוגעים בהם.
 */

async function plan() {
  const campaigns = await db.salesCampaign
    .findMany({ where: { active: true }, select: { name: true } })
    .catch(() => []);

  const saleKeys = new Set(campaigns.map((c) => normalizeName(c.name)));

  const leads = await db.lead.findMany({
    select: {
      id: true,
      origin: true,
      firstName: true,
      lastName: true,
      phone: true,
      entries: {
        where: { campaign: { not: null } },
        orderBy: { at: "desc" },
        take: 1,
        select: { campaign: true },
      },
    },
  });

  const changes: Array<{
    id: string;
    name: string;
    from: string;
    to: string;
    campaign: string;
  }> = [];

  for (const lead of leads) {
    const campaign = lead.entries[0]?.campaign;
    if (!campaign) continue;

    const shouldBe = saleKeys.has(normalizeName(campaign))
      ? "sale"
      : "leadmanager";

    // ליד שנוצר מהודעת וואטסאפ בלבד נשאר שלו
    if (lead.origin === "whatsapp" && shouldBe === "leadmanager") continue;
    if (lead.origin === shouldBe) continue;

    changes.push({
      id: lead.id,
      name: `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.phone,
      from: lead.origin,
      to: shouldBe,
      campaign,
    });
  }

  return changes;
}

/** תצוגה מקדימה - מי יזוז ולאן */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const changes = await plan();

  return NextResponse.json({
    ok: true,
    total: changes.length,
    backToYou: changes.filter((c) => c.to === "leadmanager").length,
    toSale: changes.filter((c) => c.to === "sale").length,
    changes: changes.slice(0, 200),
  });
}

/** ביצוע */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const changes = await plan();
  let moved = 0;

  for (const change of changes) {
    await db.lead
      .update({ where: { id: change.id }, data: { origin: change.to } })
      .catch(() => null);

    // ליד שחוזר אליך לא צריך לגרור משימות של תקופת המכירה
    if (change.to === "sale") {
      await db.scheduledJob
        .updateMany({
          where: { leadId: change.id, state: "pending" },
          data: { state: "cancelled", lastError: "ליד מכירה" },
        })
        .catch(() => null);
    }

    moved++;
  }

  return NextResponse.json({
    ok: true,
    moved,
    backToYou: changes.filter((c) => c.to === "leadmanager").length,
    toSale: changes.filter((c) => c.to === "sale").length,
  });
}
