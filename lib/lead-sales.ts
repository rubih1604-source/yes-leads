/**
 * ============================================================
 *  מכירת לידים
 * ============================================================
 *
 *  ההכנסה נספרת לפי **כניסות**, לא לפי לידים.
 *
 *  אותו אדם יכול להיכנס מקמפיין של אלעד וגם מקמפיין שלך.
 *  שתי הכניסות אמיתיות, ומגיע לך תשלום על זו שנמכרה -
 *  גם אם הליד עצמו נשאר ברשימת העבודה שלך.
 */

import { db } from "./db";
import { normalizeName } from "./sales-campaigns";
import { isExistingCustomer } from "./existing-customer";
import { matchesQuery } from "./sale-search";
import type { Range } from "./periods";

export type CampaignStat = {
  id: string;
  name: string;
  buyerId: string | null;
  buyerName: string | null;
  pricePerLead: number;
  /** מזהים נוספים שמסמנים ליד כשייך לקמפיין הזה */
  matchKeys: string[];
  active: boolean;
  leadsMonth: number;
  leadsTotal: number;
  existingMonth: number;
  existingPercent: number;
  revenueMonth: number;
  excludedMonth: number;
};

export type BuyerStat = {
  id: string;
  name: string;
  campaigns: number;
  leadsMonth: number;
  revenueMonth: number;
};

export type SaleEntryRow = {
  id: string;
  leadId: string;
  name: string;
  phone: string;
  /** נדרש כדי שאפשר יהיה להציג דוא"ל בשורה, כמו בדוח */
  email: string | null;
  campaign: string | null;
  price: number;
  at: string;
  existingCustomer: boolean;
  billable: boolean;
};

export type LeadSalesSummary = {
  campaigns: CampaignStat[];
  buyers: BuyerStat[];
  entries: SaleEntryRow[];
  totalMonth: number;
  revenueMonth: number;
  /** כל כניסות המכירה אי פעם, בלי קשר לטווח */
  leadsAllTime: number;
  /** כניסות בטווח שלא מופיעות באף שורת פירוט */
  unclassifiedMonth: number;
  unregistered: Array<{ name: string; count: number }>;
  monthLabel: string;
  /** האם הרשימה מציגה תוצאות חיפוש ולא את התקופה שנבחרה */
  searching: boolean;
  /** מה חיפשת */
  query: string;
};

function campaignOf(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const e = extra as Record<string, string>;
  return e.fb_campaign || e.campaign || null;
}


/**
 * מקבל טווח תאריכים מלא, כדי שאפשר יהיה לסנן לפי חודש
 * נוכחי, חודש קודם או כל טווח שתבחר - באותה שפה שבה
 * מדברים שאר הדוחות במערכת.
 */
