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
  deliveryVerdict,
  buildPayload,
  applyFieldMap,
  pickFields,
  shouldRetry,
  retryDelayMinutes,
  isSuccess,
  renderTemplate,
  sentFieldsOf,
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
  /**
   * הקונה, כשהוא כבר ידוע.
   *
   * ליד ששויך לפי **טופס** לא עובר דרך שם קמפיין, ולכן
   * חיפוש לפי קמפיין לא היה מוצא לו קונה - והוא לא היה
   * נשלח לאף אחד. כאן הקונה מגיע ישירות מהטופס.
   */
  buyerId?: string | null;
  /**
   * הערוץ שבגללו נשלח. הערוץ מחזיק את הכתובת וההגדרות,
   * ולכן כשהוא קיים אין צורך בקונה בכלל.
   */
  channelId?: string | null;
}): Promise<boolean> {
  /**
   * ערוץ קודם: הוא היחידה שמחזיקה את הוובוק מעכשיו.
   */
  if (args.channelId) {
    const channel = await db.channel
      .findUnique({ where: { id: args.channelId } })
      .catch(() => null);

    if (!channel?.webhookUrl?.trim() || !channel.sendEnabled) return false;

    /**
     * "שליחה אוטומטית" כבוי = לא נרשמת שליחה מעצמה.
     *
     * כאן היה פער: המתג נבדק רק בליד ידני, ולידים שנכנסו
     * מפייסבוק או מליד מנגר נשלחו לקונה גם כשהמתג היה
     * כבוי - כלומר המתג שיקר. השליחה הידנית מכרטיס הליד
     * לא עוברת כאן ולכן ממשיכה לעבוד תמיד.
     */
    if (!channel.autoSend) return false;

    /**
     * בדיקת כפילות מפורשת.
     *
     * קודם האינדקס הייחודי במסד היה זה שמנע שליחה כפולה
     * לאותו ערוץ, והקוד הסתמך על כך שהיצירה תיכשל. אינדקס
     * ייחודי חדש מפיל את הבנייה ברנדר, ולכן ההגנה עברה
     * לכאן - ומכאן שאסור להסיר את הבדיקה הזו: בלעדיה אותו
     * ליד יכול להישלח לקונה פעמיים.
     */
    const queued = await db.leadDelivery
      .findFirst({
        where: { channelId: channel.id, entryId: args.entryId },
        select: { id: true },
      })
      .catch(() => null);

    if (queued) return true; // כבר בתור

    await db.leadDelivery
      .create({
        data: {
          channelId: channel.id,
          leadId: args.leadId,
          entryId: args.entryId,
          state: "pending",
          nextTryAt: new Date(),
        },
      })
      .catch(() => null);

    return true;
  }

  let buyerId = args.buyerId ?? null;

  if (!buyerId) {
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
    buyerId = match.buyerId;
  }

  const buyer = await db.leadBuyer
    .findUnique({ where: { id: buyerId } })
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
        channelRef: true,
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

  if (!delivery) return false;
  if (delivery.state === "sent") return true;

  /**
   * ההגדרות מגיעות מהערוץ, ואם זו שליחה ותיקה - מהקונה.
   *
   * מאוחד למקור אחד כאן, כדי שכל השאר בקובץ לא יצטרך
   * לדעת מאיזה מהשניים הוא קורא.
   */
  const target = delivery.channelRef ?? delivery.buyer;

  if (!target?.webhookUrl?.trim()) return false;

  const base = buildPayload(delivery.lead, delivery.createdAt);

  /**
   * סינון לפי השדות שסומנו בערוץ, לפני המיפוי.
   *
   * רק לערוץ: לקונה ותיק יש fieldMap משלו, ואין לו רשימת
   * סימון - ולכן הוא ממשיך להתנהג בדיוק כמו קודם.
   */
  const picked = delivery.channelRef
    ? pickFields(base, delivery.channelRef.fields)
    : base;

  const payload = applyFieldMap(
    picked,
    delivery.channelRef ? null : delivery.buyer?.fieldMap
  );

  const url = target.webhookUrl.trim();
  const secret = target.webhookSecret?.trim();
  const asForm = target.webhookFormat === "form";

  /**
   * תבנית גוף השידור, אם הוגדרה.
   *
   * זה מה שמאפשר לשלוח בדיוק את המבנה שהקונה מצפה לו,
   * כולל שדות קבועים שלא באים מהליד. בלי תבנית נשלח
   * המטען הרגיל, כמו עד היום.
   *
   * נבנה כאן ולא בתוך ה-try, כי זה גם מה שנרשם ביומן -
   * וגם כשהשליחה נכשלת צריך לדעת מה ניסינו לשלוח.
   */
  const template = target.bodyTemplate?.trim();

  const body = template
    ? renderTemplate(template, payload)
    : asForm
      ? new URLSearchParams({
          ...payload,
          ...(secret ? { token: secret } : {}),
        }).toString()
      : JSON.stringify({ ...payload, ...(secret ? { token: secret } : {}) });

  /** מה שבאמת יצא - אחרי התבנית, ובלי הסוד */
  const sentFields = sentFieldsOf(body, asForm);

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

    /**
     * כותרות של הקונה.
     *
     * נכתבות **אחרי** ברירת המחדל, כדי שהן יגברו: קונה
     * שדורש X-API-Key או Content-Type משלו מקבל בדיוק מה
     * שהוא דורש. בלי זה הבקשה נדחית באימות והליד לא מגיע.
     */
    const custom =
      target.headers &&
      typeof target.headers === "object" &&
      !Array.isArray(target.headers)
        ? (target.headers as Record<string, unknown>)
        : {};

    for (const [name, value] of Object.entries(custom)) {
      if (typeof value === "string" && name.trim() && value.trim()) {
        headers[name.trim()] = value.trim();
      }
    }

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

  /**
   * ההכרעה אם הליד הגיע.
   *
   * לא רק קוד HTTP: יש מערכות שמחזירות 200 גם כשהליד
   * נדחה, ואומרות את זה בגוף התשובה. לכן אם הוגדרו
   * סימני הצלחה או כשלון - הם קובעים.
   */
  const verdict =
    httpStatus === null
      ? { ok: false, reason: networkError || "לא התקבלה תשובה" }
      : deliveryVerdict({
          httpStatus,
          body: responseText,
          successContains: target.successContains,
          failureContains: target.failureContains,
        });

  const ok = verdict.ok;

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
          payload: sentFields as never,
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
          verdict.reason ||
          `השרת של הקונה החזיר ${httpStatus}${
            responseText ? ` - ${responseText.slice(0, 120)}` : ""
          }`,
        payload: sentFields as never,
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
