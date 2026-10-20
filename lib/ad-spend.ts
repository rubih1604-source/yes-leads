/**
 * ============================================================
 *  שליפת הוצאת הפרסום מפייסבוק ושמירתה
 * ============================================================
 *
 *  מקום אחד שעושה את העבודה, ושני מקומות שקוראים לו: הכפתור
 *  במסך ביצועי הקמפיינים, והמנוע פעם ביום. שתי העתקות של
 *  אותו היגיון היו נפרדות זו מזו בשקט.
 */

import { db } from "./db";
import {
  listAdAccounts,
  campaignInsights,
  leadsFromActions,
  pageToken,
  explainGraphError,
} from "./facebook-graph";
import { israelParts } from "./working-hours";

export type SpendSync = {
  ok: boolean;
  error: string | null;
  since: string;
  until: string;
  saved: number;
  /**
   * סכומים על **כל** השורות.
   *
   * קודם המסך סיכם את שדה הדוגמה, שמוגבל ל-20 שורות - ולכן
   * ההוצאה שהוצגה הייתה חלקית וקטנה מהאמת. מספר שמתיימר
   * להיות "ההוצאה בטווח" וחסר ממנו חלק הוא גרוע מאין מספר.
   */
  totals: { spend: number; fbLeads: number; rows: number };
  accounts: Array<{
    id: string;
    name: string | null;
    rows: number;
    error: string | null;
  }>;
  sample: Array<{
    date: string;
    campaignName: string;
    spend: number;
    fbLeads: number;
  }>;
};

function ymd(date: Date): string {
  const p = israelParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(
    p.day
  ).padStart(2, "0")}`;
}

export function spendRange(days: number): { since: string; until: string } {
  const safe = Number.isFinite(days) ? Math.min(Math.max(days, 1), 180) : 14;
  const now = new Date();
  const from = new Date(now.getTime() - (safe - 1) * 24 * 60 * 60 * 1000);

  return { since: ymd(from), until: ymd(now) };
}

/**
 * שולף ושומר. `save: false` = תצוגה מקדימה בלבד.
 *
 * כשל בחשבון אחד לא מפיל את השאר, והשגיאה מדווחת כפי
 * שפייסבוק אמרה אותה - בלי לתרגם אותה לאפס הוצאה, שנראה
 * כאילו הפרסום חינם.
 */
export async function syncAdSpend(
  days = 14,
  save = true
): Promise<SpendSync> {
  const { since, until } = spendRange(days);

  const empty: SpendSync = {
    ok: false,
    error: null,
    since,
    until,
    saved: 0,
    totals: { spend: 0, fbLeads: 0, rows: 0 },
    accounts: [],
    sample: [],
  };

  const token = pageToken();

  if (!token) {
    return {
      ...empty,
      error: "חסר FB_PAGE_TOKEN ברנדר. בלעדיו אי אפשר לשלוף מפייסבוק.",
    };
  }

  let accounts;
  try {
    accounts = await listAdAccounts(token);
  } catch (error) {
    return {
      ...empty,
      error:
        error instanceof Error
          ? explainGraphError(error.message)
          : "לא ניתן לשלוף את חשבונות המודעות",
    };
  }

  if (accounts.length === 0) {
    return {
      ...empty,
      error:
        "הטוקן לא רואה אף חשבון מודעות. הקצה את חשבון המודעות למשתמש המערכת ב-Business Manager והוסף את ההרשאה ads_read.",
    };
  }

  const result: SpendSync = { ...empty, ok: true };

  for (const account of accounts) {
    try {
      const rows = await campaignInsights(account.id, token, since, until);

      const clean = rows
        .filter((r) => r.campaign_id && r.date_start)
        .map((r) => ({
          date: r.date_start as string,
          campaignId: r.campaign_id as string,
          campaignName: r.campaign_name ?? (r.campaign_id as string),
          spend: Number(r.spend ?? 0) || 0,
          impressions: Number(r.impressions ?? 0) || 0,
          clicks: Number(r.clicks ?? 0) || 0,
          fbLeads: leadsFromActions(r),
        }));

      result.accounts.push({
        id: account.id,
        name: account.name ?? null,
        rows: clean.length,
        error: null,
      });

      for (const row of clean) {
        result.totals.spend += row.spend;
        result.totals.fbLeads += row.fbLeads;
        result.totals.rows++;

        if (result.sample.length < 20) {
          result.sample.push({
            date: row.date,
            campaignName: row.campaignName,
            spend: row.spend,
            fbLeads: row.fbLeads,
          });
        }

        if (!save) continue;

        /**
         * יום וקמפיין הם המפתח, ולכן הרצה חוזרת מעדכנת ולא
         * מכפילה. חשוב במיוחד להיום עצמו, שהמספר שלו עוד זז.
         */
        const done = await db.adSpend
          .upsert({
            where: {
              date_campaignId: {
                date: new Date(`${row.date}T00:00:00.000Z`),
                campaignId: row.campaignId,
              },
            },
            create: {
              date: new Date(`${row.date}T00:00:00.000Z`),
              accountId: account.id,
              accountName: account.name ?? null,
              campaignId: row.campaignId,
              campaignName: row.campaignName,
              spend: row.spend,
              impressions: row.impressions,
              clicks: row.clicks,
              fbLeads: row.fbLeads,
            },
            update: {
              accountName: account.name ?? null,
              campaignName: row.campaignName,
              spend: row.spend,
              impressions: row.impressions,
              clicks: row.clicks,
              fbLeads: row.fbLeads,
              syncedAt: new Date(),
            },
          })
          .catch(() => null);

        if (done) result.saved++;
      }
    } catch (error) {
      result.accounts.push({
        id: account.id,
        name: account.name ?? null,
        rows: 0,
        error: error instanceof Error ? explainGraphError(error.message) : "שגיאה",
      });
    }
  }

  result.totals.spend = Math.round(result.totals.spend * 100) / 100;

  return result;
}

/**
 * השליפה היומית של המנוע.
 *
 * המנוע רץ כל דקה, ולכן בדיקת שעה לבדה הייתה מייצרת 60
 * שליפות באותה שעה. הסימון הוא הנתונים עצמם: אם נשמרה
 * שורה ב-20 השעות האחרונות - אין מה לעשות.
 */
export async function syncAdSpendDaily(): Promise<boolean> {
  const hour = Math.floor(israelParts(new Date()).minutes / 60);
  if (hour !== 6) return false;

  const recent = await db.adSpend
    .findFirst({
      where: { syncedAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) } },
      select: { id: true },
    })
    .catch(() => null);

  if (recent) return false;

  /**
   * שולפים 7 ימים ולא יום אחד: פייסבוק מעדכנת הוצאה של
   * ימים שעברו, וטווח צר היה משאיר מספרים ישנים.
   */
  const result = await syncAdSpend(7, true).catch(() => null);
  return Boolean(result?.ok);
}
