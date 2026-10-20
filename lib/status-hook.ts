/**
 * ============================================================
 *  וובוק יוצא בשינוי סטטוס
 * ============================================================
 *
 *  כשליד מקבל סטטוס מסוים, המערכת שולחת הודעה לכתובת
 *  חיצונית. ככה אתה מחבר את המערכת שלך לכל מערכת אחרת -
 *  easypeasy, n8n, ספק, או קונה עתידי - בלי לגעת בקוד.
 *
 *  **זה שולח בלבד.** הוא לא מוכר את הליד, לא מעביר אותו
 *  לערוץ המכירה ולא מוציא אותו מהרשימה שלך. מי שמעביר
 *  לקונה הוא "העברה לקונה", וזה מנגנון נפרד בכוונה: שליחה
 *  לצורך עדכון ומכירה של ליד הם שני דברים שונים, וערבוב
 *  שלהם היה אומר שכל עדכון חוצה מערכות גם מוכר לידים.
 *
 *  כל ניסיון נרשם בציר הזמן של הליד, וכשל יוצר התראה -
 *  כדי שלא יקרה שהמערכת מנסה לדבר עם שרת שמת, ואתה לא
 *  יודע.
 */

import { deliveryVerdict } from "./delivery-payload";
import { hookBody } from "./hook-payload";

export type HookResult =
  | { sent: false; reason: string }
  | { sent: true; httpStatus: number; ok: boolean; error: string | null };

/**
 * שולח, אם הסטטוס מוגדר עם כתובת.
 *
 * נקרא מתוך applyStatusChange, ולכן עובד מכל מקום שבו
 * סטטוס משתנה: כרטיס הליד, הבוט, המנוע וקליטת ליד מנגר.
 */
export async function fireStatusHook(
  leadId: string,
  statusName: string
): Promise<HookResult> {
  const { db } = await import("./db");

  const status = await db.status
    .findUnique({
      where: { name: statusName },
      select: {
        hookUrl: true,
        hookTemplate: true,
        hookHeaders: true,
        hookSecret: true,
        hookActive: true,
      },
    })
    .catch(() => null);

  const url = status?.hookUrl?.trim();

  if (!url) return { sent: false, reason: "לסטטוס הזה לא מוגדרת כתובת" };
  if (!status?.hookActive) return { sent: false, reason: "הוובוק כבוי" };

  const lead = await db.lead
    .findUnique({
      where: { id: leadId },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        extra: true,
        status: true,
      },
    })
    .catch(() => null);

  if (!lead) return { sent: false, reason: "הליד לא נמצא" };

  const body = hookBody({
    lead,
    at: new Date(),
    statusName,
    template: status.hookTemplate,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const secret = status.hookSecret?.trim();
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  /**
   * כותרות של הצד השני נכתבות אחרי ברירת המחדל כדי שיגברו.
   */
  const custom =
    status.hookHeaders &&
    typeof status.hookHeaders === "object" &&
    !Array.isArray(status.hookHeaders)
      ? (status.hookHeaders as Record<string, unknown>)
      : {};

  for (const [name, value] of Object.entries(custom)) {
    if (typeof value === "string" && name.trim() && value.trim()) {
      headers[name.trim()] = value.trim();
    }
  }

  let httpStatus = 0;
  let responseText = "";
  let networkError = "";

  try {
    /**
     * פסק זמן של 15 שניות. שרת שלא עונה לא יתקע את שינוי
     * הסטטוס - הסטטוס כבר השתנה, והשליחה היא תוספת.
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    httpStatus = response.status;
    responseText = (await response.text().catch(() => "")).slice(0, 400);
  } catch (err) {
    networkError =
      err instanceof Error ? err.message.slice(0, 200) : "שגיאת רשת";
  }

  const verdict =
    httpStatus === 0
      ? { ok: false, reason: networkError || "לא התקבלה תשובה" }
      : deliveryVerdict({ httpStatus, body: responseText });

  const error = verdict.ok ? null : networkError || verdict.reason;

  /**
   * כל ניסיון נרשם על הליד, כדי שתוכל לראות בציר הזמן שלו
   * מה נשלח ומה חזר.
   */
  await db.leadEvent
    .create({
      data: {
        leadId,
        type: verdict.ok ? "hook_sent" : "hook_failed",
        toStatus: statusName,
        actor: "system",
        payload: {
          url,
          httpStatus,
          response: responseText.slice(0, 200),
          error,
        },
      },
    })
    .catch(() => null);

  /**
   * כשל יוצר התראה. שליחה שנכשלת בשקט היא בדיוק מה שמוביל
   * לגילוי מאוחר שמערכת אחרת לא מעודכנת כבר שבוע.
   */
  if (!verdict.ok) {
    await db.alert
      .create({
        data: {
          leadId,
          title: "וובוק יוצא נכשל",
          body: `סטטוס "${statusName}" · ${error ?? "שגיאה"}`,
        },
      })
      .catch(() => null);
  }

  return { sent: true, httpStatus, ok: verdict.ok, error };
}
