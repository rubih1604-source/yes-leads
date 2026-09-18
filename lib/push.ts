/**
 * ============================================================
 *  התראות דחיפה
 * ============================================================
 *
 *  שולח התראה שקופצת על המסך הנעול, גם כשהאפליקציה סגורה.
 *
 *  למה זה חשוב: תזכורת במייל לא מצלצלת, ואם היא נוחתת
 *  בספאם היא פשוט אובדת. Push מגיע תוך שניות ובלתי אפשרי
 *  לפספס אותו.
 *
 *  משתני סביבה:
 *    VAPID_PUBLIC_KEY   - גם בצד הדפדפן
 *    VAPID_PRIVATE_KEY
 *    VAPID_SUBJECT      - mailto של בעל האפליקציה
 */

import { db } from "./db";

export type PushMessage = {
  title: string;
  body?: string;
  url?: string;
  urgent?: boolean;
  tag?: string;
};

export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

/**
 * שולח לכל המכשירים הרשומים.
 *
 * מנוי שנדחה עם 404 או 410 כבר לא תקף - המכשיר הוסר או
 * ההרשאה בוטלה - ולכן מוחקים אותו כדי לא לנסות שוב לנצח.
 */
export async function sendPush(message: PushMessage): Promise<number> {
  if (!pushConfigured()) return 0;

  const subs = await db.pushSubscription.findMany().catch(() => []);
  if (subs.length === 0) return 0;

  // נטען דינמית כדי שהבנייה לא תיפול אם החבילה חסרה
  let webpush: typeof import("web-push");
  try {
    webpush = (await import("web-push")).default ?? (await import("web-push"));
  } catch {
    console.error("[push] החבילה web-push לא מותקנת");
    return 0;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim()
  );

  const payload = JSON.stringify({
    title: message.title,
    body: message.body ?? "",
    url: message.url ?? "/today",
    urgent: message.urgent === true,
    tag: message.tag,
  });

  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;

      if (status === 404 || status === 410) {
        await db.pushSubscription
          .delete({ where: { id: sub.id } })
          .catch(() => null);
      } else {
        console.error("[push] שליחה נכשלה:", status, err);
      }
    }
  }

  return sent;
}
