/**
 * ============================================================
 *  למי הליד הזה שייך - לך או לקונה
 * ============================================================
 *
 *  זו ההחלטה הקריטית במערכת, וזו גם ההחלטה שנשברה שוב ושוב.
 *
 *  ככה זה עבד עד עכשיו:
 *    מגיע ליד -> לוקחים את **שם** הקמפיין -> משווים אותו
 *    לשם שרשום בקמפייני המכירה -> התאמה = של הקונה.
 *
 *  למה זה נשבר כל פעם:
 *
 *    1. שם קמפיין הוא טקסט חופשי. אות שונה, מקף, רווח
 *       כפול - וההתאמה נופלת.
 *
 *    2. השם לא תמיד מגיע בכלל. ליד מנגר שולחת אותו, אבל
 *       החיבור הישיר לפייסבוק מקבל את שם הקמפיין רק אם
 *       יש הרשאה לחשבון המודעות. בלי הרשאה - אין שם.
 *
 *    3. וכשאין התאמה, ברירת המחדל היא **"שלך"**. כלומר
 *       הכשל תמיד נופל לכיוון אחד: ליד של הקונה נכנס
 *       לרשימה שלך. זה מה שראית חוזר בכל עדכון.
 *
 *  מה שנעשה כאן במקום:
 *
 *    הקמפיין מזוהה לפי **מזהה** - טופס, קמפיין, מודעה או
 *    קבוצת מודעות. מזהה הוא מספר שפייסבוק מייצרת, הוא תמיד
 *    מגיע, והוא לא משתנה גם אם תשנה מחר את שם הקמפיין.
 *    השם נשאר רק כגיבוי.
 *
 *  הקובץ טהור בכוונה - בלי מסד נתונים - כדי שכל ההחלטה
 *  הזו תהיה מכוסה בבדיקות ולא תישבר בשקט.
 */

/** כל מה שהגיע עם הליד ויכול לזהות את הקמפיין שלו */
export type LeadIdentifiers = {
  campaign?: string | null;
  campaignId?: string | null;
  adId?: string | null;
  adsetId?: string | null;
  formId?: string | null;
};

/** השוואה סלחנית - רווחים כפולים ואותיות גדולות לא ישברו התאמה */
export function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * כל המזהים שהגיעו עם הליד, כרשימת מפתחות להשוואה.
 *
 * נשלף מהשדות הנוספים של הליד, שזה המקום שבו הקליטה
 * שומרת את מה שפייסבוק וליד מנגר שלחו.
 */
