import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone, displayPhone } from "@/lib/phone";
import { mapInboundMessage } from "@/lib/texter-mapping";
import { cancelPendingJobs } from "@/lib/rules";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * הודעה נכנסת מלקוח, דרך הסנריו של טקסטר.
 *
 * סדר הפעולות קריטי:
 * 1. שומרים גולמי
 * 2. בודקים טוקן
 * 3. **עוצרים את כל מה שמתוזמן ללקוח הזה** - לפני כל דבר אחר
 * 4. שומרים את ההודעה ומתריעים
 */

function queryToObject(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key === "token") continue;
    out[key] = value;
  }
  return out;
}

function tokenIsValid(request: Request): boolean {
  const expected = process.env.TEXTER_WEBHOOK_TOKEN;
  if (!expected) return true;

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-webhook-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token");

  return provided === expected;
}

async function handle(request: Request) {
  const fromQuery = queryToObject(request.url);

  let bodyText = "";
  if (request.method !== "GET") {
    bodyText = await request.text().catch(() => "");
  }

  let fromBody: unknown = null;
  if (bodyText.trim()) {
    try {
      fromBody = JSON.parse(bodyText);
    } catch {
      const params = new URLSearchParams(bodyText);
      const obj: Record<string, string> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      fromBody = Object.keys(obj).length ? obj : { _unparsed: bodyText };
    }
  }

  const raw: Record<string, unknown> = {
    ...fromQuery,
    ...(fromBody && typeof fromBody === "object" ? (fromBody as object) : {}),
    _method: request.method,
    _contentType: request.headers.get("content-type") || "(אין)",
    _bodyLength: String(bodyText.length),
  };

  const log = await db.webhookLog.create({
    data: { source: "texter", rawPayload: raw as Prisma.InputJsonObject },
  });

  if (!tokenIsValid(request)) {
    await db.webhookLog.update({
      where: { id: log.id },
      data: { error: "טוקן שגוי או חסר" },
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const mapped = mapInboundMessage(raw);

    const phone = normalizePhone(mapped.phone);

    /**
     * הודעה יוצאת. שתי אפשרויות:
     * 1. המערכת שלחה אותה - כבר רשומה אצלנו, אין מה לעשות
     * 2. **אתה שלחת אותה ידנית** - נרשמת כדי שתופיע בשיחה.
     *
     * **היא כבר לא משתיקה את הבוט.** ההשתקה הזו היא מה
     * שסתם את הבוט באמצע מבצע: הדיוור עצמו נקרא כתשובה
     * ידנית שלך. בוט הדיוור שואל שאלה אחת וקורא את
     * התשובה - אין סיבה שכתיבה שלך תמנע ממנו את זה.
     */
    if (mapped.isOutgoing) {
      if (phone) {
        const lead = await db.lead.findUnique({ where: { phone } });

        if (lead) {
          const alreadyOurs = mapped.messageId
            ? await db.message.findFirst({
                where: { texterMessageId: mapped.messageId, direction: "out" },
              })
            : null;

          // התאמה גם לפי טקסט, למקרה שהמזהה שונה בין השליחה לאירוע
          const matchedByText =
            !alreadyOurs && mapped.text
              ? await db.message.findFirst({
                  where: {
                    leadId: lead.id,
                    direction: "out",
                    bodyText: mapped.text,
                    createdAt: { gte: new Date(Date.now() - 10 * 60000) },
                  },
                })
              : null;

          /**
           * ============================================================
           *  הד של דיוור שלנו אינו "רובי ענה ידנית"
           * ============================================================
           *
           *  **הכשל שגרם לשתיקה באמצע מבצע.**
           *
           *  ההתאמה נעשתה לפי מזהה או לפי טקסט זהה. דיוור
           *  נשלח כתבנית עם משתנים ולעיתים עם מדיה, והטקסט
           *  שחוזר מטקסטר מרונדר אחרת ממה שנשמר אצלנו -
           *  "היי אושר" מול גוף התבנית הגולמי. שתי הבדיקות
           *  נכשלו.
           *
           *  המערכת הסיקה "רובי ענה ידנית", השתיקה את הבוט
           *  לשעות, ובדיוק בחלון הזה הלקוחות עונים לדיוור.
           *  כלומר **הדיוור עצמו סתם את הבוט**.
           *
           *  לכן: אם יצאה מכאן תבנית או דיוור ללקוח הזה
           *  בדקות האחרונות, ההודעה הזו היא ההד שלה ולא
           *  הודעה שרובי הקליד.
           */
          const ourCampaign =
            !alreadyOurs && !matchedByText
              ? await db.message.findFirst({
                  where: {
                    leadId: lead.id,
                    direction: "out",
                    createdAt: { gte: new Date(Date.now() - 15 * 60000) },
                    OR: [
                      { templateName: { not: null } },
                      { broadcast: true },
                    ],
                  },
                })
              : null;

          if (!alreadyOurs && !matchedByText && !ourCampaign) {
            // אתה ענית ידנית
            await db.message.create({
              data: {
                leadId: lead.id,
                direction: "out",
                bodyText: mapped.text,
                texterMessageId: mapped.messageId,
                status: "sent",
                error: null,
              },
            });

            await db.leadEvent.create({
              data: {
                leadId: lead.id,
                type: "human_reply",
                actor: "user",
                payload: { text: (mapped.text ?? "").slice(0, 200) },
              },
            });

            await db.webhookLog.update({
              where: { id: log.id },
              data: { processed: true, error: "תשובה ידנית שלך - נרשמה" },
            });

            return NextResponse.json({ ok: true, humanReply: true });
          }
        }
      }

      await db.webhookLog.update({
        where: { id: log.id },
        data: { processed: true, error: "הודעה יוצאת של המערכת - דולגה" },
      });
      return NextResponse.json({ ok: true, skipped: "outgoing" });
    }

    if (!phone) {
      await db.webhookLog.update({
        where: { id: log.id },
        data: { error: "לא נמצא מספר טלפון בהודעה" },
      });
      return NextResponse.json({ ok: true, warning: "no phone" });
    }

    // מוצאים את הליד, ואם אין - יוצרים אחד
    let lead = await db.lead.findUnique({ where: { phone } });
    if (!lead) {
      /**
       * מישהו כתב בוואטסאפ בלי שהוא ליד מליד מנגר.
       * נשמר כדי שהשיחה תופיע במסך השיחות, אבל מסומן
       * כ-whatsapp ולכן לא ייכנס לרשימת הלידים.
       */
      lead = await db.lead.create({
        data: {
          phone,
          firstName: mapped.senderName,
          status: "חדש",
          source: "הודעה נכנסת",
          origin: "whatsapp",
        },
      });
      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "lead_created",
          toStatus: lead.status,
          actor: "system",
          payload: { from: "texter-inbound" },
        },
      });
    }

    // *** הדבר הכי חשוב: עוצרים כל רצף פעיל ***
    const cancelled = await cancelPendingJobs(lead.id, "הלקוח ענה");

    // מניעת כפילות אם הסנריו שולח את אותה הודעה פעמיים
    if (mapped.messageId) {
      const existing = await db.message.findFirst({
        where: { texterMessageId: mapped.messageId, direction: "in" },
      });
      if (existing) {
        await db.webhookLog.update({
          where: { id: log.id },
          data: { processed: true, error: "הודעה כפולה - דולגה" },
        });
        return NextResponse.json({ ok: true, skipped: "duplicate" });
      }
    }

    await db.message.create({
      data: {
        leadId: lead.id,
        direction: "in",
        bodyText: mapped.text,
        texterMessageId: mapped.messageId,
        status: "received",
      },
    });

    await db.lead.update({
      where: { id: lead.id },
      data: { lastInboundAt: new Date() },
    });

    await db.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "message_received",
        actor: "system",
        payload: { cancelledJobs: cancelled },
      },
    });

    await db.alert.create({
      data: {
        leadId: lead.id,
        title: "לקוח ענה",
        body: `${lead.firstName ?? displayPhone(lead.phone)}: ${(mapped.text ?? "").slice(0, 200)}`,
      },
    });

    // הסנריו שולח את מזהה הצ'אט - שומרים אותו וחוסכים חיפוש בכל תשובה
    if (mapped.chatId && lead.chatId !== mapped.chatId) {
      await db.lead
        .update({ where: { id: lead.id }, data: { chatId: mapped.chatId } })
        .catch(() => null);
      lead.chatId = mapped.chatId;
    }

    await db.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });

    /**
     * ============================================================
     *  בוט אחד, ורק הוא
     * ============================================================
     *
     *  **מה היה כאן קודם.** בוט בן אלף שורות שסיווג כל
     *  הודעה, חיפש במאגר ידע, פירש מתי להתקשר, שינה
     *  סטטוסים והריץ מנוע חוקים - והכל מאחורי שער עם שבע
     *  חסימות. הוא גם החזיק **עותק שני** של תהליך הסינון,
     *  כך שאותה שאלה נשלחה משני מקומות שונים בקוד.
     *
     *  הוא נמחק מהמערכת. מה שנשאר הוא בוט הדיוור: שאלה
     *  אחת, קריאת התשובה, וזה הכל.
     *
     *  **המתג כבוי = אף בוט לא נוגע בהודעה.** ההודעה
     *  נשמרת, הרצף נעצר, ההתראה "לקוח ענה" נוצרת - ושום
     *  דבר לא נשלח ללקוח. בלי הפתעות.
     */
    let botAction: string | null = null;
    let botReason: string | null = null;

    try {
      const { getSettings } = await import("@/lib/settings");
      const settings = await getSettings();

      if (settings.campaignBot) {
        const { handleCampaignReply } = await import("@/lib/campaign-bot");
        const result = await handleCampaignReply({
          leadId: lead.id,
          text: mapped.text ?? "",
        });

        botAction = result.action;
        botReason = result.reason;

        await db.leadEvent
          .create({
            data: {
              leadId: lead.id,
              type: "campaign_bot",
              actor: "bot",
              payload: { action: result.action, reason: result.reason },
            },
          })
          .catch(() => null);
      } else {
        botReason = "מתג בוט הדיוור כבוי";
      }
    } catch (err) {
      /**
       * ============================================================
       *  כשל של הבוט חייב להשאיר עקבות
       * ============================================================
       *
       *  **הנקודה העיוורת הגדולה ביותר במערכת.**
       *
       *  כאן ישב `catch` ריק. אם הבוט נפל מכל סיבה -
       *  שדה חסר, שגיאת רשת, באג - ההודעה נשמרה, הלקוח
       *  לא קיבל כלום, ו**לא נשאר שום סימן**: לא התראה,
       *  לא רישום, ולא שורה באבחון.
       *
       *  התוצאה היא בדיוק מה שקרה: האבחון מראה שכל
       *  התנאים מתקיימים, והשאלה לא יצאה - בלי שום דרך
       *  לדעת למה.
       *
       *  ההודעה עדיין נשמרת והרצף עדיין נעצר; רק השתיקה
       *  נגמרת.
       */
      const message =
        err instanceof Error
          ? `${err.message}\n${(err.stack ?? "").slice(0, 600)}`
          : String(err).slice(0, 600);

      await db.leadEvent
        .create({
          data: {
            leadId: lead.id,
            type: "bot_failed",
            actor: "system",
            payload: { error: message, text: (mapped.text ?? "").slice(0, 200) },
          },
        })
        .catch(() => null);

      await db.alert
        .create({
          data: {
            leadId: lead.id,
            title: "הבוט קרס - הלקוח לא קיבל תשובה",
            body: `${lead.firstName ?? displayPhone(lead.phone)}: ${(mapped.text ?? "").slice(0, 100)}\n\n${message.slice(0, 300)}`,
          },
        })
        .catch(() => null);

      await db.webhookLog
        .update({
          where: { id: log.id },
          data: { error: `הבוט קרס: ${message.slice(0, 400)}` },
        })
        .catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      cancelledJobs: cancelled,
      campaign: botAction,
      reason: botReason,
    });
  } catch (err) {
    await db.webhookLog.update({
      where: { id: log.id },
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ ok: true, warning: "processing failed" });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
