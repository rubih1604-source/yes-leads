import { db } from "./db";
import { normalizePhone } from "./phone";
import { pageTokens } from "./facebook-sources";
import { mineKey } from "./lead-by-phone";

/**
 * ============================================================
 *  מה פייסבוק אומרת שהיא שלחה, מול מה שבאמת אצלנו
 * ============================================================
 *
 *  **למה זה קיים.** "קלטתי שיש ליד שלא נכנס אלינו למרות
 *  שהוא היה ברשימת הלידים בקמפיין בפייסבוק, והפסדתי
 *  כסף עליו."
 *
 *  הגנו על כל נקודת כשל שאנחנו מכירים: הקליטה נבדקת,
 *  ליד בלי טלפון מתריע, שגיאה פותחת התראה. אבל כל אלה
 *  מניחים **שההתראה מפייסבוק בכלל הגיעה**. אם מטא לא
 *  שלחה אותה, או שהשרת היה למטה באותו רגע, אין שום דרך
 *  לדעת שהליד קיים.
 *
 *  כאן שואלים את פייסבוק ישירות: תני לי את הלידים של
 *  הטופס. כל ליד שיש אצלה ואין אצלנו - הוא הפער.
 *
 *  `/{form_id}/leads` הוא נכס של העמוד, ולכן טוקן העמוד
 *  מספיק - בלי קשר לחשבון המודעות.
 *
 *  **המודול הזה הוא המקום היחיד שמחזיק את ההשוואה.**
 *  גם הפעולה הידנית וגם הבדיקה האוטומטית של המנוע
 *  קוראות לו, ולכן אין שתי גרסאות שיכולות לסטות.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const DEFAULT_DAYS = 7;

type GraphLead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values: string[] }>;
};

function phoneOf(lead: GraphLead): string {
  for (const field of lead.field_data ?? []) {
    const name = (field.name ?? "").toLowerCase();
    if (/phone|מספר|טלפון|נייד/.test(name)) {
      const value = (field.values ?? [])[0] ?? "";
      const phone = normalizePhone(value);
      if (phone) return phone;
    }
  }

  /** לפעמים הטלפון יושב בשדה שלא נקרא "טלפון" */
  for (const field of lead.field_data ?? []) {
    const phone = normalizePhone((field.values ?? [])[0] ?? "");
    if (phone) return phone;
  }

  return "";
}

function valueOf(lead: GraphLead, pattern: RegExp): string {
  for (const field of lead.field_data ?? []) {
    if (pattern.test((field.name ?? "").toLowerCase())) {
      return (field.values ?? [])[0] ?? "";
    }
  }
  return "";
}

/** הטפסים שראינו לידים מהם, כדי לא לדרוש רשימה ידנית */
async function knownForms(days: number): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const leads = await db.lead
    .findMany({
      where: { createdAt: { gte: since } },
      select: { extra: true },
      take: 2000,
    })
    .catch(() => []);

  const forms = new Set<string>();

  for (const lead of leads) {
    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, unknown>)
        : {};

    const form = extra.fb_form;
    if (typeof form === "string" && form.trim()) forms.add(form.trim());
  }

  /** טפסים שהוגדרו במפורש במערכת גוברים ומתווספים */
  const configured = await db.leadForm
    .findMany({ select: { formId: true } })
    .catch(() => []);

  for (const row of configured) {
    if (row.formId) forms.add(row.formId);
  }

  return Array.from(forms);
}

export type Missing = {
  leadgenId: string;
  phone: string;
  name: string;
  email: string;
  formId: string;
  at: string;
};

