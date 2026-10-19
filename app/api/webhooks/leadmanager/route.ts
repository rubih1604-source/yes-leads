import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import {
  mapLeadManagerPayload,
  extractExtraFields,
} from "@/lib/leadmanager-mapping";
import { isExistingCustomer } from "@/lib/existing-customer";
import { isKnownStatus } from "@/lib/status-store";
import { scheduleForStatus } from "@/lib/rules";
import { queueDelivery } from "@/lib/delivery";
import { doorOf, addDoor } from "@/lib/via";
import { identifiersOf } from "@/lib/campaign-match";
import { assignmentForForm } from "@/lib/lead-forms";
import {
  channelForIncoming,
  isSameSubmission,
  isStatusUpdate,
  SAME_SUBMISSION_MINUTES_NO_ID,
} from "@/lib/channel";

export const dynamic = "force-dynamic";

/**
 * קליטת ליד מליד מנגר.
 *
 * מקבל גם GET וגם POST:
 *  - GET  -> הנתונים מגיעים בכתובת עצמה (query string)
 *  - POST -> הנתונים מגיעים בגוף הבקשה, ואם לא, נופלים חזרה לכתובת
 *
 * הכלל: קודם שומרים את מה שהגיע, אחר כך מנסים להבין אותו.
 * גם אם המיפוי נכשל - שום דבר לא הולך לאיבוד.
 */

/** שולף את כל הפרמטרים מהכתובת לאובייקט */
function queryToObject(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key === "token") continue; // הטוקן הוא אימות, לא נתון של הליד
    out[key] = value;
  }
  return out;
}

/** בודק שהטוקן שהגיע תואם למה שהוגדר */
function tokenIsValid(request: Request): boolean {
  const expected = process.env.LEADMANAGER_WEBHOOK_TOKEN;
  if (!expected) return true; // לא הוגדר טוקן - לא בודקים

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-webhook-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token");

  return provided === expected;
}

