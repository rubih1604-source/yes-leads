/**
 * ============================================================
 *  מתי הבוט מדבר ומתי הוא שותק
 * ============================================================
 *
 *  העיקרון: **ברגע שאתה נכנס לשיחה, הבוט זז הצידה.**
 *
 *  הוא שותק אם:
 *  1. כיבית אותו לגמרי בהגדרות
 *  2. השתקת אותו מול הלקוח הזה
 *  3. ענית ללקוח בעצמך לאחרונה (השתקה אוטומטית)
 *  4. הוא כבר ענה לו לפני רגע (מניעת הצפה)
 *  5. בחרת שהוא יענה רק מחוץ לשעות הפעילות, ועכשיו שעות פעילות
 */

import { db } from "./db";
import { getSettings } from "./settings";
import { isWithinWorkingHours } from "./working-hours";

export type GateDecision = {
  allowed: boolean;
  reason: string;
  /**
   * מצב "רק שירות": העוזר יענה על שאלות שירות וטכניקה,
   * אבל **לא** יגיב לפניות מכירתיות - אלה מחכות להחלטה שלך.
   */
  serviceOnly: boolean;
};

export async function shouldBotReply(leadId: string): Promise<GateDecision> {
  const settings = await getSettings();

  if (!settings.botEnabled) {
    return { allowed: false, reason: "הבוט כבוי בהגדרות", serviceOnly: false };
  }

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { allowed: false, reason: "הליד לא נמצא", serviceOnly: false };

  if (lead.botMuted) {
    return {
      allowed: false,
      reason: "הבוט מושתק מול הלקוח הזה",
      serviceOnly: false,
    };
  }

  const now = new Date();

  if (lead.botPausedUntil && lead.botPausedUntil > now) {
    const until = lead.botPausedUntil.toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      allowed: false,
      reason: `אתה בשיחה עם הלקוח - הבוט שותק עד ${until}`,
      serviceOnly: false,
    };
  }

  /**
   * "לענות רק מחוץ לשעות" **אינו** השתקה מלאה.
   * בשעות העבודה העוזר עדיין עונה על שאלות שירות - זה חוסך לך זמן
   * ולא מסכן כלום. אבל פנייה מכירתית ("מעוניין להצטרף") לא מקבלת
   * תשובה אוטומטית: אתה רואה אותה ומחליט בעצמך.
   */
  const serviceOnly = settings.botOnlyOutsideHours && isWithinWorkingHours(now);

  /**
   * הכלל שביקשת: אחרי שהעוזר כבר ענה וסיווג פעם אחת -
   * הוא לא עונה שוב, **אלא אם זה מחוץ לשעות העבודה שלך**.
   * בשעות העבודה אתה רואה את ההודעה ועונה בעצמך.
   */
  const repliedRecently = await db.leadEvent.findFirst({
    where: {
      leadId,
      type: { in: ["bot_answered", "bot_classified"] },
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
  });

  if (repliedRecently && isWithinWorkingHours(now)) {
    return {
      allowed: false,
      reason: "העוזר כבר טיפל בלקוח הזה, ואתה בשעות עבודה - ההודעה מחכה לך",
      serviceOnly: false,
    };
  }

  // מניעת הצפה: לא עונים פעמיים ברצף בפרק זמן קצר
  const cooldownStart = new Date(
    now.getTime() - settings.replyCooldownMinutes * 60000
  );
  const recentBotReply = await db.message.findFirst({
    where: {
      leadId,
      direction: "out",
      templateName: null, // תשובות הבוט הן טקסט חופשי, בלי תבנית
      status: "sent",
      createdAt: { gte: cooldownStart },
    },
  });

  if (recentBotReply) {
    return {
      allowed: false,
      reason: `הבוט כבר ענה בדקות האחרונות (המתנה של ${settings.replyCooldownMinutes} דקות)`,
      serviceOnly: false,
    };
  }

  return { allowed: true, reason: "", serviceOnly };
}

/**
 * נקרא כשאתה עונה ללקוח בעצמך.
 * משתיק את הבוט מולו לפרק הזמן שהגדרת.
 */
export async function pauseBotAfterHumanReply(leadId: string) {
  const settings = await getSettings();
  const until = new Date(Date.now() + settings.botPauseHours * 60 * 60 * 1000);

  await db.lead
    .update({ where: { id: leadId }, data: { botPausedUntil: until } })
    .catch(() => null);

  return until;
}
