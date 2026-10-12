/**
 * ============================================================
 *  למה לקוחות מתחברים ליס - אבל לא דרכך
 * ============================================================
 *
 *  שתי הסצנות שחוזרות:
 *
 *    "דיברתי איתו, שלחתי פולו-אפ למחרת, והוא אמר כבר סגרתי"
 *    "ניסיתי להשיג כמה פעמים, וכשענה אמר כבר התחברתי"
 *
 *  שתיהן אותה בעיה: **הזמן**. הלקוח השאיר פרטים גם אצל
 *  מישהו אחר, ומי שהגיע אליו ראשון סגר.
 *
 *  הקובץ הזה מודד את זה במספרים במקום בתחושה:
 *
 *   1. **חלון ההפסד** - תוך כמה זמן מהכניסה הלידים כבר
 *      אבודים. זה המספר שקובע כמה מהר אתה חייב להגיב.
 *
 *   2. **זמן עד מגע ראשון** - אצל מי שנסגר אצלך מול מי
 *      שנסגר אצל אחר. אם יש פער, זו ההוכחה.
 *
 *   3. **כמה ניסיונות** עשית לפני שהפסדת, מול כמה לפני
 *      שסגרת.
 *
 *   4. **מתי הלידים נכנסים** מול מתי אתה בפועל מגיב.
 *
 *   5. **לפי קמפיין** - איפה אתה מדמם הכי הרבה.
 *
 *  כל המדידות מתבססות על מה שבאמת קרה במערכת: זמן הכניסה,
 *  ההודעות שיצאו, ושינויי הסטטוס.
 */

/**
 * אין כאן import של המסד בראש הקובץ.
 *
 * החישובים כאן הם לוגיקה טהורה, והם נבדקים בבדיקות בלי
 * מסד נתונים. השליפות נטענות בעצלתיים בתוך הפונקציה
 * שבאמת צריכה אותן.
 */
import type { Range } from "./periods";

export type Bucket = { label: string; count: number; percent: number };

export type CampaignLoss = {
  name: string;
  leads: number;
  lost: number;
  won: number;
  lostPercent: number;
};

export type AtRiskLead = {
  id: string;
  name: string;
  phone: string;
  status: string;
  campaign: string | null;
  hoursWaiting: number;
  contacted: boolean;
};

export type CompetitionData = {
  configured: boolean;
  lostStatuses: string[];

  totalLeads: number;
  lost: number;
  won: number;
  lostPercent: number;

  /** תוך כמה זמן מהכניסה הליד כבר אבוד */
  lossWindow: Bucket[];
  /** באיזו שעה מהכניסה כבר הפסדת מחצית מההפסדים */
  halfLostWithinHours: number | null;

  firstTouchWon: number | null;
  firstTouchLost: number | null;
  neverContactedLost: number;

  attemptsWon: number | null;
  attemptsLost: number | null;

  byCampaign: CampaignLoss[];
  atRisk: AtRiskLead[];

  /** שעות שבהן נכנסים הכי הרבה לידים שבסוף הפסדת */
  lossByHour: Array<{ hour: number; count: number }>;
};

const HOUR = 60 * 60 * 1000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * דליי הזמן. הגבולות נבחרו לפי איך שעסקה באמת נסגרת:
 * השעה הראשונה היא קריטית, היום הראשון מכריע, ואחרי
 * שבוע כבר כמעט אין מה להציל.
 */
const WINDOWS: Array<{ label: string; maxHours: number }> = [
  { label: "תוך שעה", maxHours: 1 },
  { label: "1-4 שעות", maxHours: 4 },
  { label: "4-24 שעות", maxHours: 24 },
  { label: "1-3 ימים", maxHours: 72 },
  { label: "3-7 ימים", maxHours: 168 },
  { label: "יותר משבוע", maxHours: Infinity },
];

/**
 * מחלק את שעות ההפסד לדליים.
 *
 * פונקציה טהורה, כדי שאפשר יהיה לבדוק אותה בלי מסד:
 * הגבולות כאן קובעים את המסקנה התפעולית, וטעות בהם
 * תיתן לך SLA שגוי.
 */
