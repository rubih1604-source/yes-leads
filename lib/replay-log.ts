/**
 * ============================================================
 *  שחזור לידים שהגיעו, נרשמו ביומן, ולא הופיעו ברשימה
 * ============================================================
 *
 *  **מה שזה פותר.**
 *
 *  יומן הקליטה שומר **כל** בקשה שהגיעה, גולמית, עוד לפני
 *  שהמערכת עשתה איתה משהו. לכן ליד שנכנס ולא הופיע אצלך
 *  לא אבד - הוא יושב שם, שלם, עם כל השדות שפייסבוק שלחה.
 *
 *  זה בדיוק מה שראית: חיפשת מספר ביומן הקליטה והוא היה
 *  שם, אבל ברשימת הלידים הוא לא הופיע. הבקשה הגיעה;
 *  ההכרעה עליה הייתה שגויה.
 *
 *  ============================================================
 *   איך השחזור עובד, ולמה הוא בטוח
 *  ============================================================
 *
 *  הוא **לא** יוצר לידים בעצמו. הוא לוקח את המטען הגולמי
 *  מהיומן ומעביר אותו שוב דרך **אותה דלת קליטה** שכל ליד
 *  עובר בה. כלומר: אין כאן מנגנון שני ליצירת לידים שיכול
 *  להיפרד מהראשון - יש כאן שידור חוזר.
 *
 *  לפני כל שידור הוא בודק אם כבר קיים ליד עם אותו מספר
 *  **באותו ערוץ**. קיים - מדלגים. ככה שחזור לא יכול
 *  להכפיל שום דבר, וגם הרצה חוזרת שלו לא תעשה נזק.
 *
 *  **התאריך נשמר.** אחרי השחזור תאריך הכניסה מוחזר לזמן
 *  האמיתי שבו הליד הגיע, ולא לזמן השחזור - אחרת הדוחות,
 *  החיובים ותמונת הקמפיין היו משקרים.
 */

import type { LeadIdentifiers } from "./campaign-match";

export type MissingLead = {
  logId: string;
  phone: string;
  name: string;
  at: Date;
  /** לאיזה ערוץ הוא שייך לפי הכללים הנוכחיים */
  channel: "mine" | "sale";
  /** למה הוא שויך לשם */
  matchedOn: string;
  campaign: string | null;
};

export type ScanResult = {
  scanned: number;
  missing: MissingLead[];
  error?: string;
};

/** כמה ימים אחורה סורקים כברירת מחדל */
export const DEFAULT_DAYS = 30;

/**
 * סורק את יומן הקליטה ומחזיר כל הגעה שאין לה ליד.
 *
 * לא משנה כלום - זו בדיקה בלבד.
 */
export async function scanMissing(days = DEFAULT_DAYS): Promise<ScanResult> {
  const { db } = await import("./db");
  const { mapLeadManagerPayload } = await import("./leadmanager-mapping");
  const { normalizePhone } = await import("./phone");
  const { identifiersOf } = await import("./campaign-match");
  const { traceClaim } = await import("./claim-trace");

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs = await db.webhookLog
    .findMany({
      where: {
        createdAt: { gte: since },
        /** וואטסאפ אינו הגעת ליד, ולכן מחוץ לסריקה */
        source: { in: ["leadmanager", "facebook"] },
      },
      orderBy: { createdAt: "asc" },
      take: 5000,
    })
    .catch(() => []);

  const missing: MissingLead[] = [];

  /** מונע בדיקה חוזרת של אותו צמד בתוך אותה סריקה */
  const checked = new Set<string>();

  for (const log of logs) {
    const raw = log.rawPayload as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") continue;

    let phone: string | null = null;
    let name = "";
    let ids: LeadIdentifiers = {};

    try {
      const mapped = mapLeadManagerPayload(raw);
      phone = normalizePhone(mapped.phone);
      name = [mapped.firstName, mapped.lastName].filter(Boolean).join(" ");
      /**
       * המזהים נקראים מהמטען הגולמי עצמו - שם יושבים
       * `fb_form`, `fb_campaign_id` וחבריהם, בדיוק כמו
       * שהקליטה קוראת אותם.
       */
      ids = identifiersOf(raw as Record<string, unknown>);
    } catch {
      continue;
    }

    /**
     * בלי טלפון אין ליד ואין מה לשחזר.
     *
     * אלה בדרך כלל הודעות אימות של פייסבוק ובדיקות, ולא
     * הגעות אמיתיות.
     */
    if (!phone) continue;

    const trace = await traceClaim(ids).catch(() => null);
    const channel = trace?.owner ?? "mine";

    const key = `${phone}|${channel}`;
    if (checked.has(key)) continue;
    checked.add(key);

    const exists = await db.lead
      .findFirst({ where: { phone, channel }, select: { id: true } })
      .catch(() => null);

    if (exists) continue;

    missing.push({
      logId: log.id,
      phone,
      name: name || "ללא שם",
      at: log.createdAt,
      channel,
      matchedOn: trace?.matchedOn ?? "ללא התאמה - נשאר אצלך",
      campaign:
        typeof (raw as Record<string, unknown>).fb_campaign === "string"
          ? ((raw as Record<string, unknown>).fb_campaign as string)
          : null,
    });
  }

  return { scanned: logs.length, missing };
}

