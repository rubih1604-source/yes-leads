/**
 * ============================================================
 *  קמפיינים של מכירת לידים
 * ============================================================
 *
 *  יש קמפיינים שבהם הלידים לא נעבדים אלא נמכרים.
 *  הם נכנסים דרך אותו webhook, אבל מקבלים מקור "sale"
 *  ולכן:
 *
 *  - לא מופיעים ברשימת הלידים
 *  - לא מקבלים הודעות אוטומטיות
 *  - לא נכנסים לרצפים ולא לסטטוסים
 *
 *  כל מה שמעניין בהם: כמה נכנסו, וכמה כסף זה שווה.
 */

import { db } from "./db";

export const SALE_ORIGIN = "sale";

let cache: { at: number; names: Map<string, number> } | null = null;
const CACHE_MS = 30_000;

/** שמות הקמפיינים הפעילים והמחיר לליד בכל אחד */
export async function getSalesCampaignMap(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.names;

  try {
    const rows = await db.salesCampaign.findMany({ where: { active: true } });
    const names = new Map<string, number>(
      rows.map((r) => [normalizeName(r.name), Number(r.pricePerLead ?? 0)])
    );
    cache = { at: Date.now(), names };
    return names;
  } catch {
    return new Map();
  }
}

export function clearSalesCampaignCache() {
  cache = null;
}

/** השוואה סלחנית - רווחים כפולים ואותיות גדולות לא ישברו התאמה */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * האם הליד הגיע מקמפיין מכירה.
 * מחזיר את המחיר לליד אם כן, ו-null אם לא.
 */
export async function salesPriceFor(
  campaign: string | null | undefined
): Promise<number | null> {
  if (!campaign) return null;
  const map = await getSalesCampaignMap();
  const key = normalizeName(campaign);
  return map.has(key) ? map.get(key)! : null;
}
