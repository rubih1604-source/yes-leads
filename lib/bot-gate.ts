/**
 * ============================================================
 *  מתי העוזר מדבר
 * ============================================================
 *
 *  הכלל פשוט: **אתה עובד בלי מגבלות. הבוט עובד לפי מה
 *  שהגדרת.**
 *
 *  כל פעולה שאתה עושה - שינוי סטטוס, שליחת תבנית, דיוור -
 *  יוצאת מיד, בכל שעה. הקובץ הזה נוגע רק לבוט.
 *
 *  הבוט עונה רק אם **כל** התנאים מתקיימים:
 *
 *   1. הוא דלוק
 *   2. השעה בתוך החלון שהגדרת
 *   3. הליד נמצא באחד הסטטוסים שבחרת
 *   4. לא השתקת אותו מול הלקוח הזה
 *   5. אתה לא באמצע שיחה איתו
 *   6. הוא לא ענה לו כרגע
 *
 *  אם אחד מהם לא מתקיים - הוא שותק, ואתה מקבל התראה.
 */

import { db } from "./db";
import { getSettings } from "./settings";
import { israelParts, withinBotHours } from "./working-hours";

export type GateDecision = {
  allowed: boolean;
  reason: string;
  /** מצב שירות בלבד - נשמר לתאימות, לא בשימוש כרגע */
  serviceOnly: boolean;
};

const NO = (reason: string): GateDecision => ({
  allowed: false,
  reason,
  serviceOnly: false,
});


/**
 * ============================================================
 *  מה השער בודק, ומה לא
 * ============================================================
 *
 *  "general" - הבוט מדבר ביוזמתו על הודעה רגילה. כאן חלה
 *  גם מגבלת הסטטוסים: הוא עונה רק ללידים בסטטוסים שבחרת.
 *
 *  "broadcast" - זו תגובה לדיוור, ומדובר בשאלת הסינון.
 *  **מגבלת הסטטוסים לא חלה.**
 *
 *  **הבאג שזה מתקן.** נמען דיוור שנטען מקובץ נוצר עם
 *  סטטוס "נמען דיוור", שלא קיים ברשימת הסטטוסים שבחרת -
 *  ולכן הוא נחסם בשקט ולא קיבל את השאלה, בזמן שליד ותיק
 *  עם סטטוס מוכר כן קיבל. אותו דיוור, שתי התנהגויות.
 *
 *  כל שאר התנאים נשארים בשני המצבים: בוט כבוי, מחוץ
 *  לשעות, מושתק, ליד של אלעד, או שאתה באמצע שיחה.
 */
export type GateScope = "general" | "broadcast";

export async function shouldBotReply(
  leadId: string,
  scope: GateScope = "general"
): Promise<GateDecision> {
  const settings = await getSettings();

  if (!settings.botEnabled) {
    return NO("הבוט כבוי");
  }

  const now = new Date();

  if (!withinBotHours(settings.botFromHour, settings.botToHour, now)) {
    return NO(
      `מחוץ לשעות הבוט (${settings.botFromHour}:00–${settings.botToHour}:00)`
    );
  }

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NO("הליד לא נמצא");

  // ליד מכירה שייך לקונה. אנחנו לא מדברים איתו.
  if (lead.origin === "sale") {
    return NO("ליד מכירה - אין אוטומציה");
  }

  if (lead.botMuted) {
    return NO("הבוט מושתק מול הלקוח הזה");
  }

  /**
   * ============================================================
   *  מגבלת הסטטוסים - ולמה היא לא חלה במצב "רק דיוור"
   * ============================================================
   *
   *  במצב הרגיל הסטטוסים הם התיחום: הבוט עונה רק למי
   *  שבסטטוסים שבחרת, כדי שלא יתחיל לדבר עם כל המסד.
   *
   *  במצב "רק דיוור" **המצב עצמו הוא התיחום** - הבוט נוגע
   *  רק בתגובות לדיוור וכלום מעבר. מגבלת הסטטוסים שם לא
   *  מגנה על כלום, והיא רק הייתה גורמת לכך שמי שקיבל
   *  דיוור בסטטוס שלא סימנת לא יקבל את שאלת הסינון - וזו
   *  בדיוק המטרה של המצב.
   */
  if (scope === "general" && settings.botMode !== "broadcast") {
    if (settings.botStatuses.length === 0) {
      return NO("לא נבחרו סטטוסים שהבוט עונה עליהם");
    }

    if (!settings.botStatuses.includes(lead.status)) {
      return NO(`הבוט לא עונה בסטטוס "${lead.status}"`);
    }
  }

  // אתה ענית ללקוח לאחרונה - הבוט לא מתערב
  if (lead.botPausedUntil && lead.botPausedUntil > now) {
    const until = lead.botPausedUntil.toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return NO(`אתה בשיחה עם הלקוח - הבוט שותק עד ${until}`);
  }

  // שיחה חיה: כמה הודעות בזמן קצר = אתה כנראה בפנים
  const liveWindow = new Date(
    now.getTime() - settings.liveChatMinutes * 60000
  );

  const recentInbound = await db.message.count({
    where: { leadId, direction: "in", createdAt: { gte: liveWindow } },
  });

  if (recentInbound >= 2) {
    return NO(
      `הלקוח שלח ${recentInbound} הודעות ב-${settings.liveChatMinutes} הדקות האחרונות - נראה שאתה באמצע שיחה`
    );
  }

  // מניעת הצפה
  const cooldownStart = new Date(
    now.getTime() - settings.replyCooldownMinutes * 60000
  );

  const recentReply = await db.message.findFirst({
    where: {
      leadId,
      direction: "out",
      templateName: null,
      status: "sent",
      createdAt: { gte: cooldownStart },
    },
  });

  if (recentReply) {
    return NO(
      `הבוט כבר ענה בדקות האחרונות (המתנה של ${settings.replyCooldownMinutes} דקות)`
    );
  }

  return { allowed: true, reason: "", serviceOnly: false };
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
