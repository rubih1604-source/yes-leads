/**
 * ============================================================
 *  האם הקמפיין משתלם
 * ============================================================
 *
 *  עד היום המערכת ידעה כמה לידים נכנסו מכל קמפיין וכמה
 *  נסגרו. מה שחסר היה צד ההוצאה - וכמה ששתי הצלעות האחרות
 *  מעניינות, בלעדיו אי אפשר לענות על השאלה היחידה שחשובה:
 *
 *    **כמה שילמתי על כל סגירה, ומה נשאר לי ממנה.**
 *
 *  קמפיין שמביא הרבה לידים זולים שלא נסגרים הוא הפסד, גם
 *  אם בדוח הלידים הוא נראה הטוב ביותר. זה בדיוק מה שהחישוב
 *  כאן חושף.
 *
 *  הקובץ טהור - בלי מסד ובלי רשת - כי כל מספר כאן הוא מספר
 *  שתקבל עליו החלטה על כסף.
 */

export type SpendRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions?: number;
  clicks?: number;
  /** מספר הלידים שפייסבוק מדווחת */
  fbLeads?: number;
};

export type LeadRow = {
  /** שם הקמפיין כפי שנשמר על הכניסה */
  campaign: string | null;
  /** האם ההגעה הזו נסגרה */
  closed: boolean;
  /** הכנסה מההגעה: עמלה על סגירה, או המחיר שהקונה משלם */
  revenue: number;
};

export type CampaignResult = {
  campaignId: string | null;
  name: string;
  spend: number;
  leads: number;
  closed: number;
  revenue: number;
  profit: number;
  /** עלות לליד. null כשאין לידים - ולא 0, שהיה נראה כמו "חינם" */
  costPerLead: number | null;
  /** עלות לסגירה. null כשאין סגירות */
  costPerClose: number | null;
  /** אחוז סגירה מתוך הלידים שנקלטו */
  closeRate: number;
  /** לידים שפייסבוק דיווחה ולא נקלטו אצלך */
  missing: number | null;
};

/** השוואה סלחנית, כמו בכל שאר המערכת */
export function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * מחבר הוצאה, לידים והכנסה לשורה אחת לכל קמפיין.
 *
 * ההצלבה נעשית לפי **שם** הקמפיין, כי זה מה שנשמר על
 * הכניסה. קמפיין שיש לו הוצאה ואין לו לידים כן מופיע -
 * זו הדרך היחידה לראות כסף שנשרף בלי להחזיר כלום.
 */
export function combine(
  spend: SpendRow[],
  leads: LeadRow[]
): CampaignResult[] {
  const byKey = new Map<string, CampaignResult>();

  for (const row of spend) {
    const key = normalize(row.campaignName);
    const existing = byKey.get(key);

    if (existing) {
      // אותו קמפיין בכמה ימים או כמה חשבונות - נצבר
      existing.spend = round(existing.spend + row.spend);
      existing.missing = (existing.missing ?? 0) + (row.fbLeads ?? 0);
      continue;
    }

    byKey.set(key, {
      campaignId: row.campaignId,
      name: row.campaignName,
      spend: round(row.spend),
      leads: 0,
      closed: 0,
      revenue: 0,
      profit: 0,
      costPerLead: null,
      costPerClose: null,
      closeRate: 0,
      missing: row.fbLeads ?? null,
    });
  }

  for (const lead of leads) {
    /**
     * ליד בלי שם קמפיין לא נזרק - הוא נאסף לשורה משלו.
     * אחרת לידים שלמים היו נעלמים מהתמונה בשקט.
     */
    const name = lead.campaign?.trim() || "בלי קמפיין";
    const key = normalize(name);

    let row = byKey.get(key);

    if (!row) {
      row = {
        campaignId: null,
        name,
        spend: 0,
        leads: 0,
        closed: 0,
        revenue: 0,
        profit: 0,
        costPerLead: null,
        costPerClose: null,
        closeRate: 0,
        missing: null,
      };
      byKey.set(key, row);
    }

    row.leads++;
    if (lead.closed) row.closed++;
    row.revenue = round(row.revenue + lead.revenue);
  }

  const out: CampaignResult[] = [];

  for (const row of byKey.values()) {
    row.profit = round(row.revenue - row.spend);
    row.costPerLead = row.leads > 0 ? round(row.spend / row.leads) : null;
    row.costPerClose = row.closed > 0 ? round(row.spend / row.closed) : null;
    row.closeRate =
      row.leads > 0 ? round((row.closed / row.leads) * 100, 1) : 0;

    /**
     * פער בין מה שפייסבוק דיווחה למה שנקלט.
     *
     * פער קבוע אומר שלידים לא מגיעים - וזה הדבר הכי יקר
     * שיכול לקרות בשקט.
     */
    row.missing =
      row.missing === null ? null : Math.max(0, row.missing - row.leads);

    out.push(row);
  }

  /** הגרוע ביותר ראשון: שם מתקבלות ההחלטות */
  return out.sort((a, b) => a.profit - b.profit);
}

export type Totals = {
  spend: number;
  leads: number;
  closed: number;
  revenue: number;
  profit: number;
  costPerLead: number | null;
  costPerClose: number | null;
  closeRate: number;
};

export function totalsOf(rows: CampaignResult[]): Totals {
  const spend = round(rows.reduce((s, r) => s + r.spend, 0));
  const leads = rows.reduce((s, r) => s + r.leads, 0);
  const closed = rows.reduce((s, r) => s + r.closed, 0);
  const revenue = round(rows.reduce((s, r) => s + r.revenue, 0));

  return {
    spend,
    leads,
    closed,
    revenue,
    profit: round(revenue - spend),
    costPerLead: leads > 0 ? round(spend / leads) : null,
    costPerClose: closed > 0 ? round(spend / closed) : null,
    closeRate: leads > 0 ? round((closed / leads) * 100, 1) : 0,
  };
}

/**
 * המשפט שצריך לקרוא לפני שמחליטים.
 *
 * לא גרף ולא טבלה - מסקנה אחת בשפה פשוטה, כי זו ההחלטה
 * שבאמת מתקבלת: להגדיל, לסגור, או לבדוק למה.
 */
export function verdictOf(row: CampaignResult): string {
  if (row.spend === 0 && row.leads === 0) return "אין נתונים";

  if (row.spend === 0) {
    return `${row.leads} לידים בלי הוצאה רשומה`;
  }

  if (row.leads === 0) {
    return "שורף כסף בלי להביא לידים";
  }

  if (row.closed === 0) {
    return `${row.leads} לידים, אף סגירה — ${row.spend} ₪ בלי החזר`;
  }

  if (row.profit > 0) {
    return `מרוויח ${row.profit} ₪ · ${row.costPerClose} ₪ לסגירה`;
  }

  return `מפסיד ${Math.abs(row.profit)} ₪ · ${row.costPerClose} ₪ לסגירה`;
}