export type RecoverResult = {
  recovered: number;
  skipped: number;
  problems: string[];
};

/**
 * משדר מחדש את ההגעות החסרות דרך דלת הקליטה הרגילה.
 *
 * `logIds` מצמצם לשורות מסוימות; בלעדיו משחזרים את כל מה
 * שהסריקה מצאה.
 */
export async function recoverMissing(args: {
  days?: number;
  logIds?: string[];
}): Promise<RecoverResult> {
  const { db } = await import("./db");

  const scan = await scanMissing(args.days ?? DEFAULT_DAYS);

  const wanted = args.logIds?.length
    ? scan.missing.filter((m) => args.logIds!.includes(m.logId))
    : scan.missing;

  if (wanted.length === 0) {
    return { recovered: 0, skipped: 0, problems: [] };
  }

  const { POST: intakeLead } = await import(
    "../app/api/webhooks/leadmanager/route"
  );

  const token = process.env.LEADMANAGER_WEBHOOK_TOKEN?.trim() ?? "";
  const base = process.env.APP_URL?.trim() || "https://localhost";

  let recovered = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const row of wanted) {
    const log = await db.webhookLog
      .findUnique({ where: { id: row.logId }, select: { rawPayload: true } })
      .catch(() => null);

    if (!log?.rawPayload) {
      skipped++;
      continue;
    }

    /**
     * המטען המקורי, מילה במילה, ועוד סימון אחד.
     *
     * הסימון נשמר על הכניסה ומאפשר לראות אחר כך שהליד
     * הזה הושלם בדיעבד ולא נקלט בזמן אמת.
     */
    const payload = {
      ...(log.rawPayload as Record<string, unknown>),
      _recovered: "שוחזר מיומן הקליטה",
    };

    const response = await intakeLead(
      new Request(
        `${base}/api/webhooks/leadmanager?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
    ).catch(() => null);

    const body = (await response?.json().catch(() => ({}))) as {
      warning?: string;
      error?: string;
    };

    if (!response?.ok || body.warning || body.error) {
      skipped++;
      problems.push(
        `${row.name} (${row.phone}): ${body.error ?? body.warning ?? "נדחה"}`
      );
      continue;
    }

    /**
     * ============================================================
     *  מחזירים את התאריך האמיתי
     * ============================================================
     *
     *  הקליטה חותמת "עכשיו", כי מבחינתה הליד נכנס עכשיו.
     *  אבל הוא נכנס לפני שבוע, ואם נשאיר את עכשיו - הוא
     *  יקפוץ לראש הרשימה עם תאריך שקרי, והדוח של הקמפיין
     *  יראה הגעה ביום הלא נכון.
     */
    const lead = await db.lead
      .findFirst({
        where: { phone: row.phone, channel: row.channel },
        select: { id: true },
      })
      .catch(() => null);

    if (lead) {
      await db.lead
        .update({ where: { id: lead.id }, data: { intakeAt: row.at } })
        .catch(() => null);

      await db.leadEntry
        .updateMany({
          where: { leadId: lead.id },
          data: { at: row.at },
        })
        .catch(() => null);
    }

    recovered++;
  }

  if (recovered > 0) {
    await db.alert
      .create({
        data: {
          title: `שוחזרו ${recovered} לידים שלא הופיעו`,
          body: `הגעות שהיו ביומן הקליטה ולא נוצר להן ליד. הם ברשימה לפי תאריך ההגעה האמיתי שלהם, לא לפי היום.`,
        },
      })
      .catch(() => null);
  }

  return { recovered, skipped, problems };
}