export function bucketLossHours(hours: number[]): Bucket[] {
  const counts: number[] = [];
  let lower = -Infinity;

  for (const w of WINDOWS) {
    counts.push(hours.filter((h) => h > lower && h <= w.maxHours).length);
    lower = w.maxHours;
  }

  /**
   * האחוזים חייבים להסתכם ב-100 בדיוק.
   *
   * עיגול רגיל של כל דלי בנפרד נותן 101 או 99, ועל המסך
   * זה נראה כמו טעות. לכן מעגלים כלפי מטה ומחלקים את
   * השארית לדליים שהפסידו הכי הרבה בעיגול.
   */
  const total = hours.length;

  if (total === 0) {
    return WINDOWS.map((w, i) => ({
      label: w.label,
      count: counts[i],
      percent: 0,
    }));
  }

  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);

  const percent = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    percent[i]++;
    remainder--;
  }

  return WINDOWS.map((w, i) => ({
    label: w.label,
    count: counts[i],
    percent: percent[i],
  }));
}

/** תוך כמה שעות מהכניסה כבר הפסדת מחצית מההפסדים */
export function halfLostWithin(hours: number[]): number | null {
  if (hours.length === 0) return null;
  const s = [...hours].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
}

export async function getCompetition(range: Range): Promise<CompetitionData> {
  const [{ db }, { getStatuses }, { getSettings }, { israelParts }] =
    await Promise.all([
      import("./db"),
      import("./status-store"),
      import("./settings"),
      import("./working-hours"),
    ]);

  const [statuses, settings] = await Promise.all([
    getStatuses(),
    getSettings(),
  ]);

  const wonNames = new Set(statuses.filter((s) => s.won).map((s) => s.name));

  /**
   * אילו סטטוסים נחשבים הפסד למתחרה.
   *
   * אם לא הגדרת, מנחשים לפי השם - אבל רק כדי שהמסך לא
   * יהיה ריק. ההגדרה הידנית תמיד עדיפה.
   */
  const configured = settings.lostStatuses.length > 0;
  const lostNames = new Set(
    configured
      ? settings.lostStatuses
      : statuses
          .filter((s) => /משווק|אחר|מתחרה|התחבר/.test(s.name))
          .map((s) => s.name)
  );

  const leads = await db.lead.findMany({
    where: {
      origin: "leadmanager",
      intakeAt: { gte: range.from, lt: range.to },
    },
    select: {
      id: true,
      status: true,
      intakeAt: true,
      firstName: true,
      lastName: true,
      phone: true,
      extra: true,
    },
  });

  const ids = leads.map((l) => l.id);

  const [messages, events] = await Promise.all([
    ids.length
      ? db.message.findMany({
          where: { leadId: { in: ids }, direction: "out" },
          select: { leadId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    ids.length
      ? db.leadEvent.findMany({
          where: { leadId: { in: ids }, type: "status_changed" },
          select: { leadId: true, toStatus: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);

  // ההודעה הראשונה שיצאה, וכמה יצאו בסך הכל
  const firstOut = new Map<string, Date>();
  const outCount = new Map<string, number>();

  for (const m of messages) {
    if (!firstOut.has(m.leadId)) firstOut.set(m.leadId, m.createdAt);
    outCount.set(m.leadId, (outCount.get(m.leadId) ?? 0) + 1);
  }

  // מתי הליד עבר לסטטוס שמסמן הפסד או סגירה
  const lostAt = new Map<string, Date>();
  const wonAt = new Map<string, Date>();

  for (const e of events) {
    if (!e.toStatus) continue;
    if (lostNames.has(e.toStatus) && !lostAt.has(e.leadId)) {
      lostAt.set(e.leadId, e.createdAt);
    }
    if (wonNames.has(e.toStatus) && !wonAt.has(e.leadId)) {
      wonAt.set(e.leadId, e.createdAt);
    }
  }

  const lossHours: number[] = [];
  const firstTouchWonHours: number[] = [];
  const firstTouchLostHours: number[] = [];
  const attemptsWonList: number[] = [];
  const attemptsLostList: number[] = [];
  const lossHourOfDay = new Map<number, number>();

  let lost = 0;
  let won = 0;
  let neverContactedLost = 0;

  const byCampaign = new Map<
    string,
    { leads: number; lost: number; won: number }
  >();

  const atRisk: AtRiskLead[] = [];
  const now = Date.now();

  for (const lead of leads) {
    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, string>)
        : {};
    const campaign = extra.fb_campaign || extra.campaign || "ללא קמפיין";

    const row = byCampaign.get(campaign) ?? { leads: 0, lost: 0, won: 0 };
    row.leads++;

    const isLost = lostNames.has(lead.status);
    const isWon = wonNames.has(lead.status);

    const touch = firstOut.get(lead.id);
    const attempts = outCount.get(lead.id) ?? 0;

    if (isLost) {
      lost++;
      row.lost++;

      const at = lostAt.get(lead.id);
      if (at) {
        const hours = (at.getTime() - lead.intakeAt.getTime()) / HOUR;
        if (hours >= 0) lossHours.push(hours);
      }

      if (touch) {
        const h = (touch.getTime() - lead.intakeAt.getTime()) / HOUR;
        if (h >= 0) firstTouchLostHours.push(h);
      } else {
        neverContactedLost++;
      }

      attemptsLostList.push(attempts);

      const hour = Math.floor(israelParts(lead.intakeAt).minutes / 60);
      lossHourOfDay.set(hour, (lossHourOfDay.get(hour) ?? 0) + 1);
    }

    if (isWon) {
      won++;
      row.won++;

      if (touch) {
        const h = (touch.getTime() - lead.intakeAt.getTime()) / HOUR;
        if (h >= 0) firstTouchWonHours.push(h);
      }

      attemptsWonList.push(attempts);
    }

    byCampaign.set(campaign, row);

    /**
     * בסיכון עכשיו: ליד שעדיין פתוח, עברו עליו יותר מ-4
     * שעות, ועוד לא יצאה אליו שום הודעה. זה הרגע שבו
     * המתחרה מתקשר.
     */
    const open = !isLost && !isWon;
    const waiting = (now - lead.intakeAt.getTime()) / HOUR;

    if (open && waiting >= 4 && waiting <= 24 * 14 && atRisk.length < 100) {
      atRisk.push({
        id: lead.id,
        name:
          `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "ללא שם",
        phone: lead.phone,
        status: lead.status,
        campaign: campaign === "ללא קמפיין" ? null : campaign,
        hoursWaiting: Math.round(waiting),
        contacted: Boolean(touch),
      });
    }
  }

  const lossWindow = bucketLossHours(lossHours);
  const halfLostWithinHours = halfLostWithin(lossHours);

  const campaigns: CampaignLoss[] = Array.from(byCampaign.entries())
    .map(([name, r]) => ({
      name,
      leads: r.leads,
      lost: r.lost,
      won: r.won,
      lostPercent: r.leads ? Math.round((r.lost / r.leads) * 100) : 0,
    }))
    .filter((c) => c.leads >= 3)
    .sort((a, b) => b.lostPercent - a.lostPercent);

  return {
    configured,
    lostStatuses: Array.from(lostNames),
    totalLeads: leads.length,
    lost,
    won,
    lostPercent: leads.length ? Math.round((lost / leads.length) * 100) : 0,
    lossWindow,
    halfLostWithinHours,
    firstTouchWon: median(firstTouchWonHours),
    firstTouchLost: median(firstTouchLostHours),
    neverContactedLost,
    attemptsWon: median(attemptsWonList),
    attemptsLost: median(attemptsLostList),
    byCampaign: campaigns,
    atRisk: atRisk.sort((a, b) => b.hoursWaiting - a.hoursWaiting),
    lossByHour: Array.from(lossHourOfDay.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour),
  };
}
