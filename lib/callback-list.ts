/**
 * ============================================================
 *  רשימת חזרה
 * ============================================================
 *
 *  לידים שלא סגרו ולא נעלמו - "אין מענה 2", "שיחת המשך",
 *  "נשלחה הצעת מחיר". הם לא דורשים פעולה מיידית, אבל אם
 *  לא תחזור אליהם הם פשוט יתפוגגו.
 *
 *  הרעיון: במקום שתזכור, המערכת אוספת אותם ומגישה לך
 *  רשימה מרוכזת פעמיים ביום.
 *
 *  החלוקה שביקשת:
 *    סטטוס ששונה עד 18:00  ->  רשימה למחרת ב-10:00
 *    סטטוס ששונה אחרי 18:00 ->  רשימה למחרת ב-13:00
 *
 *  ככה כל ליד מקבל לפחות לילה של "מנוחה" לפני שחוזרים אליו,
 *  ואתה מקבל שתי רשימות ברורות במקום טפטוף כל היום.
 */

import { db } from "./db";
import { getSettings } from "./settings";
import { israelParts, fromIsrael } from "./working-hours";

export type CallbackLead = {
  id: string;
  name: string;
  phone: string;
  status: string;
  queuedAt: Date;
};

export type Slot = "morning" | "afternoon";

/**
 * מסמן ליד כמועמד לרשימת חזרה.
 * נקרא בכל שינוי סטטוס.
 */
export async function queueForCallback(leadId: string, status: string) {
  const settings = await getSettings();

  if (!settings.callbackEnabled) return;
  if (!settings.callbackStatuses.includes(status)) return;

  await db.lead
    .update({
      where: { id: leadId },
      data: { callbackQueuedAt: new Date(), callbackSentAt: null },
    })
    .catch(() => null);
}

/**
 * מי שייך לרשימה של המשבצת הזו.
 *
 * הבוקר לוקח את מה שנכנס עד שעת החיתוך אתמול.
 * הצהריים לוקח את מה שנכנס אחריה.
 */
export async function leadsForSlot(
  slot: Slot,
  now = new Date()
): Promise<CallbackLead[]> {
  const settings = await getSettings();
  if (!settings.callbackEnabled) return [];

  const p = israelParts(now);
  const todayStart = fromIsrael(p.year, p.month, p.day, 0);
  const yesterdayCutoff = new Date(
    todayStart.getTime() - 24 * 60 * 60 * 1000 + settings.callbackCutoffHour * 3600000
  );

  const where =
    slot === "morning"
      ? { lt: yesterdayCutoff }
      : { gte: yesterdayCutoff, lt: todayStart };

  const leads = await db.lead.findMany({
    where: {
      callbackSentAt: null,
      callbackQueuedAt: { not: null, ...where },
      doNotContact: false,
      status: { in: settings.callbackStatuses },
    },
    orderBy: { callbackQueuedAt: "asc" },
    take: 200,
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      callbackQueuedAt: true,
    },
  });

  return leads.map((l) => ({
    id: l.id,
    name: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || l.phone,
    phone: l.phone,
    status: l.status,
    queuedAt: l.callbackQueuedAt!,
  }));
}

/** כל מי שממתין לרשימה, בלי חלוקה למשבצות */
export async function pendingCallbacks(): Promise<CallbackLead[]> {
  const settings = await getSettings();

  const leads = await db.lead.findMany({
    where: {
      callbackQueuedAt: { not: null },
      callbackSentAt: null,
      doNotContact: false,
      ...(settings.callbackStatuses.length
        ? { status: { in: settings.callbackStatuses } }
        : {}),
    },
    orderBy: { callbackQueuedAt: "asc" },
    take: 200,
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      callbackQueuedAt: true,
    },
  });

  return leads.map((l) => ({
    id: l.id,
    name: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || l.phone,
    phone: l.phone,
    status: l.status,
    queuedAt: l.callbackQueuedAt!,
  }));
}

export async function markSent(ids: string[]) {
  if (ids.length === 0) return;
  await db.lead
    .updateMany({
      where: { id: { in: ids } },
      data: { callbackSentAt: new Date() },
    })
    .catch(() => null);
}
