/**
 * ============================================================
 *  שליחת לידים לקונים
 * ============================================================
 *
 *  ליד שנכנס לקמפיין מכירה נשלח לקונה שלו אוטומטית, בדיוק
 *  כמו שליד מנגר עושה היום.
 *
 *  שלושה כללים שמנחים את הקובץ:
 *
 *   1. **כל ניסיון נרשם.** גם הצלחה וגם כישלון, עם הסיבה.
 *      בלי זה אי אפשר לענות ללקוח "הליד הגיע אליך".
 *
 *   2. **אף פעם לא פעמיים על אותה הגעה.** יש אילוץ ייחודיות
 *      על צירוף של קונה וכניסה, ולכן גם אם משהו ירוץ
 *      פעמיים - הקונה יקבל פעם אחת.
 *
 *   3. **כישלון לא מאבד ליד.** הוא נשאר בתור ומנסה שוב.
 */

import { db } from "./db";
import {
  buildPayload,
  applyFieldMap,
  shouldRetry,
  retryDelayMinutes,
  isSuccess,
} from "./delivery-payload";

/**
 * מכניס לתור שליחה לקונה של הקמפיין.
 *
 * לא שולח בפועל - רק רושם. השליחה עצמה נעשית במנוע, כדי
 * שהקליטה של הליד לא תחכה לשרת של הקונה.
 */
export async function queueDelivery(args: {
  leadId: string;
  entryId: string;
  campaign: string | null;
}): Promise<boolean> {
  if (!args.campaign) return false;

  const { normalizeName } = await import("./sales-campaigns");

  const campaigns = await db.salesCampaign
    .findMany({
      where: { active: true },
      select: { name: true, buyerId: true },
    })
    .catch(() => []);

  const key = normalizeName(args.campaign);
  const match = campaigns.find((c) => normalizeName(c.name) === key);

  if (!match?.buyerId) return false;

  const buyer = await db.leadBuyer
    .findUnique({ where: { id: match.buyerId } })
    .catch(() => null);

  // אין כתובת או שהשליחה כבויה - אין מה לעשות
  if (!buyer?.webhookUrl?.trim() || !buyer.sendEnabled) return false;

  await db.leadDelivery
    .create({
      data: {
        buyerId: buyer.id,
        leadId: args.leadId,
        entryId: args.entryId,
        state: "pending",
        nextTryAt: new Date(),
      },
    })
    .catch(() => null); // כפילות = כבר בתור, וזה בסדר

  return true;
}

/**
 * שולח שליחה אחת ומעדכן את היומן.
 *
 * מוחזר true אם הליד הגיע ליעד.
 */
export async function sendDelivery(deliveryId: string): Promise<boolean> {
  const delivery = await db.leadDelivery
    .findUnique({
      where: { id: deliveryId },
      include: {
        buyer: true,
        lead: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            extra: true,
            status: true,
          },
        },
      },
    })
    .catch(() => null);

  if (!delivery || !delivery.buyer.webhookUrl) return false;
  if (delivery.state === "sent") return true;

  const base = buildPayload(delivery.lead, delivery.createdAt);
  const payload = applyFieldMap(base, delivery.buyer.fieldMap);

  const url = delivery.buyer.webhookUrl.trim();
  const secret = delivery.buyer.webhookSecret?.trim();
  const asForm = delivery.buyer.webhookFormat === "form";

  let httpStatus: number | null = null;
  let responseText = "";
  let networkError = "";

  try {
    const headers: Record<string, string> = {
      "Content-Type": asForm
        ? "application/x-www-form-urlencoded"
        : "application/json",
    };

    // הסוד נשלח גם ככותרת וגם כשדה, כי לכל קונה דרישה אחרת
    if (secret) headers["Authorization"] = `Bearer ${secret}`;

    const body = asForm
      ? new URLSearchParams({
          ...payload,
          ...(secret ? { token: secret } : {}),
        }).toString()
      : JSON.stringify({ ...payload, ...(secret ? { token: secret } : {}) });

    /**
     * פסק זמן של 20 שניות. שרת שלא עונה תוך זה ייחשב
     * ככישלון וינוסה שוב, במקום לתקוע את המנוע.
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    httpStatus = response.status;
    responseText = (await response.text().catch(() => "")).slice(0, 500);
  } catch (error) {
    networkError =
      error instanceof Error ? error.message.slice(0, 300) : "שגיאת רשת";
  }

  const attempts = delivery.attempts + 1;
  const ok = httpStatus !== null && isSuccess(httpStatus);

  if (ok) {
    await db.leadDelivery
      .update({
        where: { id: delivery.id },
        data: {
          state: "sent",
          attempts,
          httpStatus,
          response: responseText,
          error: null,
          payload: payload as never,
          sentAt: new Date(),
          nextTryAt: null,
        },
      })
      .catch(() => null);

    return true;
  }

  const retry = shouldRetry(httpStatus, attempts);

  await db.leadDelivery
    .update({
      where: { id: delivery.id },
      data: {
        state: retry ? "pending" : "failed",
        attempts,
        httpStatus,
        response: responseText,
        error:
          networkError ||
          `השרת של הקונה החזיר ${httpStatus}${
            responseText ? ` - ${responseText.slice(0, 120)}` : ""
          }`,
        payload: payload as never,
        nextTryAt: retry
          ? new Date(Date.now() + retryDelayMinutes(attempts) * 60_000)
          : null,
      },
    })
    .catch(() => null);

  return false;
}

/**
 * כל מה שמחכה לשליחה ברגע זה.
 * נקרא מהמנוע, כל דקה.
 */
export async function runDeliveries(limit = 20): Promise<number> {
  const due = await db.leadDelivery
    .findMany({
      where: {
        state: "pending",
        OR: [{ nextTryAt: null }, { nextTryAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    })
    .catch(() => []);

  let sent = 0;
  for (const d of due) {
    const ok = await sendDelivery(d.id).catch(() => false);
    if (ok) sent++;
  }

  return sent;
}
