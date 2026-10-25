import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  planManualLead,
  duplicateAction,
  originFor,
  MANUAL_SOURCE,
} from "@/lib/manual-lead";
import { queueDelivery } from "@/lib/delivery";
import { priceForAd, readAdPrices } from "@/lib/ad-pricing";
import { notifyNewLead } from "@/lib/notify-lead";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  הוספת ליד ידני
 * ============================================================
 *
 *  עד עכשיו ליד נכנס רק דרך webhook, ולכן לא היה אפשר לבדוק
 *  את המערכת מקצה לקצה בלי לחכות לליד אמיתי מפייסבוק.
 *
 *  ליד ידני עובר **אותו מסלול בדיוק** כמו ליד אמיתי: אותו
 *  נרמול טלפון, אותה רשומת כניסה, אותה בעלות לפי ערוץ,
 *  ואותה שליחה אוטומטית לוובוק. בדיקה שעוברת מסלול אחר לא
 *  מוכיחה כלום.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const plan = planManualLead({
    phone: body.phone,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    address: body.address,
    campaign: body.campaign,
    ad: body.ad,
    supplier: body.supplier,
    channelId: body.channelId,
  });

  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: 400 });
  }

  /**
   * הערוץ נשלף כדי לדעת שתי עובדות שקובעות הכל: אם זו
   * מכירה (ואז הליד לא שלך), ומה המחיר לליד.
   */
  const channel = plan.channelId
    ? await db.channel
        .findUnique({ where: { id: plan.channelId } })
        .catch(() => null)
    : null;

  if (plan.channelId && !channel) {
    return NextResponse.json({ error: "הערוץ לא נמצא" }, { status: 400 });
  }

  const isSale = channel?.isSale === true;

  const existing = await db.lead
    .findFirst({ where: { phone: plan.phone }, select: { id: true } })
    .catch(() => null);

  const action = duplicateAction(Boolean(existing));

  let leadId: string;

  if (action === "create") {
    const lead = await db.lead.create({
      data: {
        phone: plan.phone,
        firstName: plan.firstName,
        lastName: plan.lastName,
        status: "חדש",
        source: MANUAL_SOURCE,
        origin: originFor(isSale),
        extra: plan.extra as Prisma.InputJsonObject,
      },
    });

    leadId = lead.id;

    await db.leadEvent
      .create({
        data: {
          leadId,
          type: "lead_created",
          toStatus: "חדש",
          actor: "manual",
          payload: { manual: true, channelId: plan.channelId },
        },
      })
      .catch(() => null);
  } else {
    leadId = existing!.id;

    /**
     * ליד קיים **לא נדרס ולא מאוחד**.
     *
     * נרשמת כניסה נוספת, בדיוק כמו הגעה חוזרת מפייסבוק,
     * ולכן תופיע עליו התווית "ליד כפול" - וזה נכון, הוא
     * באמת נכנס שוב.
     */
    await db.leadEvent
      .create({
        data: {
          leadId,
          type: "note",
          actor: "manual",
          payload: { manual: true, repeat: true },
        },
      })
      .catch(() => null);
  }

  /**
   * הכניסה היא מה שקובע בעלות, כפילות וחיוב - ולכן היא
   * נרשמת תמיד, גם לליד קיים.
   */
  const entry = await db.leadEntry
    .create({
      data: {
        leadId,
        campaign: plan.extra.fb_campaign ?? null,
        source: MANUAL_SOURCE,
        via: MANUAL_SOURCE,
        channelId: channel?.id ?? null,
        isSale,
        /**
         * אותו תמחור בדיוק כמו ליד אמיתי: חריג לפי מודעה אם
         * יש, אחרת מחיר הערוץ. בדיקה שעוברת מסלול תמחור אחר
         * לא מוכיחה שהתמחור עובד.
         */
        price: isSale
          ? priceForAd({
              adName: plan.extra.fb_ad ?? null,
              rules: readAdPrices(channel?.adPrices),
              fallback: Number(channel?.pricePerLead ?? 0),
            }).price
          : 0,
        at: new Date(),
      },
    })
    .catch(() => null);

  /**
   * ליד שנכנס לערוץ מכירה יוצא מהרשימה האישית.
   *
   * זה הכלל שלך: מה שקשור לקונה שייך אך ורק לו. ליד קיים
   * שהוזן עכשיו לערוץ מכירה חייב לעבור בעלות גם הוא.
   */
  if (isSale) {
    await db.lead
      .update({ where: { id: leadId }, data: { origin: "sale" } })
      .catch(() => null);
  }

  /**
   * שליחה לוובוק של הערוץ. רק נרשמת לתור - המנוע שולח,
   * כדי שהמסך לא יחכה לשרת של הקונה.
   */
  let queued = false;

  if (isSale && entry && channel?.autoSend !== false) {
    queued = await queueDelivery({
      leadId,
      entryId: entry.id,
      campaign: plan.extra.fb_campaign ?? null,
      channelId: channel?.id ?? null,
    }).catch(() => false);
  }

  /** אותה התראה בדיוק כמו ליד אמיתי */
  void notifyNewLead({
    leadId,
    firstName: plan.firstName,
    lastName: plan.lastName,
    phone: plan.phone,
    status: "חדש",
    extra: plan.extra,
    channelName: channel?.name ?? null,
    isSale,
    at: new Date(),
  });

  return NextResponse.json({
    ok: true,
    leadId,
    created: action === "create",
    repeat: action === "add_entry",
    isSale,
    queued,
    verdict:
      action === "create"
        ? isSale
          ? queued
            ? `הליד נוצר, נכנס לערוץ "${channel?.name}" ונרשם לשליחה.`
            : `הליד נוצר ונכנס לערוץ "${channel?.name}", אבל לא נרשם לשליחה - בדוק שיש כתובת וובוק ושהשליחה פעילה.`
          : "הליד נוצר ונכנס לרשימה שלך."
        : isSale
        ? queued
          ? `הטלפון כבר היה במערכת. נרשמה כניסה נוספת לערוץ "${channel?.name}" ונרשמה שליחה. הליד יופיע עם תווית "ליד כפול".`
          : `הטלפון כבר היה במערכת. נרשמה כניסה נוספת לערוץ "${channel?.name}", אבל לא נרשמה שליחה - בדוק את הגדרות הוובוק.`
        : 'הטלפון כבר היה במערכת. נרשמה כניסה נוספת, והליד יופיע עם תווית "ליד כפול".',
  });
}