export async function findGap(days: number) {
  /**
   * **כל החשבונות, לא רק הראשון.** אם נוסף חשבון פייסבוק
   * שני, הטפסים שלו לא ייענו לטוקן של הראשון - ובלי
   * לנסות את שניהם, רשת הביטחון הזו פשוט לא מכסה את
   * החשבון החדש. כלומר לידים חסרים שם לא היו מתגלים.
   */
  const tokens = pageTokens();

  if (tokens.length === 0) {
    return { error: "אין טוקן עמוד מוגדר בשרת", forms: [], missing: [] as Missing[], checked: 0 };
  }

  const forms = await knownForms(days);

  if (forms.length === 0) {
    return {
      error:
        "לא זוהה אף טופס. ליד אחד לפחות צריך להיכנס עם מזהה טופס, או להגדיר טופס במסך הטפסים.",
      forms: [],
      missing: [] as Missing[],
      checked: 0,
    };
  }

  const since = Math.floor(
    (Date.now() - days * 24 * 60 * 60 * 1000) / 1000
  );

  const missing: Missing[] = [];
  let checked = 0;
  let firstError = "";

  for (const formId of forms) {
    /**
     * הטופס שייך לחשבון אחד; הטוקן של האחר יחזיר שגיאה.
     * לכן מנסים אחד-אחד עד שאחד עונה.
     */
    let payload: { data?: GraphLead[] } | null = null;

    for (const token of tokens) {
      const url =
        `${GRAPH}/${formId}/leads` +
        `?fields=id,created_time,field_data&limit=200&filtering=` +
        encodeURIComponent(
          JSON.stringify([
            { field: "time_created", operator: "GREATER_THAN", value: since },
          ])
        ) +
        `&access_token=${encodeURIComponent(token)}`;

      const response = await fetch(url, { cache: "no-store" }).catch(() => null);

      if (!response || !response.ok) {
        const body = await response?.text().catch(() => "");
        if (!firstError) {
          try {
            const parsed = JSON.parse(body ?? "") as {
              error?: { message?: string };
            };
            firstError = (parsed.error?.message ?? body ?? "").slice(0, 300);
          } catch {
            firstError = (body ?? "שגיאה").slice(0, 300);
          }
        }
        continue;
      }

      payload = (await response.json().catch(() => null)) as {
        data?: GraphLead[];
      } | null;

      /** הצליח - אין צורך בטוקנים הנוספים */
      break;
    }

    if (!payload) continue;

    for (const lead of payload?.data ?? []) {
      checked++;

      const phone = phoneOf(lead);

      /**
       * קודם לפי מזהה הליד בפייסבוק, ורק אחריו לפי
       * טלפון. מזהה הוא ודאי; טלפון יכול להיות של ליד
       * אחר לגמרי שנכנס מערוץ אחר.
       */
      const byId = await db.lead
        .findFirst({
          where: { extra: { path: ["fb_leadid"], equals: lead.id } },
          select: { id: true },
        })
        .catch(() => null);

      if (byId) continue;

      /**
       * "כבר קיים" נבדק **בערוץ שלך**.
       *
       * קודם זו הייתה בדיקה על הטלפון בלבד: ליד שקיים אצל
       * המכירה נחשב "כבר נקלט", והליד שלך מאותו קמפיין לא
       * יובא מעולם. בדיוק הליד שהיה ברשימה בפייסבוק ולא
       * הגיע אליך.
       */
      const byPhone = phone
        ? await db.lead
            .findFirst({ where: mineKey(phone), select: { id: true } })
            .catch(() => null)
        : null;

      if (byPhone) continue;

      missing.push({
        leadgenId: lead.id,
        phone,
        name:
          `${valueOf(lead, /first_name|full_name|שם/)} ${valueOf(lead, /last_name|משפחה/)}`.trim(),
        email: valueOf(lead, /email|מייל|דוא/),
        formId,
        at: lead.created_time ?? "",
      });
    }
  }

  return { error: firstError || null, forms, missing, checked };
}


/**
 * ייבוא הלידים שחסרים.
 *
 * עובר דרך **אותו מסלול קליטה** של כל ליד אחר - ולא
 * יוצר ליד בעצמו. ליד שנכנס בדרך צדדית היה מפספס את
 * האוטומציות, את ההתראה ואת השיוך לערוץ.
 */
export async function importMissing(missing: Missing[]): Promise<{
  imported: number;
  failed: number;
  problems: string[];
}> {
  const intakeToken = process.env.LEADMANAGER_WEBHOOK_TOKEN?.trim() ?? "";
  const base = process.env.APP_URL?.trim() || "https://localhost";

  const { POST: intakeLead } = await import(
    "../app/api/webhooks/leadmanager/route"
  );

  let imported = 0;
  let failed = 0;
  const problems: string[] = [];

  for (const row of missing) {
    if (!row.phone) {
      failed++;
      problems.push(`${row.name || row.leadgenId}: אין טלפון בטופס`);
      continue;
    }

    const [first, ...rest] = row.name.split(" ").filter(Boolean);

    const response = await intakeLead(
      new Request(
        `${base}/api/webhooks/leadmanager?token=${encodeURIComponent(intakeToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phone: row.phone,
            first_name: first ?? "",
            last_name: rest.join(" "),
            email: row.email,
            fb_leadid: row.leadgenId,
            fb_form: row.formId,
            /** מסומן, כדי שיהיה ברור שהוא הושלם ולא נקלט בזמן */
            fb_recovered: "הושלם בבדיקת פערים",
          }),
        }
      )
    ).catch(() => null);

    const body = (await response?.json().catch(() => ({}))) as {
      warning?: string;
      error?: string;
    };

    if (response?.ok && !body.warning && !body.error) {
      imported++;
    } else {
      failed++;
      problems.push(
        `${row.name || row.leadgenId}: ${body.error ?? body.warning ?? "הקליטה דחתה"}`
      );
    }
  }

  return { imported, failed, problems };
}

/**
 * כל כמה דקות המנוע בודק פערים לבד.
 *
 * **היה 120.** ליד שנפל בין פייסבוק לבינינו היה יכול
 * לשבת שעתיים לפני שמישהו ידע עליו - וליד שמחכה שעתיים
 * כבר דיבר עם מישהו אחר. חצי שעה היא איזון בין "מהר
 * מספיק כדי להתקשר" לבין כמות הקריאות לפייסבוק.
 */
export const GAP_CHECK_EVERY_MINUTES = 30;