export function identifiersOf(
  extra: Record<string, unknown> | null | undefined
): LeadIdentifiers {
  const get = (key: string): string | null => {
    const value = extra?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  return {
    campaign: get("fb_campaign") ?? get("campaign"),
    campaignId: get("fb_campaign_id"),
    adId: get("fb_ad_id"),
    adsetId: get("fb_adset_id"),
    formId: get("fb_form"),
  };
}

/**
 * המפתחות שאפשר לחפש לפיהם, מהאמין לפחות אמין.
 *
 * הסדר חשוב: מזהה מדויק קודם לשם. ככה קמפיין שמזוהה
 * לפי מזהה לא יושפע משם שהשתנה.
 */
export function matchKeysOf(ids: LeadIdentifiers): string[] {
  const keys = [
    ids.formId,
    ids.campaignId,
    ids.adsetId,
    ids.adId,
    ids.campaign,
  ];

  const out: string[] = [];
  for (const key of keys) {
    if (!key) continue;
    const clean = normalizeKey(key);
    if (clean && !out.includes(clean)) out.push(clean);
  }

  return out;
}

/** קמפיין מכירה כפי שהוא רשום, מוכן להשוואה */
export type CampaignRule = {
  id: string;
  name: string;
  pricePerLead: number;
  /** מזהים נוספים: טופס, קמפיין, מודעה, או שם חלופי */
  matchKeys?: string[] | null;
};

export type CampaignHit = {
  campaignId: string;
  name: string;
  price: number;
  /** לפי איזה מפתח נמצאה ההתאמה - כדי שיהיה אפשר להסביר החלטה */
  matchedOn: string;
};

/**
 * בניית טבלת חיפוש: מפתח -> הקמפיין שהוא מסמן.
 *
 * אם אותו מפתח רשום בשני קמפיינים, הראשון ברשימה גובר.
 * לא מכריעים בשקט לטובת האחרון.
 */
export function buildLookup(rules: CampaignRule[]): Map<string, CampaignHit> {
  const lookup = new Map<string, CampaignHit>();

  for (const rule of rules) {
    const keys = [rule.name, ...(rule.matchKeys ?? [])];

    for (const key of keys) {
      if (typeof key !== "string") continue;
      const clean = normalizeKey(key);
      if (!clean || lookup.has(clean)) continue;

      lookup.set(clean, {
        campaignId: rule.id,
        name: rule.name,
        price: Number(rule.pricePerLead ?? 0),
        matchedOn: clean,
      });
    }
  }

  return lookup;
}

/**
 * ההכרעה עצמה: האם הליד הזה של קמפיין מכירה.
 *
 * מחזיר null רק אם **אף אחד** מהמזהים לא מוכר. כל מזהה
 * אחד שמתאים מספיק - וזה בדיוק מה שמונע מליד של הקונה
 * ליפול לרשימה שלך כשהשם חסר.
 */
export function findSaleCampaign(
  ids: LeadIdentifiers,
  lookup: Map<string, CampaignHit>
): CampaignHit | null {
  for (const key of matchKeysOf(ids)) {
    const hit = lookup.get(key);
    if (hit) return { ...hit, matchedOn: key };
  }

  return null;
}

/**
 * פירוק מה שהוקלד בשדה המזהים.
 *
 * מקבל שורות או פסיקים, זורק כפילויות וריקים, ומגביל
 * כדי שהקלדה שגויה לא תתפח בלי סוף.
 */
export function parseMatchKeys(input: string): string[] {
  const out: string[] = [];

  for (const raw of input.split(/[\n,]/)) {
    const clean = raw.trim();
    if (!clean) continue;
    if (out.some((k) => normalizeKey(k) === normalizeKey(clean))) continue;
    out.push(clean.slice(0, 200));
    if (out.length >= 50) break;
  }

  return out;
}

/** כניסה כפי שהיא נדרשת להכרעה */
export type EntryForMatch = {
  id: string;
  campaign?: string | null;
  isSale?: boolean | null;
};

export type EntryPlan = {
  /** הכניסות שצריכות חותמת מכירה, עם המחיר שלהן */
  stamp: Array<{ id: string; price: number }>;
  /** הקמפיין שזוהה, או null אם הליד לא של קונה */
  hit: CampaignHit | null;
  /** כמה כניסות יישארו שלך אחרי החתימה */
  mineLeft: number;
};

/**
 * מה לעשות עם הכניסות של ליד קיים.
 *
 * כאן יושב כלל הזהירות, במקום אחד שמשרת גם את המנוע וגם
 * את התחזוקה - כדי ששני המקומות לא ייפרדו זה מזה בשקט:
 *
 *   נופלים למזהים של הליד **רק** אם לאף כניסה אין שם
 *   קמפיין.
 *
 * למה: אם השמות עובדים על הליד הזה, אין צורך לנחש. כניסה
 * בלי שם אצל ליד כזה יכולה להיות כניסה ותיקה **שלך**,
 * וחתימת מכירה עליה תחייב את הקונה על ליד שלא קיבל.
 * עדיף לסמן פחות מלחייב בטעות.
 */
export function planEntries(
  entries: EntryForMatch[],
  leadIds: LeadIdentifiers,
  lookup: Map<string, CampaignHit>
): EntryPlan {
  const anyNamed = entries.some((e) => e.campaign);
  const byIds = anyNamed ? null : findSaleCampaign(leadIds, lookup);

  const stamp: Array<{ id: string; price: number }> = [];
  let hit: CampaignHit | null = byIds;

  for (const entry of entries) {
    if (entry.isSale) continue;

    const entryHit = entry.campaign
      ? findSaleCampaign({ campaign: entry.campaign }, lookup)
      : byIds;

    if (!entryHit) continue;

    hit = hit ?? entryHit;
    stamp.push({ id: entry.id, price: entryHit.price });
  }

  const stamped = new Set(stamp.map((e) => e.id));

  /**
   * כניסה אחת שלך מספיקה כדי שהליד יישאר שלך - ליד רגיל
   * אצלך וליד רגיל אצל הקונה במקביל.
   */
  const mineLeft = entries.filter(
    (e) => !e.isSale && !stamped.has(e.id)
  ).length;

  return { stamp, hit, mineLeft };
}
