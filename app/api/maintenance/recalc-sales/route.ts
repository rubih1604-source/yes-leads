import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizeName } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * חישוב מחדש של כל הכניסות מול הקמפיינים הרשומים.
 *
 * למה זה נחוץ: הרבה מהדאטה נכנס מקובץ CSV לפני שהקמפיינים
 * נרשמו, או שהמחיר לליד שונה אחר כך. הפעולה הזו עוברת על
 * כל הכניסות ומיישרת אותן למצב הנוכחי:
 *
 *  - כניסה מקמפיין רשום -> מסומנת כמכירה, עם המחיר העדכני
 *  - כניסה מקמפיין שהוסר -> חוזרת להיות רגילה
 *
 * סימון "לא לחיוב" שעשית ידנית לא נדרס.
 */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const campaigns = await db.salesCampaign.findMany({ where: { active: true } });
  const priceByName = new Map<string, number>(
    campaigns.map((c) => [normalizeName(c.name), Number(c.pricePerLead ?? 0)])
  );

  const entries = await db.leadEntry.findMany({
    select: { id: true, campaign: true, isSale: true, price: true },
  });

  let marked = 0;
  let unmarked = 0;
  let repriced = 0;

  for (const entry of entries) {
    const key = entry.campaign ? normalizeName(entry.campaign) : null;
    const price = key ? priceByName.get(key) : undefined;
    const shouldBeSale = price !== undefined;

    if (shouldBeSale) {
      const priceChanged = Number(entry.price ?? 0) !== price;
      if (!entry.isSale || priceChanged) {
        await db.leadEntry
          .update({
            where: { id: entry.id },
            data: { isSale: true, price },
          })
          .catch(() => null);
        if (!entry.isSale) marked++;
        else repriced++;
      }
    } else if (entry.isSale) {
      await db.leadEntry
        .update({ where: { id: entry.id }, data: { isSale: false, price: 0 } })
        .catch(() => null);
      unmarked++;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: entries.length,
    marked,
    repriced,
    unmarked,
  });
}
