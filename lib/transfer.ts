/**
 * ============================================================
 *  העברת ליד אישי לקונה, לפי סטטוס
 * ============================================================
 *
 *  בליד מנגר יש סטטוס שמעביר ליד לקונה. אותו דבר כאן:
 *  אתה מגדיר בהגדרות הסטטוסים שסטטוס מסוים - למשל
 *  "הועבר לאלעד" - מעביר את הליד אליו.
 *
 *  מה קורה ברגע שליד מקבל סטטוס כזה:
 *
 *   1. **נרשמת כניסת מכירה** עם המחיר שהגדרת. זו ההגעה
 *      שהקונה משלם עליה, והיא זו שתופיע במסך המכירה
 *      ובדוח ההתחשבנות.
 *   2. **הליד עובר לערוץ המכירה** ויוצא מהרשימה האישית,
 *      לפי הכלל שלך: מה שקשור לקונה שייך אך ורק אליו.
 *   3. **הוא נשלח לקונה** דרך אותו מנגנון שליחה עם היומן,
 *      כך שתוכל להוכיח מתי נשלח ומה השרת שלו החזיר.
 *   4. **אוטומציות שלך מבוטלות** - ליד של הקונה לא מקבל
 *      ממך הודעות.
 *
 *  ההעברה נעשית **פעם אחת בלבד**: החזרת הסטטוס קדימה ואחורה
 *  לא תמכור את אותו ליד פעמיים, כי כניסת המכירה כבר קיימת.
 */

/**
 * שים לב: אין כאן import של המסד בראש הקובץ.
 *
 * הקובץ נטען גם מהבדיקות, ושליפה עצלה היא מה שמאפשר לבדוק
 * את ההיגיון בלי להרים מסד נתונים.
 */

/**
 * הסימון שמבדיל כניסה שנוצרה מהעברה ידנית מכניסה שנכנסה
 * מקמפיין. זה מה שמונע מכירה כפולה של אותו ליד.
 */
export const TRANSFER_SOURCE = "העברה לפי סטטוס";

export type TransferResult =
  | { transferred: false; reason: string }
  | { transferred: true; buyer: string; price: number; queued: boolean };

/**
 * מריץ העברה אם הסטטוס מוגדר כמעביר.
 *
 * נקרא מתוך applyStatusChange, שהיא נקודת הכניסה היחידה
 * לשינוי סטטוס - ולכן זה עובד מכל מקום: מכרטיס הליד,
 * מהבוט, מהמנוע ומקליטת ליד מנגר.
 */
export async function transferOnStatus(
  leadId: string,
  statusName: string
): Promise<TransferResult> {
  const { db } = await import("./db");

  const status = await db.status
    .findUnique({
      where: { name: statusName },
      select: {
        name: true,
        transferChannelId: true,
        transferBuyerId: true,
        transferPrice: true,
      },
    })
    .catch(() => null);

  if (!status) return { transferred: false, reason: "הסטטוס לא נמצא" };

  /**
   * ערוץ קודם: הוא מחזיק את הוובוק, המחיר וההגדרות, ולכן
   * אין מה להגדיר פעמיים. קונה נשאר נתמך להגדרות ותיקות.
   */
  const { channelById } = await import("./channels");
  const channel = await channelById(status.transferChannelId).catch(() => null);

  const buyer = channel
    ? null
    : status.transferBuyerId
      ? await db.leadBuyer
          .findUnique({ where: { id: status.transferBuyerId } })
          .catch(() => null)
      : null;

  if (!channel && !buyer) {
    return { transferred: false, reason: "הסטטוס לא מעביר לאף ערוץ" };
  }

  const targetName = channel ? `${channel.campaignName} · ${channel.name}` : buyer!.name;

  /**
   * ההגנה מפני מכירה כפולה: אם לליד כבר יש כניסה שנוצרה
   * מהעברה, לא נוצרת עוד אחת.
   *
   * בלי זה, שינוי סטטוס הלוך-וחזור היה מחייב את הקונה שוב
   * ושוב על אותו ליד.
   */
  const already = await db.leadEntry
    .findFirst({
      where: { leadId, source: TRANSFER_SOURCE },
      select: { id: true },
    })
    .catch(() => null);

  if (already) {
    return { transferred: false, reason: "הליד הזה כבר הועבר בעבר" };
  }

  /**
   * המחיר מגיע מהערוץ. המחיר שעל הסטטוס נשאר כגיבוי
   * להגדרות ותיקות שאין להן ערוץ.
   */
  const price = channel ? channel.price : Number(status.transferPrice ?? 0);
  const isSale = channel ? channel.isSale : true;

  const entry = await db.leadEntry
    .create({
      data: {
        leadId,
        campaign: status.name,
        source: TRANSFER_SOURCE,
        via: "manual",
        channelId: channel?.id ?? null,
        isSale,
        price,
        at: new Date(),
      },
    })
    .catch(() => null);

  if (!entry) {
    return { transferred: false, reason: "לא ניתן לרשום את הכניסה" };
  }

  /**
   * ליד שעבר לערוץ מכירה יוצא מהרשימה האישית ולא מקבל
   * ממך הודעות. ליד שעבר לערוץ שלך (למשל איזי פיזי) נשאר
   * אצלך - הוא רק נשלח גם למערכת אחרת.
   */
  if (isSale) {
    await db.lead
      .update({ where: { id: leadId }, data: { origin: "sale" } })
      .catch(() => null);

    await db.scheduledJob
      .updateMany({
        where: { leadId, state: "pending" },
        data: { state: "cancelled", lastError: `הועבר ל${targetName}` },
      })
      .catch(() => null);
  }

  await db.leadEvent
    .create({
      data: {
        leadId,
        type: "transferred_to_buyer",
        toStatus: status.name,
        actor: "system",
        payload: { target: targetName, price, isSale },
      },
    })
    .catch(() => null);

  const { queueDelivery } = await import("./delivery");

  const queued = await queueDelivery({
    leadId,
    entryId: entry.id,
    campaign: status.name,
    channelId: channel?.id ?? null,
    buyerId: buyer?.id ?? null,
  }).catch(() => false);

  return { transferred: true, buyer: targetName, price, queued };
}
