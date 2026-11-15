import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  האם המערכת באמת עובדת
 * ============================================================
 *
 *  **למה המסך הזה קיים.**
 *
 *  שני חלקים מרכזיים נכשלו בשקט במשך שעות: הבוט קרס על
 *  כל הודעה נכנסת, והמנוע שמריץ משימות מתוזמנות קרס בכל
 *  סבב. בשני המקרים השגיאה נבלעה, והמסכים המשיכו להראות
 *  שהכל תקין.
 *
 *  כאן שואלים את השאלות שבאמת חשובות, ומקבלים תשובה
 *  מהנתונים עצמם:
 *
 *    - המנוע רץ בדקות האחרונות?
 *    - יש משימות שעבר זמנן ולא יצאו?
 *    - הבוט קרס לאחרונה?
 *    - לידים עדיין נכנסים מפייסבוק ומליד מנגר?
 *    - הודעות נכנסות עדיין מגיעות?
 *
 *  קוראת בלבד.
 */

const MINUTE = 60 * 1000;

function minutesAgo(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.round((Date.now() - date.getTime()) / MINUTE);
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * MINUTE);

  const settings = await getSettings();

  const [overdue, pending, failedJobs, botCrashes, inbound, intake] =
    await Promise.all([
      /** משימות שהגיע זמנן וטרם רצו - הסימן הברור שהמנוע תקוע */
      db.scheduledJob
        .count({ where: { state: "pending", runAt: { lte: now } } })
        .catch(() => -1),
      db.scheduledJob.count({ where: { state: "pending" } }).catch(() => -1),
      db.scheduledJob
        .count({ where: { state: "failed", createdAt: { gte: dayAgo } } })
        .catch(() => -1),
      db.leadEvent
        .count({ where: { type: "bot_failed", createdAt: { gte: dayAgo } } })
        .catch(() => -1),
      db.message
        .count({ where: { direction: "in", createdAt: { gte: dayAgo } } })
        .catch(() => -1),
      db.leadEntry
        .count({ where: { at: { gte: dayAgo } } })
        .catch(() => -1),
    ]);

  /**
   * ============================================================
   *  ההתראות - הערוץ שנכשל בשקט
   * ============================================================
   *
   *  "לא קיבלתי התראה על ליד" ו"ההתראות בנייד פעם עובדות
   *  ופעם לא" היו שאלות בלי תשובה: כשל נכתב לקונסול של
   *  רנדר ונעלם, ומנוי שפג תוקפו נמחק בשקט.
   */
  const [devices, brokenDevices, notifyFailed] = await Promise.all([
    db.pushSubscription.count().catch(() => -1),
    db.pushSubscription
      .count({ where: { lastError: { not: null } } })
      .catch(() => -1),
    db.leadEvent
      .count({ where: { type: "notify_failed", createdAt: { gte: dayAgo } } })
      .catch(() => -1),
  ]);

  const ranAgo = minutesAgo(settings.engineRanAt);

  /**
   * ============================================================
   *  האם המשימות יוצאות בזמן שהגדרת
   * ============================================================
   *
   *  **השאלה שלא הייתה לה תשובה:** "הגדרתי שישלח אחרי
   *  דקה, וזה הגיע אחרי 7-8 דקות."
   *
   *  כאן נמדד האיחור בפועל - ההפרש בין הזמן שהמשימה
   *  תוזמנה אליו לבין הזמן שהיא באמת רצה. זה מפריד בין
   *  שתי סיבות שנראות זהות מבחוץ:
   *
   *  · הטיימר נרדם (מרווח גדול בין סבבים) → צריך מתזמן
   *    חיצוני שמעיר את השרת.
   *  · הטיימר רץ אבל המשימה נדחתה → הבעיה בקוד.
   */
  const lateJobs = await db.scheduledJob
    .findMany({
      where: {
        state: "done",
        ranAt: { not: null, gte: dayAgo },
      },
      select: { runAt: true, ranAt: true },
      take: 300,
    })
    .catch(() => []);

  const delays = lateJobs
    .map((j) =>
      j.ranAt ? Math.round((j.ranAt.getTime() - j.runAt.getTime()) / 1000) : 0
    )
    .filter((d) => d >= 0);

  const avgDelay = delays.length
    ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
    : 0;
  const maxDelay = delays.length ? Math.max(...delays) : 0;

  const gap = settings.engineGapSeconds;
  const worstGap = settings.engineWorstGap;

  /**
   * הטיימר אמור לרוץ כל 60 שניות. מרווח של יותר מ-150
   * שניות פירושו שהוא נרדם - לא שהוא עסוק.
   */
  const timerAsleep = (worstGap ?? 0) > 150;

  if (timerAsleep) {
    problems.push(
      `המנוע נרדם: המרווח הגרוע בין סבבים היה ${worstGap} שניות במקום 60. לכן הודעות יוצאות באיחור. הפתרון הוא מתזמן חיצוני שמעיר את השרת כל דקה - ראה "הפעלה חיצונית" למטה.`
    );
  } else if (maxDelay > 180) {
    problems.push(
      `משימה יצאה באיחור של ${Math.round(maxDelay / 60)} דקות, והמנוע דווקא רץ בזמן. כלומר העיכוב אינו בטיימר.`
    );
  }

  /**
   * המנוע אמור לרוץ כל דקה. יותר מחמש דקות בלי סבב
   * פירושו שהוא לא רץ - לא שהוא "עסוק".
   */
  const engineAlive = ranAgo !== null && ranAgo <= 5;

  const problems: string[] = [];

  if (!settings.engineRanAt) {
    problems.push(
      "המנוע לא רשם אף סבב. או שהשרת עלה הרגע, או שהוא לא רץ בכלל."
    );
  } else if (!engineAlive) {
    problems.push(
      `המנוע לא רץ כבר ${ranAgo} דקות. משימות מתוזמנות לא יוצאות.`
    );
  }

  if (settings.engineError) {
    problems.push(`הסבב האחרון של המנוע נכשל: ${settings.engineError.slice(0, 200)}`);
  }

  if (overdue > 0) {
    problems.push(
      `${overdue} משימות שהגיע זמנן וטרם יצאו. אם המספר לא יורד בדקות הקרובות - המנוע תקוע.`
    );
  }

  if (botCrashes > 0) {
    problems.push(
      `הבוט קרס ${botCrashes} פעמים ביממה האחרונה. לקוחות שכתבו לא קיבלו תשובה.`
    );
  }

  /**
   * המתג כבוי הוא מצב תקין ומכוון - אחרי דיוור מכבים
   * אותו. זו תזכורת, לא תקלה, ולכן היא לא נספרת כבעיה.
   */
  /**
   * **מתג דלוק בלי טקסט דיוור = בוט ששותק לכולם.** זה לא
   * מצב תקין אלא תקלה שנראית כמו בוט שבור, ולכן היא
   * נספרת כבעיה ולא כהערה.
   */
  const { anchorsOf } = await import("@/lib/campaign-audience");
  const campaignReady =
    settings.campaignText.trim().length > 0 &&
    anchorsOf(settings.campaignText).length > 0;

  if (settings.campaignBot && !campaignReady) {
    problems.push(
      settings.campaignText.trim().length === 0
        ? "בוט הדיוור דלוק אבל לא הוכנס טקסט דיוור - הוא לא יענה לאף אחד. הגדרות → בוט הדיוור."
        : "טקסט הדיוור קצר מדי לזיהוי - הבוט לא יענה לאף אחד. הדבק את ההודעה המלאה ששלחת."
    );
  }

  const botNote = !settings.campaignBot
    ? "בוט הדיוור כבוי - הודעות נשמרות ואתה מקבל התראה, אבל שום דבר לא נשלח ללקוח."
    : campaignReady
      ? "בוט הדיוור דלוק - מי שקיבל את הדיוור ומגיב מקבל תשובה. מי שלא קיבל, לא."
      : "בוט הדיוור דלוק אבל חסר לו טקסט דיוור תקין - ראה בעיות למעלה.";

  if (failedJobs > 0) {
    problems.push(`${failedJobs} משימות נכשלו ביממה האחרונה.`);
  }

  /**
   * ============================================================
   *  האם ההודעות באמת מגיעות ללקוחות
   * ============================================================
   *
   *  **השאלה שלא הייתה לה תשובה.** המערכת רשמה "נשלח"
   *  לפי קוד HTTP מטקסטר, כלומר "קיבלתי את הבקשה". אם
   *  ההודעה נפלה אחר כך - תבנית מושהית, מספר שאינו
   *  בוואטסאפ - אף אחד לא ידע.
   *
   *  כאן נספר מה באמת קרה. שני מצבים אפשריים, ולכל אחד
   *  משמעות אחרת:
   *
   *  · יש אישורי מסירה → הודעה שתקועה ב"יצא לטקסטר" היא
   *    חשודה, ואפשר להצביע עליה.
   *  · אין אף אישור מעולם → טקסטר לא שולחת אישורי מסירה
   *    לכתובת שלנו, ואז **אי אפשר לדעת** - וזה בדיוק מה
   *    שצריך להיאמר, במקום להציג "נשלח" כאילו זה ודאי.
   */
  const halfHourAgo = new Date(now.getTime() - 30 * MINUTE);

  const [outDay, deliveredDay, failedDay, stuck, deliveredEver] =
    await Promise.all([
      db.message
        .count({ where: { direction: "out", createdAt: { gte: dayAgo } } })
        .catch(() => -1),
      db.message
        .count({
          where: {
            direction: "out",
            status: { in: ["delivered", "read"] },
            createdAt: { gte: dayAgo },
          },
        })
        .catch(() => -1),
      db.message
        .count({
          where: {
            direction: "out",
            status: "failed",
            createdAt: { gte: dayAgo },
          },
        })
        .catch(() => -1),
      db.message
        .count({
          where: {
            direction: "out",
            status: { in: ["accepted", "sent"] },
            createdAt: { gte: dayAgo, lte: halfHourAgo },
          },
        })
        .catch(() => -1),
      db.message
        .count({ where: { status: { in: ["delivered", "read"] } } })
        .catch(() => -1),
    ]);

  const confirmationsWork = deliveredEver > 0;

  if (failedDay > 0) {
    problems.push(
      `${failedDay} הודעות לא הגיעו ללקוח ביממה האחרונה. כרטיס הליד מראה את הסיבה על ההודעה עצמה.`
    );
  }

  if (!confirmationsWork && outDay > 0) {
    problems.push(
      "טקסטר לא שולחת אלינו אישורי מסירה, ולכן אי אפשר לדעת אם ההודעות מגיעות ללקוחות. הן מסומנות 'יצא לטקסטר' ולא 'נמסר'. בטקסטר: להפעיל התראות מצב הודעה (message status) לאותה כתובת וובוק."
    );
  } else if (confirmationsWork && stuck > 0) {
    problems.push(
      `${stuck} הודעות יצאו לטקסטר לפני יותר מחצי שעה ולא התקבל עליהן אישור מסירה. ייתכן שהן לא הגיעו.`
    );
  }

  const { pushConfigured } = await import("@/lib/push");

  if (!pushConfigured()) {
    problems.push(
      "מפתחות ההתראות לא מוגדרים בשרת - לא תגיע אף התראה לנייד. צריך VAPID_PUBLIC_KEY ו-VAPID_PRIVATE_KEY ברנדר."
    );
  } else if (devices === 0) {
    problems.push(
      "אין אף מכשיר רשום להתראות - לא תגיע אף התראה לנייד. הגדרות → התראות בנייד → הפעל התראות במכשיר הזה."
    );
  } else if (brokenDevices > 0) {
    problems.push(
      `${brokenDevices} מתוך ${devices} מכשירים נכשלו בשליחה האחרונה. הגדרות → התראות בנייד מראה את השגיאה.`
    );
  }

  if (notifyFailed > 0) {
    problems.push(
      `${notifyFailed} לידים נכנסו ביממה האחרונה בלי שיצאה עליהם שום התראה. כרטיס הליד מראה למה.`
    );
  }

  if (intake === 0) {
    problems.push(
      "לא נכנס אף ליד ביממה האחרונה - שווה לבדוק את החיבור לפייסבוק ולליד מנגר."
    );
  }

  return NextResponse.json({
    המנוע: {
      רץ_לאחרונה: settings.engineRanAt
        ? `לפני ${ranAgo} דקות`
        : "אף פעם",
      תקין: engineAlive && !settings.engineError,
      שגיאה_אחרונה: settings.engineError ?? "אין",
    },
    זמני_שליחה: {
      איחור_ממוצע_שניות: avgDelay,
      האיחור_הגדול_שניות: maxDelay,
      מרווח_אחרון_בין_סבבים: gap,
      מרווח_גרוע_ביממה: worstGap,
      הטיימר_נרדם: timerAsleep,
      הפעלה_חיצונית: timerAsleep
        ? `הוסף Cron Job ברנדר שקורא כל דקה ל-${(process.env.APP_URL ?? "https://yes-leads.onrender.com").replace(/\/$/, "")}/api/cron/run?token=<CRON_SECRET>`
        : "לא נדרשת כרגע",
    },
    משימות: {
      שעבר_זמנן: overdue,
      ממתינות: pending,
      נכשלו_ביממה: failedJobs,
    },
    /**
     * **בוט אחד.** קודם היו כאן שתי שורות - "הבוט" עם
     * מצב, שעות ושאלות, ובנוסף "בוט הדיוור". הבוט הקודם
     * נמחק, ולכן דיווח עליו היה מראה מתג שאינו קיים.
     */
    בוט_הדיוור: {
      דלוק: settings.campaignBot,
      קרס_ביממה: botCrashes,
    },
    הודעות_ללקוחות: {
      יצאו_ביממה: outDay,
      אושרו_כנמסרו: deliveredDay,
      נכשלו: failedDay,
      בלי_אישור_מעל_חצי_שעה: stuck,
      טקסטר_שולחת_אישורי_מסירה: confirmationsWork,
    },
    התראות: {
      מפתחות_מוגדרים: Boolean(process.env.VAPID_PUBLIC_KEY?.trim()),
      מכשירים_רשומים: devices,
      מכשירים_עם_שגיאה: brokenDevices,
      לידים_בלי_התראה_ביממה: notifyFailed,
    },
    תנועה_ביממה: {
      הודעות_נכנסות: inbound,
      לידים_שנכנסו: intake,
    },
    בעיות: problems,
    הערה: botNote,
    מסקנה:
      problems.length === 0
        ? "הכל עובד. המנוע רץ, אין משימות תקועות, והבוט לא קרס."
        : `${problems.length} בעיות פתוחות.`,
  });
}
