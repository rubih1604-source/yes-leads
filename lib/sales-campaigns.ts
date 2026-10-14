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
import {
  buildLookup,
  findSaleCampaign,
  normalizeKey,
  type CampaignHit,
  type LeadIdentifiers,
} from "./campaign-match";

export const SALE_ORIGIN = "sale";

let cache: { at: number; lookup: Map<string, CampaignHit> } | null = null;
const CACHE_MS = 30_000;

/**
 * טבלת הזיהוי של קמפייני המכירה.
 *
 * כוללת גם את השמות וגם את המזהים (טופס, קמפיין, מודעה),
 * כדי שליד של קונה יזוהה גם כששם הקמפיין חסר או שונה.
 */
export async function getSaleLookup(): Promise<Map<string, CampaignHit>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.lookup;

  try {
    const rows = await db.salesCampaign.findMany({ where: { active: true } });

    const lookup = buildLookup(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        pricePerLead: Number(r.pricePerLead ?? 0),
        matchKeys: r.matchKeys ?? [],
      }))
    );

    cache = { at: Date.now(), lookup };
    return lookup;
  } catch {
    return new Map();
  }
}

/** שמות הקמפיינים הפעילים והמחיר לליד בכל אחד */
export async function getSalesCampaignMap(): Promise<Map<string, number>> {
  const lookup = await getSaleLookup();
  return new Map([...lookup.entries()].map(([key, hit]) => [key, hit.price]));
}

export function clearSalesCampaignCache() {
  cache = null;
}

/** השוואה סלחנית - רווחים כפולים ואותיות גדולות לא ישברו התאמה */
export const normalizeName = normalizeKey;

/**
 * האם הליד הגיע מקמפיין מכירה - לפי **כל** המזהים שהגיעו איתו.
 *
 * זו הפונקציה שהקליטה שואלת. היא מחזירה null רק אם אף
 * מזהה לא מוכר, ולכן ליד של קונה לא נופל לרשימה שלך
 * בגלל שם חסר.
 */
export async function saleCampaignFor(
  ids: LeadIdentifiers
): Promise<CampaignHit | null> {
  const lookup = await getSaleLookup();
  return findSaleCampaign(ids, lookup);
}

/**
 * האם הליד הגיע מקמפיין מכירה, לפי שם בלבד.
 * מחזיר את המחיר לליד אם כן, ו-null אם לא.
 */
export async function salesPriceFor(
  campaign: string | null | undefined
): Promise<number | null> {
  const hit = await saleCampaignFor({ campaign: campaign ?? null });
  return hit ? hit.price : null;
}
