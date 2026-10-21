import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { POST as intakeLead } from "../leadmanager/route";
import { supplierKeyForForm } from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  לידים ישירות מפייסבוק
 * ============================================================
 *
 *  פייסבוק שולח כאן הודעה קצרה בכל פעם שמישהו ממלא טופס:
 *  רק מזהה ליד. אנחנו שולפים את הפרטים המלאים מה-Graph API
 *  ומעבירים אותם לאותו מסלול קליטה שליד מנגר משתמש בו.
 *
 *  כך הליד עובר בדיוק את אותו טיפול: זיהוי לקוח קיים,
 *  קמפייני מכירה, לידים כפולים, חוקים ותבניות. אין כאן
 *  היגיון שני שיכול לסטות מהראשון.
 *
 *  משתני סביבה:
 *    FB_VERIFY_TOKEN  - מחרוזת שמטא בודקת כשמגדירים את הכתובת
 *    FB_APP_SECRET    - לאימות שההודעה באמת מפייסבוק
 *    FB_PAGE_TOKEN    - טוקן עם leads_retrieval לשליפת הפרטים
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * אימות הכתובת.
 * מטא שולחת בקשה עם hub.challenge ומצפה לקבל אותו בחזרה.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.FB_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("forbidden", { status: 403 });
}

/** מוודא שההודעה נחתמה בסוד של האפליקציה - כלומר באמת מפייסבוק */
function signatureValid(body: string, header: string | null): boolean {
  const secret = process.env.FB_APP_SECRET?.trim();
  if (!secret) return true; // לא הוגדר סוד - לא בודקים
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const provided = header.slice("sha256=".length);

  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

type GraphLead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
};

/** שולף את הפרטים המלאים של הליד */
/**
 * כל מה שאפשר למשוך על ליד.
 *
 * ליד מנגר מציגה קמפיין, מודעה וקבוצת מודעות - ולכן גם כאן
 * מבקשים את כולם, כולל המזהים ולא רק השמות. מזהה שורד גם
 * כששם המודעה משתנה, וזה מה שיאפשר התאמה אמינה בהמשך.
 */
const FULL_FIELDS = [
  "field_data",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "platform",
  "is_organic",
];

/**
 * רשימה מצומצמת שתמיד עובדת.
 *
 * אם פייסבוק תשנה שם של שדה או תסיר אותו, הבקשה המלאה
 * תיכשל - ואסור שליד יאבד בגלל זה. במקרה כזה מושכים את
 * הבסיס ונכנסים עם מה שיש.
 */
const SAFE_FIELDS = ["field_data", "created_time", "form_id"];

/**
 * שכבת ביניים - המזהים בלי השמות.
 *
 * **זו הנקודה שעלתה בפועל:** שמות הקמפיין, הסט והמודעה
 * דורשים הרשאה על **חשבון המודעות**. כשהחשבון לא משויך,
 * הבקשה המלאה נכשלת - והנפילה הישירה לרשימה המצומצמת
 * זרקה גם את **המזהים**, שכן זמינים בלי אותה הרשאה.
 *
 * התוצאה הייתה ליד בלי שום שיוך: בלי שם, בלי מזהה קמפיין,
 * ובלי דרך להתאים אותו לשום דבר בדיעבד. כאן נשמרים לפחות
 * המזהים, ושם הטופס מגיע מהטבלה המקומית.
 */
const ID_FIELDS = [
  "field_data",
  "created_time",
  "form_id",
  "ad_id",
  "adset_id",
  "campaign_id",
  "platform",
  "is_organic",
];

async function graphLead(
  leadId: string,
  token: string,
  fields: string[]
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(
    `${GRAPH}/${leadId}?fields=${fields.join(",")}&access_token=${encodeURIComponent(
      token
    )}`,
    { cache: "no-store" }
  );

  return {
    ok: response.ok,
    status: response.status,
    body: await response.text().catch(() => ""),
  };
}