async function handle(request: Request) {
  const fromQuery = queryToObject(request.url);

  // גוף הבקשה - קיים רק ב-POST.
  // חשוב: קוראים את הגוף פעם אחת בלבד כטקסט, ורק אחר כך מנתחים אותו.
  // קריאה כפולה (json ואז text) מרוקנת את הגוף ומחזירה ריק.
  let bodyText = "";
  if (request.method !== "GET") {
    bodyText = await request.text().catch(() => "");
  }

  let fromBody: unknown = null;
  if (bodyText.trim()) {
    try {
      // ניסיון ראשון: JSON
      fromBody = JSON.parse(bodyText);
    } catch {
      // ניסיון שני: form-urlencoded (key=value&key=value)
      const params = new URLSearchParams(bodyText);
      const obj: Record<string, string> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      fromBody = Object.keys(obj).length ? obj : { _unparsed: bodyText };
    }
  }

  // מאחדים: מה שהגיע בגוף גובר, מה שבכתובת משלים
  const raw: Record<string, unknown> = {
    ...fromQuery,
    ...(fromBody && typeof fromBody === "object" ? (fromBody as object) : {}),
    _method: request.method,
    _contentType: request.headers.get("content-type") || "(אין)",
    _bodyLength: String(bodyText.length),
  };

  // 1. שומרים גולמי לפני הכל
  const log = await db.webhookLog.create({
    data: { source: "leadmanager", rawPayload: raw as Prisma.InputJsonObject },
  });

  // 2. בודקים טוקן
  if (!tokenIsValid(request)) {
    await db.webhookLog.update({
      where: { id: log.id },
      data: { error: "טוקן שגוי או חסר" },
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. מעבדים. גם אם נכשל - מחזירים 200 כדי שליד מנגר לא ינסה שוב ושוב
  try {
    const mapped = mapLeadManagerPayload(raw);
    const phone = normalizePhone(mapped.phone);

    if (!phone) {
      await db.webhookLog.update({
        where: { id: log.id },
        data: {
          error:
            Object.keys(fromQuery).length === 0 && !fromBody
              ? "הבקשה הגיעה ריקה - לא נשלחו שדות כלל"
              : "לא נמצא מספר טלפון תקין",
        },
      });
      return NextResponse.json({ ok: true, warning: "no phone" });
    }

    const incomingStatus =
      mapped.status && (await isKnownStatus(mapped.status))
        ? mapped.status
        : null;

    const extra = extractExtraFields(raw);

    /**
     * חוק אוטומטי: אם בשאלת הספק הלקוח סימן yes או סטינג -
     * הוא כבר לקוח שלנו. נכנס ישר ל"לקוח קיים" במקום "חדש",
     * כדי שלא יקבל פנייה מכירתית מיותרת.
     */
    /**
     * אותו זיהוי שכל המערכת משתמשת בו - כולל עמודות
     * מקבצים ששמן שונה בכל פעם.
     */
    const alreadyCustomer = isExistingCustomer(extra);

    const existing = await db.lead.findUnique({ where: { phone } });

    /**
     * לאיזו מערכת הכניסה הזו שייכת - שלך או של המכירה.
     *
     * נקבע פעם אחת, כאן, לפי הקמפיין שממנו היא הגיעה,
     * ונחתם על הכניסה. כל השאר במערכת קורא את החותמת הזו
     * ולא מנחש מחדש.
     */
    const incomingCampaign = extra.fb_campaign || extra.campaign || null;

    /**
     * ההכרעה נעשית לפי **כל** המזהים שהגיעו, לא רק לפי השם.
     *
     * כאן היה הכשל שחזר בכל עדכון: ההחלטה הסתמכה על שם
     * הקמפיין בלבד. כשהשם לא הגיע - והחיבור הישיר לפייסבוק
     * מקבל אותו רק עם הרשאה לחשבון המודעות - ההתאמה נפלה,
     * והליד של הקונה נכנס לרשימה האישית שלך.
     *
     * מזהה טופס או מודעה תמיד מגיע, ולכן עכשיו ההכרעה
     * מחזיקה גם בלי שם.
     */
    const ids = identifiersOf(extra);

    /**
     * הטופס קובע ראשון.
     *
     * טופס מחובר לקונה אחד, וזה בדיוק איך שאתה עובד.
     * אם הטופס מוגדר במסך ההתממשקות - אין צורך בשם קמפיין
     * ואין מה לנחש.
     *
     * טופס שלא הוגדר לא משנה כלום: נופלים לשם הקמפיין,
     * בדיוק כמו קודם.
     */
    const byForm = await assignmentForForm(ids.formId).catch(() => null);

    const channel = byForm
      ? {
          channel: byForm.channel,
          isSale: byForm.channel === "sale",
          price: byForm.price,
          campaignName: byForm.formName,
          matchedOn: `טופס: ${byForm.formName}`,
        }
      : await channelForIncoming(ids);

    /**
     * מאיזו דלת הליד נכנס.
     *
     * החיבור הישיר לפייסבוק מסמן את עצמו ב-_source, ולכן
     * אפשר לדעת מי הביא את הליד - וזה מה שמאפשר לראות אם
     * החיבור הישיר באמת עובד או שליד מנגר עושה הכל.
     */
    const via = doorOf(raw);

    if (!existing) {
      const lead = await db.lead.create({
        data: {
          phone,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          status: incomingStatus ?? (alreadyCustomer ? "לקוח קיים" : "חדש"),
          source: mapped.source,

          /**
           * ליד שנולד מקמפיין מכירה נולד **כשל המכירה**.
           *
           * קודם השדה הזה לא נקבע ביצירה אלא נפל לברירת
           * המחדל "שלך", ולכן ליד חדש של אלעד נראה לרגע
           * כמו ליד שלך - והאוטומציות שלך רצו עליו. ככה
           * לקוחות שלו קיבלו ממך הודעות.
           */
          origin: channel.isSale ? "sale" : "leadmanager",
          extra: Object.keys(extra).length
            ? (extra as Prisma.InputJsonObject)
            : undefined,
        },
      });

      if (alreadyCustomer && !incomingStatus) {
        await db.alert.create({
          data: {
            leadId: lead.id,
            title: "ליד נכנס כלקוח קיים",
            body: `${mapped.firstName ?? phone} סימן בטופס ספק "${extra.supplier_question}" - הועבר אוטומטית ל"לקוח קיים".`,
          },
        });
      }

      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "lead_created",
          toStatus: lead.status,
          actor: "system",
          payload: { webhookLogId: log.id },
        },
      });

      /**
       * כל כניסה נרשמת **עם הערוץ שלה חתום עליה**.
       *
       * זה השדה שבלעדיו הכל התבלבל: קודם הכניסה נרשמה בלי
       * isSale, ואז תהליך אחר יצר כניסה שנייה כדי לסמן
       * שזו מכירה - ואותה הגעה אחת נספרה כשתיים. זה מה
       * שהפך ליד של אלעד ל"כפול 2" אצלך.
       */
      const firstEntry = await db.leadEntry
        .create({
          data: {
            leadId: lead.id,
            campaign: incomingCampaign,
            source: mapped.source,
            via,
            isSale: channel.isSale,
            price: channel.price,
            at: new Date(),
          },
        })
        .catch(() => null);

      /**
       * ליד של קונה נשלח אליו אוטומטית.
       * רק נרשם לתור כאן - השליחה עצמה במנוע, כדי שהקליטה
       * לא תחכה לשרת של הקונה.
       */
      if (channel.isSale && firstEntry) {
        await queueDelivery({
          leadId: lead.id,
          entryId: firstEntry.id,
          campaign: incomingCampaign,
          buyerId: byForm?.buyerId ?? null,
        }).catch(() => false);
      }

      /**
       * אוטומציות רצות רק על הערוץ שלך.
       * ליד של המכירה לא מקבל ממך הודעה, לעולם.
       */
      if (!channel.isSale) {
        await scheduleForStatus(lead.id, lead.status);
      }
    } else {
      /**
       * המקור נקבע לפי הכניסה הנוכחית, לא לפי העבר.
       *
       * הכלל הקודם היה "מי שנכנס למכירה נשאר במכירה לנצח",
       * וזה גרם לכך שאדם שקנה פעם דרך קמפיין מכירה ואז
       * נכנס מקמפיין שלך - נעלם לך מהרשימה.
       *
       * הכלל הנכון: הקמפיין שממנו הוא נכנס עכשיו הוא
       * שקובע של מי הליד.
       */
      const isSaleNow = channel.isSale;

      /**
       * סטטוס שמגיע מליד מנגר נוגע רק בערוץ שלך.
       * לערוץ המכירה אין סטטוסים בכלל.
       */
      const statusChanged =
        !isSaleNow &&
        incomingStatus !== null &&
        incomingStatus !== existing.status;

      /**
       * אותה הגשה שהגיעה פעמיים - לא ליד כפול.
       *
       * בזמן שליד מנגר ופייסבוק רצים במקביל, כל ליד מגיע
       * משני המקורות. בלי הבדיקה הזו כל ליד היה מסומן
       * "כפול" וקופץ פעמיים.
       *
       * אותה הגשה = אותו מזהה ליד של פייסבוק, או כניסה
       * שכבר נרשמה ב-15 הדקות האחרונות.
       */
      const previousExtra =
        typeof existing.extra === "object" && existing.extra
          ? (existing.extra as Record<string, string>)
          : {};

      const incomingFbId = extra.fb_leadid?.trim() || null;

      /**
       * הבדיקה רצה **בתוך הערוץ בלבד**.
       *
       * קודם היא רצה על כל הכניסות, ולכן ליד שנכנס אצלך
       * וכמה דקות אחר כך נכנס אצל אלעד - הכניסה של אלעד
       * נבלעה ולא נרשמה בכלל. שתי מערכות נפרדות; כניסה
       * באחת לא מבטלת כניסה בשנייה.
       */
      /**
       * טווח השליפה חייב לכסות את החלון הארוך ביותר שהבדיקה
       * משתמשת בו, אחרת היא פשוט לא תראה את הכניסה הקודמת
       * ותחשוב שזו הגעה חדשה.
       */
      const lookback = (SAME_SUBMISSION_MINUTES_NO_ID + 60) * 60 * 1000;

      const recentEntries = await db.leadEntry
        .findMany({
          where: {
            leadId: existing.id,
            at: { gte: new Date(Date.now() - lookback) },
          },
          select: { id: true, isSale: true, campaign: true, at: true, via: true },
        })
        .catch(() => []);

      /**
       * שתי שאלות שונות, ואסור לבלבל ביניהן:
       *
       *  1. האם זו בכלל **הגעה**, או רק עדכון סטטוס מליד
       *     מנגר. עדכון סטטוס לא יוצר כניסה ולא מקפיץ
       *     תאריך.
       *
       *  2. אם זו הגעה - האם היא **אותה הגשה** שכבר נרשמה
       *     מהדלת השנייה, בהפרש של דקות.
       *
       * כל הגעה אחרת נספרת, גם אם אותו אדם נכנס ארבע פעמים
       * באותו יום. זה הכלל שלך, וזה מה שהקוד עושה עכשיו.
       */
      const statusOnly = isStatusUpdate({
        incomingStatus,
        hasSubmissionId: Boolean(incomingFbId),
        leadExists: true,
      });

      const sameSubmission =
        statusOnly ||
        isSameSubmission({
          incomingFbId,
          knownFbId: previousExtra.fb_leadid ?? null,
          channel: channel.channel,
          entries: recentEntries,
        });

      /**
       * של מי הליד.
       *
       * **כניסה אחת של מכירה מעבירה אותו לקונה**, גם אם
       * הוא נכנס פעם גם מקמפיין שלך: "מה שקשור לאלעד
       * שייך אך ורק אליו".
       *
       * גם כניסה של מכירה שנרשמה בעבר נספרת, ולכן ליד
       * שכבר עבר לקונה לא חוזר אליך בגלל התראת סטטוס
       * שהגיעה בלי קמפיין.
       */
      const hadSaleEntry =
        (await db.leadEntry
          .count({ where: { leadId: existing.id, isSale: true } })
          .catch(() => 0)) > 0;

      const ownerOrigin = isSaleNow || hadSaleEntry ? "sale" : "leadmanager";

      await db.lead.update({
        where: { id: existing.id },
        data: {
          firstName: mapped.firstName ?? existing.firstName,
          lastName: mapped.lastName ?? existing.lastName,
          source: mapped.source ?? existing.source,

          /**
           * סטטוס נוגע רק לערוץ שלך. כניסה של אלעד לא
           * דורסת סטטוס שאתה קבעת - זה מה שגרם לליד
           * שעבדת עליו אתמול להשתנות מעצמו.
           */
          status: isSaleNow ? existing.status : incomingStatus ?? existing.status,

          /**
           * הליד נכנס שוב עכשיו - ולכן הוא צף לראש הרשימה
           * עם התאריך של היום. התאריכים הקודמים לא אובדים:
           * כל כניסה נשמרת בנפרד ומוצגת בכרטיס הליד.
           *
           * אבל רק כניסה **בערוץ שלך** מקפיצה אותו אצלך.
           * כניסה אצל אלעד לא מזיזה כלום ברשימה שלך.
           */
          intakeAt: sameSubmission || isSaleNow ? undefined : new Date(),

          origin: ownerOrigin,
          extra: Object.keys(extra).length
            ? ({
                ...(typeof existing.extra === "object" && existing.extra
                  ? (existing.extra as Record<string, string>)
                  : {}),
                ...extra,
              } as Prisma.InputJsonObject)
            : undefined,
        },
      });

      /**
       * ============================================================
       *  אותה הגעה, דלת שנייה
       * ============================================================
       *
       *  החיבור הישיר וליד מנגר רצים במקביל, ולכן אותו ליד
       *  מגיע פעמיים - פעם מכל דלת. זו **לא** הגעה כפולה
       *  ולכן לא נרשמת כניסה נוספת, אבל כן נרשם מי הביא:
       *  שתי הדלתות נשמרות על אותה כניסה, בסדר שבו הגיעו.
       *
       *  זה מה שמאפשר לראות בכרטיס הליד שהחיבור הישיר באמת
       *  עובד, גם כשליד מנגר הביא את אותו ליד שנייה אחר כך.
       */
      if (sameSubmission && !statusOnly) {
        const matching = recentEntries
          .filter((e) => e.isSale === channel.isSale)
          .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

        if (matching) {
          const merged = addDoor(matching.via, via);

          if (merged) {
            await db.leadEntry
              .update({ where: { id: matching.id }, data: { via: merged } })
              .catch(() => null);
          }
        }
      }

      /**
       * כניסה נוספת נרשמת עם הערוץ שלה חתום עליה.
       *
       * תגית "כפול" נספרת מתוך הכניסות של אותו ערוץ בלבד,
       * ולכן כניסה אצל אלעד לא תסמן לך כפול ברשימה שלך.
       */
      if (!sameSubmission) {
        const entry = await db.leadEntry
          .create({
            data: {
              leadId: existing.id,
              campaign: incomingCampaign,
              source: mapped.source,
              via,
              isSale: channel.isSale,
              price: channel.price,
              at: new Date(),
            },
          })
          .catch(() => null);

        // הגעה חדשה בערוץ המכירה = שליחה חדשה לקונה
        if (channel.isSale && entry) {
          await queueDelivery({
            leadId: existing.id,
            entryId: entry.id,
            campaign: incomingCampaign,
            buyerId: byForm?.buyerId ?? null,
          }).catch(() => false);
        }
      }

      await db.leadEvent.create({
        data: {
          leadId: existing.id,
          type: statusChanged ? "status_changed" : "webhook_received",
          fromStatus: statusChanged ? existing.status : null,
          toStatus: statusChanged ? incomingStatus : null,
          actor: "system",
          payload: { webhookLogId: log.id },
        },
      });
    }

    await db.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });

    return NextResponse.json({ ok: true });
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