export async function getLeadSales(
  range: Range,
  query = ""
): Promise<LeadSalesSummary> {
  const from = range.from;
  const to = range.to;

  /**
   * ============================================================
   *  חיפוש חוצה תאריכים
   * ============================================================
   *
   *  כשמחפשים, התקופה שנבחרה **לא רלוונטית**.
   *
   *  אם אתה מחפש לקוח, אתה רוצה למצוא אותו - לא לגלות
   *  שהוא לא נמצא כי במקרה אתה עומד על טאב של חודש שעבר.
   *  לכן בחיפוש הרשימה נבנית מכל הזמנים.
   *
   *  המונים והקמפיינים למעלה ממשיכים להציג את התקופה
   *  שבחרת, כי הם מדדי ביצוע ולא כלי איתור.
   */
  const q = query.trim();
  const searching = q.length > 0;

  const [registered, buyers, saleChannels, saleEntries, normalLeads] =
    await Promise.all([
    db.salesCampaign.findMany({ orderBy: { createdAt: "desc" } }),
    db.leadBuyer.findMany({ orderBy: { name: "asc" } }),
    /**
     * ערוצי המכירה הם יחידת הספירה החדשה, לצד הקמפיינים
     * הוותיקים. בלעדיהם לידים שנכנסים דרך ערוץ לא נספרים.
     */
    db.channel
      .findMany({
        where: { isSale: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, pricePerLead: true, active: true },
      })
      .catch(
        () =>
          [] as Array<{
            id: string;
            name: string;
            pricePerLead: number;
            active: boolean;
          }>
      ),
    db.leadEntry.findMany({
      where: { isSale: true },
      orderBy: { at: "desc" },
      // בחיפוש סורקים רחב יותר, כי מחפשים בכל הזמנים
      take: searching ? 20000 : 2000,
      include: {
        lead: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            status: true,
            extra: true,
          },
        },
        /**
         * שם הערוץ, כתווית גיבוי.
         *
         * ליד שנכנס מהחיבור הישיר לפייסבוק מגיע בלי שם
         * קמפיין (פייסבוק שולחת מזהים, והשם מגיע רק אם
         * חשבון המודעות משויך). בלי הגיבוי הזה השורה
         * נראית בלי שום שיוך, כאילו היא לא שייכת לאף אחד.
         */
        channelRef: { select: { name: true } },
      },
    }),
    db.lead.findMany({
      where: { origin: "leadmanager" },
      select: { extra: true },
      take: 3000,
    }),
  ]);

  const buyerById = new Map(buyers.map((b) => [b.id, b]));

  // ---- צבירה לפי קמפיין ----
  const byCampaign = new Map<
    string,
    {
      month: number;
      billableMonth: number;
      total: number;
      existingMonth: number;
      excludedMonth: number;
      /** סכום המחירים שנחתמו על הכניסות עצמן */
      revenueMonth: number;
    }
  >();

  const entries: SaleEntryRow[] = [];

  /**
   * ============================================================
   *  הסך הכולל נספר מהכניסות עצמן
   * ============================================================
   *
   *  **למה זה לא סכום של שורות הקמפיינים.**
   *
   *  קודם הסך הכולל היה סכימה של שורות הקמפיינים הרשומים.
   *  המשמעות: כל כניסת מכירה שלא השתייכה לשורה כלשהי - ליד
   *  שהותאם לפי טופס בלי קמפיין רשום, ליד בלי שם, ליד מערוץ
   *  שנמחק - פשוט לא נספרה. היא הופיעה ברשימה מתחת, אבל לא
   *  במונה מעליה.
   *
   *  זה הכשל שהחזיר את עצמו: כל פעם שנוסף מסלול כניסה חדש,
   *  המונה נתקע שוב, כי הוא תמיד תיאר את מה שהצלחנו לסווג
   *  ולא את מה שבאמת נכנס.
   *
   *  מכאן הסך הכולל נספר ישירות מכל כניסת מכירה בטווח. פירוק
   *  לפי קמפיין וערוץ נשאר למטה בתור פירוט, אבל הוא כבר לא
   *  זה שקובע את הסכום - ולכן אי אפשר יותר "לאבד" ליד.
   */
  let allMonth = 0;
  let allRevenueMonth = 0;
  let allTotal = 0;
  for (const entry of saleEntries) {
    /**
     * המפתח: ערוץ אם יש, אחרת שם הקמפיין.
     *
     * כאן היה באג שהשתיק את כל הספירה. ליד שנכנס דרך ערוץ
     * מגיע בלי שם קמפיין, קיבל מפתח ריק, ולא נספר באף שורה
     * - והמונה למעלה נתקע בזמן שהלידים כן הופיעו ברשימה
     * מתחתיו. ספירה שלא זזה כשנכנסים לידים היא הדרך הכי
     * מהירה לאבד אמון במספרים.
     *
     * כניסה ותיקה נשארת על מפתח הקמפיין שלה (channelId ריק
     * אצלה), ולכן אף ליד לא נספר פעמיים ואף מספר היסטורי
     * לא משתנה.
     */
    const key = entry.channelId
      ? `ch:${entry.channelId}`
      : entry.campaign
      ? normalizeName(entry.campaign)
      : "";
    const row = byCampaign.get(key) ?? {
      month: 0,
      billableMonth: 0,
      total: 0,
      existingMonth: 0,
      excludedMonth: 0,
      revenueMonth: 0,
    };

    const existing = isExistingCustomer(
      entry.lead?.extra,
      entry.lead?.status
    );
    const billable = entry.billable !== false;

    row.total++;
    allTotal++;

    if (entry.at >= from && entry.at < to) {
      row.month++;

      /**
       * הספירה הכוללת, בלי תלות בסיווג. אם הכניסה בטווח -
       * היא נספרת, נקודה.
       */
      allMonth++;
      if (billable) allRevenueMonth += Number(entry.price ?? 0);

      if (billable) {
        row.billableMonth++;
        row.revenueMonth += Number(entry.price ?? 0);
      } else row.excludedMonth++;
      if (existing) row.existingMonth++;
    }
    byCampaign.set(key, row);

    /**
     * הרשימה מציגה **רק את הטווח שנבחר**.
     *
     * כאן היה הבאג: הטווח סינן את המונים למעלה אבל לא את
     * הרשימה עצמה, ולכן לחיצה על "החודש" שינתה את המספרים
     * ולא את מה שמופיע מתחתם.
     */
    const inRange = entry.at >= from && entry.at < to;

    /**
     * בחיפוש - ההתאמה קובעת, לא התאריך.
     * בלי חיפוש - הטווח קובע, כרגיל.
     */
    const show = searching
      ? entry.lead
        ? matchesQuery(entry, entry.lead, q)
        : false
      : inRange;

    if (show && entries.length < 300 && entry.lead) {
      entries.push({
        id: entry.id,
        leadId: entry.lead.id,
        name:
          `${entry.lead.firstName ?? ""} ${entry.lead.lastName ?? ""}`.trim() ||
          entry.lead.phone,
        phone: entry.lead.phone,
        email:
          entry.lead.extra &&
          typeof entry.lead.extra === "object" &&
          !Array.isArray(entry.lead.extra)
            ? ((entry.lead.extra as Record<string, unknown>).email as string) ??
              null
            : null,
        /**
         * שם הקמפיין אם יש, אחרת שם הערוץ. שורה בלי שום
         * תווית לא אומרת לך לאיזה לקוח הליד שייך.
         */
        campaign: entry.campaign ?? entry.channelRef?.name ?? null,
        price: Number(entry.price ?? 0),
        at: entry.at.toISOString(),
        existingCustomer: existing,
        billable,
      });
    }
  }

  const campaigns: CampaignStat[] = registered.map((c) => {
    const row = byCampaign.get(normalizeName(c.name)) ?? {
      month: 0,
      billableMonth: 0,
      total: 0,
      existingMonth: 0,
      excludedMonth: 0,
      revenueMonth: 0,
    };
    const price = Number(c.pricePerLead ?? 0);
    const buyer = c.buyerId ? buyerById.get(c.buyerId) : null;

    return {
      id: c.id,
      name: c.name,
      buyerId: c.buyerId ?? null,
      buyerName: buyer?.name ?? c.buyer ?? null,
      pricePerLead: price,
      matchKeys: c.matchKeys ?? [],
      active: c.active,
      leadsMonth: row.month,
      leadsTotal: row.total,
      existingMonth: row.existingMonth,
      existingPercent:
        row.month > 0
          ? Math.round((row.existingMonth / row.month) * 1000) / 10
          : 0,
      revenueMonth: Math.round(row.billableMonth * price),
      excludedMonth: row.excludedMonth,
    };
  });

  /**
   * שורות הערוצים, לצד שורות הקמפיינים.
   *
   * ההכנסה כאן מחושבת מהמחיר ש**נחתם על הכניסה עצמה** ולא
   * מהמחיר שבערוץ היום. ככה שינוי מחיר בערוץ לא משכתב
   * למפרע חיובים שכבר נסגרו, וליד שנחתם ב-0 נראה כ-0 עד
   * שמשלימים אותו בתחזוקה - במקום להסתיר את הפער.
   */
  for (const channel of saleChannels) {
    const row = byCampaign.get(`ch:${channel.id}`);

    // ערוץ בלי כניסות כלל לא מוסיף שורה ריקה למסך
    if (!row || row.total === 0) continue;

    campaigns.push({
      id: channel.id,
      name: channel.name,
      buyerId: null,
      buyerName: null,
      pricePerLead: Number(channel.pricePerLead ?? 0),
      matchKeys: [],
      active: channel.active,
      leadsMonth: row.month,
      leadsTotal: row.total,
      existingMonth: row.existingMonth,
      existingPercent:
        row.month > 0
          ? Math.round((row.existingMonth / row.month) * 1000) / 10
          : 0,
      revenueMonth: Math.round(row.revenueMonth),
      excludedMonth: row.excludedMonth,
    });
  }

  // ---- צבירה לפי לקוח ----
  const buyerStats: BuyerStat[] = buyers.map((b) => {
    const mine = campaigns.filter((c) => c.buyerId === b.id);
    return {
      id: b.id,
      name: b.name,
      campaigns: mine.length,
      leadsMonth: mine.reduce((s, c) => s + c.leadsMonth, 0),
      revenueMonth: mine.reduce((s, c) => s + c.revenueMonth, 0),
    };
  });

  // ---- קמפיינים שעוד לא נרשמו ----
  const registeredKeys = new Set(registered.map((c) => normalizeName(c.name)));
  const unregisteredCounts = new Map<string, number>();

  for (const lead of normalLeads) {
    const name = campaignOf(lead.extra);
    if (!name) continue;
    if (registeredKeys.has(normalizeName(name))) continue;
    unregisteredCounts.set(name, (unregisteredCounts.get(name) ?? 0) + 1);
  }

  const unregistered = Array.from(unregisteredCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  return {
    campaigns,
    buyers: buyerStats,
    entries,
    /**
     * נספר מהכניסות עצמן ולא מסכימת השורות - ראה ההסבר
     * המלא למעלה. זה מה שמונע מליד להיות בלתי נראה.
     */
    totalMonth: allMonth,
    revenueMonth: allRevenueMonth,
    leadsAllTime: allTotal,
    /**
     * כמה כניסות בטווח לא נכנסו לשום שורת פירוט.
     *
     * מספר גדול מאפס אומר שהפירוט למטה לא מסביר את הסכום
     * למעלה - וזה בדיוק מה שהיה קורה בשקט עד היום. המסך
     * מציג את זה במקום להסתיר.
     */
    unclassifiedMonth: Math.max(
      0,
      allMonth - campaigns.reduce((s, c) => s + c.leadsMonth, 0)
    ),
    unregistered,
    monthLabel: range.label,
    searching,
    query: q,
  };
}