async function fetchLead(leadId: string): Promise<GraphLead | null> {
  const token = process.env.FB_PAGE_TOKEN?.trim();
  if (!token) return null;

  let res = await graphLead(leadId, token, FULL_FIELDS);

  /**
   * שדה שפייסבוק לא מכירה מחזיר 400. מנסים שוב עם הבסיס,
   * כדי שהליד ייכנס גם אם חלק מהמידע השיווקי לא זמין.
   */
  if (!res.ok && res.status === 400) {
    /**
     * קודם מנסים את שכבת הביניים - המזהים בלי השמות.
     *
     * רק אם גם היא נכשלת יורדים לרשימה המצומצמת. סדר הנפילה
     * הזה הוא מה שמבדיל בין ליד עם שיוך חלקי לליד בלי שום
     * שיוך.
     */
    res = await graphLead(leadId, token, ID_FIELDS);

    if (!res.ok && res.status === 400) {
      res = await graphLead(leadId, token, SAFE_FIELDS);
    }
  }

  if (!res.ok) {
    throw new Error(`Graph ${res.status}: ${res.body.slice(0, 300)}`);
  }

  return JSON.parse(res.body) as GraphLead;
}

/**
 * ממיר את הליד של פייסבוק לשמות השדות שהקליטה מכירה.
 *
 * שאלת הספק היא שאלה מותאמת בטופס, ושמה הוא הטקסט של
 * השאלה. מזהים אותה לפי מילות מפתח ומעבירים כ-supplier_question,
 * כדי שזיהוי הלקוח הקיים יעבוד בדיוק כמו היום.
 */
function toIntakePayload(lead: GraphLead): Record<string, string> {
  const out: Record<string, string> = {};

  for (const field of lead.field_data ?? []) {
    const value = (field.values ?? []).join(", ").trim();
    if (!value) continue;

    out[field.name] = value;

    if (!out.supplier_question && /ספק|supplier|provider|חברה/i.test(field.name)) {
      out.supplier_question = value;
    }
  }

  if (lead.campaign_name) out.fb_campaign = lead.campaign_name;
  if (lead.ad_name) out.fb_ad = lead.ad_name;
  if (lead.adset_name) out.fb_adset = lead.adset_name;
  if (lead.form_id) out.fb_form = lead.form_id;
  if (lead.platform) out.fb_platform = lead.platform;

  /**
   * גם המזהים, לא רק השמות. שם מודעה אפשר לשנות, מזהה לא -
   * וזה מה שמאפשר לשייך ליד לקמפיין בוודאות גם חודשים אחרי.
   */
  if (lead.campaign_id) out.fb_campaign_id = lead.campaign_id;
  if (lead.ad_id) out.fb_ad_id = lead.ad_id;
  if (lead.adset_id) out.fb_adset_id = lead.adset_id;
  if (lead.is_organic) out.fb_organic = "כן";

  out.fb_leadid = lead.id;

  // סימון המקור, כדי שביומן הקליטה יהיה ברור מאיפה הגיע
  out._source = "facebook";

  return out;
}

type LeadgenChange = {
  field?: string;
  value?: { leadgen_id?: string; page_id?: string; form_id?: string };
};

