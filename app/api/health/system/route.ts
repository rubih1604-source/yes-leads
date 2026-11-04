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

  const ranAgo = minutesAgo(settings.engineRanAt);

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
  const botNote = settings.campaignBot
    ? "בוט הדיוור דלוק - כל מי שכותב מקבל תשובה."
    : "בוט הדיוור כבוי - הודעות נשמרות ואתה מקבל התראה, אבל שום דבר לא נשלח ללקוח.";

  if (failedJobs > 0) {
    problems.push(`${failedJobs} משימות נכשלו ביממה האחרונה.`);
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
