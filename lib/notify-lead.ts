import { db } from "./db";
import { sendEmail } from "./email";
import {
  subjectFor,
  textFor,
  htmlFor,
  shouldEmail,
  threadIdFor,
  type LeadEmailInput,
} from "./lead-email";

/**
 * ============================================================
 *  התראה על הגעה
 * ============================================================
 *
 *  **מה היה שבור כאן, ולמה לא ידעת על לידים.**
 *
 *  ההתראה הייתה **מייל ובלבד**, ועברה שלושה שערים:
 *  מתג המייל, סינון לפי סוג הערוץ, ו-Resend עצמו. אם אחד
 *  מהם לא עבד, לא נשאר שום סימן בשום מקום - לא התראה
 *  במערכת, לא רישום, ולא שגיאה. השגיאה נבלעה ב-`catch`
 *  ריק. ליד נכנס, ואתה לא ידעת שהוא קיים.
 *
 *  **מעכשיו ההתראה בתוך המערכת היא העיקר, והמייל נוסף
 *  עליה.** הפעמון לא תלוי בשרת מיילים חיצוני: הוא נכתב
 *  למסד שלך, באותה פעולה שבה הליד נשמר. אם המייל נכשל או
 *  מסונן, זה **נרשם** על הליד ואפשר לראות את זה.
 *
 *  **לעולם לא זורק ולא מעכב את הקליטה.** ליד שנכנס חשוב
 *  אינסופית יותר מהתראה עליו.
 */

export type NotifyResult = {
  /** התראה בתוך המערכת - הפעמון */
  alert: boolean;
  /** מייל */
  email: boolean;
  /** למה המייל לא יצא, אם לא יצא */
  emailReason: string | null;
};

export async function notifyNewLead(
  input: Omit<LeadEmailInput, "appUrl"> & {
    /** הגעה חוזרת של מי שכבר היה במערכת */
    returning?: boolean;
    /**
     * ליד שאתה הזנת בעצמך. אין טעם לצלצל לך על מה שהרגע
     * הקלדת, ולכן הפעמון מדלג - המייל עובד כרגיל.
     */
    manual?: boolean;
  }
): Promise<NotifyResult> {
  const out: NotifyResult = { alert: false, email: false, emailReason: null };

  /* ---------- 1. הפעמון. תמיד, ולפני הכל ---------- */
  try {
    /**
     * ליד של ערוץ המכירה הוא של הקונה ולא שלך - אין טעם
     * להתריע לך עליו, בדיוק כמו שהאוטומציות לא רצות עליו.
     */
    if (input.isSale !== true && !input.manual && input.leadId) {
      const name = [input.firstName, input.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const who = name || input.phone;
      const from = input.channelName ? ` · ${input.channelName}` : "";

      await db.alert.create({
        data: {
          leadId: input.leadId,
          title: input.returning ? "ליד נכנס שוב" : "ליד חדש",
          body: `${who}${from}${input.status ? ` · ${input.status}` : ""}`,
        },
      });

      out.alert = true;
    }
  } catch {
    /** הפעמון נכשל - ממשיכים למייל בכל מקרה */
  }

  /* ---------- 2. המייל ---------- */
  try {
    const { getSettings } = await import("./settings");
    const settings = await getSettings();

    if (!settings.notifyEmail) {
      out.emailReason = "מתג המייל כבוי בהגדרות";
    } else if (!shouldEmail(settings.leadEmailMode, input.isSale === true)) {
      out.emailReason = `סינון המייל (${settings.leadEmailMode}) לא כולל את ההגעה הזו`;
    } else {
      const full: LeadEmailInput = {
        ...input,
        appUrl: process.env.APP_URL?.trim() || null,
      };

      /**
       * כל מיילי היום נושאים את אותו מזהה חוט, וג'ימייל
       * מקבץ אותם לשיחה אחת. בלי זה 15 לידים ביום הם 15
       * פריטים נפרדים בתיבה.
       */
      const thread = threadIdFor(full.at);

      out.email = await sendEmail({
        subject: subjectFor(full),
        body: textFor(full),
        html: htmlFor(full),
        headers: {
          References: thread,
          "In-Reply-To": thread,
        },
      });

      if (!out.email) out.emailReason = "שליחת המייל נכשלה";
    }
  } catch (err) {
    out.emailReason =
      err instanceof Error ? err.message.slice(0, 200) : "שגיאה במייל";
  }

  /* ---------- 3. כשל משאיר עקבות ---------- */
  if (out.emailReason && input.leadId) {
    await db.leadEvent
      .create({
        data: {
          leadId: input.leadId,
          type: "notify_failed",
          actor: "system",
          payload: { reason: out.emailReason, alert: out.alert },
        },
      })
      .catch(() => null);
  }

  return out;
}
