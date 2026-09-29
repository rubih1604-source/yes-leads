import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  בדיקת בריאות של ההתראות
 * ============================================================
 *
 *  הבעיה עד היום: כשערוץ התראה נשבר, גילית את זה רק כשכבר
 *  פספסת לקוח. אין שום סימן מוקדם.
 *
 *  המסך הזה עונה על שאלה אחת: **אם תיפול תזכורת בדקה הבאה,
 *  היא תגיע אליי?**
 *
 *  כל שורה כאן היא בדיקה אמיתית של המצב הנוכחי, לא הנחה.
 */

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getSettings().catch(() => null);

  const [devices, stuck, dueSoon, lastRunRow] = await Promise.all([
    db.pushSubscription.count().catch(() => -1),
    // תזכורות שעבר זמנן ועדיין לא יצאו - זה הדגל האדום
    db.task
      .count({
        where: {
          done: false,
          notifiedAt: null,
          dueAt: { not: null, lte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      })
      .catch(() => -1),
    db.task
      .count({
        where: {
          done: false,
          notifiedAt: null,
          dueAt: { not: null, gte: new Date() },
        },
      })
      .catch(() => -1),
    db.settings.findUnique({ where: { id: "main" } }).catch(() => null),
  ]);

  const emailReady = Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.ALERT_EMAIL?.trim()
  );
  const pushReady = pushConfigured();

  const lastRun = lastRunRow?.lastRunAt ?? null;
  const engineAlive = Boolean(
    lastRun && Date.now() - lastRun.getTime() < 3 * 60 * 1000
  );

  const toBanner = settings?.notifyBanner ?? true;
  const toPush = settings?.notifyPush ?? true;
  const toEmail = settings?.notifyEmail ?? true;

  /**
   * ערוץ "עובד" רק אם הוא גם דלוק וגם באמת מסוגל לשלוח.
   * דלוק בלי הגדרות = לא עובד, וזו בדיוק הטעות שהסתתרה.
   */
  const channels = [
    {
      name: "באנר במערכת",
      on: toBanner,
      ready: true,
      note: toBanner
        ? "פעיל. לא תלוי בשום שירות חיצוני"
        : "כבוי בהגדרות",
    },
    {
      name: "התראה לנייד",
      on: toPush,
      ready: pushReady && devices > 0,
      note: !toPush
        ? "כבוי בהגדרות"
        : !pushReady
        ? "חסרים מפתחות VAPID במשתני הסביבה"
        : devices === 0
        ? "אין אף מכשיר רשום - צריך להירשם מהנייד"
        : `${devices} מכשירים רשומים`,
    },
    {
      name: "מייל",
      on: toEmail,
      ready: emailReady,
      note: !toEmail
        ? "כבוי בהגדרות"
        : emailReady
        ? "מוגדר"
        : "חסרים RESEND_API_KEY או ALERT_EMAIL",
    },
  ];

  const working = channels.filter((c) => c.on && c.ready);

  /**
   * המסקנה בשורה אחת, בעברית. זה מה שחשוב לקרוא.
   */
  let verdict: string;
  let ok = true;

  if (!engineAlive) {
    verdict = "המנוע לא רץ. שום תזכורת לא תצא עד שהוא יחזור";
    ok = false;
  } else if (working.length === 0) {
    verdict = "אין אף ערוץ שעובד. תזכורות לא יגיעו אליך";
    ok = false;
  } else if (stuck > 0) {
    verdict = `${stuck} תזכורות עבר זמנן ולא יצאו - משהו נכשל`;
    ok = false;
  } else {
    verdict = `תקין. תזכורת תגיע ב-${working.length} ערוצים: ${working
      .map((c) => c.name)
      .join(", ")}`;
  }

  return NextResponse.json({
    ok,
    verdict,
    engine: {
      alive: engineAlive,
      lastRunAt: lastRun,
      note: engineAlive ? "רץ בדקה האחרונה" : "לא נתן סימן חיים 3 דקות",
    },
    channels,
    tasks: {
      stuck,
      dueSoon,
      note:
        stuck > 0
          ? "תזכורות תקועות - הן ינסו שוב בכל דקה עד שיצליחו"
          : "אין תזכורות תקועות",
    },
  });
}
