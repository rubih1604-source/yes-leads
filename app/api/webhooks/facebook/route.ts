import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { POST as intakeLead } from "../leadmanager/route";

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
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
};

/** שולף את הפרטים המלאים של הליד */
async function fetchLead(leadId: string): Promise<GraphLead | null> {
  const token = process.env.FB_PAGE_TOKEN?.trim();
  if (!token) return null;

  const fields = [
    "field_data",
    "created_time",
    "ad_name",
    "adset_name",
    "campaign_name",
    "form_id",
    "is_organic",
  ].join(",");

  const response = await fetch(
    `${GRAPH}/${leadId}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Graph ${response.status}: ${text.slice(0, 300)}`);
  }

  return (await response.json()) as GraphLead;
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

  if (!signatureValid(body, request.headers.get("x-hub-signature-256"))) {
    return new Response("bad signature", { status: 401 });
  }

  let parsed: { entry?: Array<{ changes?: LeadgenChange[] }> } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: true, ignored: "not json" });
  }

  const leadIds: string[] = [];
  for (const entry of parsed.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        leadIds.push(change.value.leadgen_id);
      }
    }
  }

  const intakeToken = process.env.LEADMANAGER_WEBHOOK_TOKEN?.trim() ?? "";
  const base = process.env.APP_URL?.trim() || "https://localhost";

  for (const leadId of leadIds) {
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

      // אותו מסלול קליטה בדיוק כמו ליד מנגר
      await intakeLead(
        new Request(`${base}/api/webhooks/leadmanager?token=${encodeURIComponent(intakeToken)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(toIntakePayload(lead)),
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
   * תמיד 200. אם נחזיר שגיאה, פייסבוק ינסה שוב ושוב ובסוף
   * ינתק את המנוי. שגיאות נרשמות ביומן הקליטה.
   */
  return NextResponse.json({ ok: true, received: leadIds.length });
}