export async function POST(request: Request) {
  const body = await request.text().catch(() => "");

  /**
   * ============================================================
   *  קודם רושמים, אחר כך בודקים
   * ============================================================
   *
   *  קודם הבדיקה רצה ראשונה, וכשחתימה לא תאמה הבקשה נדחתה
   *  **בלי להשאיר זכר**. התוצאה: ביומן הקליטה לא הופיע כלום,
   *  ואי אפשר היה להבדיל בין "פייסבוק לא שלחה" לבין "פייסבוק
   *  שלחה ואנחנו דחינו".
   *
   *  מעכשיו כל פנייה נרשמת מיד. אם היא נדחית - רואים את זה
   *  ביומן עם הסיבה.
   */
  let raw: unknown = body;
  try {
    raw = JSON.parse(body);
  } catch {
    raw = { _body: body.slice(0, 2000) };
  }

  const log = await db.webhookLog
    .create({
      data: {
        source: "facebook",
        rawPayload: raw as never,
      },
    })
    .catch(() => null);

  if (!signatureValid(body, request.headers.get("x-hub-signature-256"))) {
    /**
     * חתימה שגויה כמעט תמיד אומרת ש-FB_APP_SECRET לא תואם
     * לסוד של האפליקציה. הפנייה אמיתית - רק האימות נכשל.
     */
    if (log) {
      await db.webhookLog
        .update({
          where: { id: log.id },
          data: {
            error:
              "החתימה לא תאמה - בדוק ש-FB_APP_SECRET ברנדר זהה לסוד של האפליקציה בפייסבוק",
          },
        })
        .catch(() => null);
    }

    return new Response("bad signature", { status: 401 });
  }

  let parsed: { entry?: Array<{ changes?: LeadgenChange[] }> } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: true, ignored: "not json" });
  }

  /**
   * שומרים גם את מזהה הטופס שההתראה עצמה נושאת.
   *
   * למה זה קריטי: שם הקמפיין נמשך מה-Graph API ומגיע רק
   * עם הרשאה לחשבון המודעות. מזהה הטופס מגיע **תמיד**,
   * כבר בהתראה. הוא מה שמאפשר לדעת שהליד שייך לקונה גם
   * כשאין שם קמפיין - ולכן הוא לא נזרק.
   */
  const leadIds: Array<{ id: string; formId: string | null }> = [];

  for (const entry of parsed.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        leadIds.push({
          id: change.value.leadgen_id,
          formId: change.value.form_id ?? null,
        });
      }
    }
  }

  const intakeToken = process.env.LEADMANAGER_WEBHOOK_TOKEN?.trim() ?? "";
  const base = process.env.APP_URL?.trim() || "https://localhost";

  for (const { id: leadId, formId } of leadIds) {
    try {
      const lead = await fetchLead(leadId);

      if (!lead) {
        await db.webhookLog
          .create({
            data: {
              source: "facebook",
              rawPayload: { leadgen_id: leadId, _error: "חסר FB_PAGE_TOKEN" },
              error: "חסר FB_PAGE_TOKEN - אי אפשר לשלוף את הליד",
            },
          })
          .catch(() => null);
        continue;
      }

      /**
       * מעשירים את שורת היומן בפרטים שנמשכו.
       *
       * פייסבוק שולחת רק מזהים, ולכן השורה נראתה ריקה
       * מתוכן ולא היה ברור אם הליד באמת נמשך. עכשיו
       * רואים באותה שורה גם מה הגיע וגם מה קיבלנו.
       */
      const details = toIntakePayload(lead);

      // מזהה הטופס מההתראה, אם השליפה לא החזירה אותו
      if (!details.fb_form && formId) details.fb_form = formId;

      /**
       * שאלת הספק, כשנבחרה במפורש לטופס הזה.
       *
       * ברירת המחדל היא זיהוי לפי מילות מפתח בשם השאלה,
       * וזה עובד - אבל שאלה שנוסחה אחרת נופלת ממנו.
       * בחירה מפורשת גוברת.
       */
      const chosen = await supplierKeyForForm(details.fb_form).catch(
        () => null
      );

      if (chosen && details[chosen]) {
        details.supplier_question = details[chosen];
      }

      if (log) {
        await db.webhookLog
          .update({
            where: { id: log.id },
            data: {
              rawPayload: {
                התראה_מפייסבוק: raw,
                פרטי_הליד_שנמשכו: details,
              } as never,
            },
          })
          .catch(() => null);
      }

      // אותו מסלול קליטה בדיוק כמו ליד מנגר
      await intakeLead(
        new Request(`${base}/api/webhooks/leadmanager?token=${encodeURIComponent(intakeToken)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(details),
        })
      );
    } catch (err) {
      await db.webhookLog
        .create({
          data: {
            source: "facebook",
            rawPayload: { leadgen_id: leadId },
            error: err instanceof Error ? err.message.slice(0, 500) : "שגיאה",
          },
        })
        .catch(() => null);
    }
  }

  /**
   * מסמנים את הרשומה כמעובדת, כדי שביומן הקליטה היא תופיע
   * ירוקה ולא כ"התקבל, לא עובד".
   */
  if (log) {
    await db.webhookLog
      .update({
        where: { id: log.id },
        data: {
          processed: true,
          error:
            leadIds.length === 0
              ? "הפנייה הגיעה אבל לא היה בה ליד (לא אירוע leadgen)"
              : null,
        },
      })
      .catch(() => null);
  }

  /**
   * תמיד 200. אם נחזיר שגיאה, פייסבוק ינסה שוב ושוב ובסוף
   * ינתק את המנוי. שגיאות נרשמות ביומן הקליטה.
   */
  return NextResponse.json({ ok: true, received: leadIds.length });
}
