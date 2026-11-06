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
  /** התראה לנייד */
  push: boolean;
  /** מייל */
  email: boolean;
  /** למה הנייד לא קיבל, אם לא קיבל */
  pushReason: string | null;
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
  const out: NotifyResult = {
    alert: false,
    push: false,
    email: false,
    pushReason: null,
    emailReason: null,
  };

  const name = [input.firstName, input.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const who = name || input.phone;

  /* ---------- 1. הפעמון. תמיד, ולפני הכל ---------- */
  try {
    /**
     * ליד של ערוץ המכירה הוא של הקונה ולא שלך - אין טעם
     * להתריע לך עליו, בדיוק כמו שהאוטומציות לא רצות עליו.
     */
    if (input.isSale !== true && !input.manual && input.leadId) {
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

  /* ---------- 2. הנייד ---------- */
  /**
   * ============================================================
   *  התראת נייד על ליד שנכנס
   * ============================================================
   *
   *  **מה שלא היה קיים כאן בכלל.**
   *
   *  `sendPush` נקרא ממקום אחד בכל המערכת - תזכורות
   *  משימה. ליד שנכנס שלח מייל ובלבד, ולכן זה נראה כמו
   *  "התראות נייד פעם עובדות ופעם לא": מה שהתריע היה
   *  תזכורות, ומה שלא התריע היו לידים.
   *
   *  **זה הערוץ האמין ביותר** - קופץ על המסך הנעול תוך
   *  שניות, בלי לפתוח מייל ובלי להיכנס למערכת. לכן הוא
   *  לא תלוי במתג המייל ולא בסינון שלו.
   */
  try {
    if (input.isSale !== true && !input.manual) {
      const { sendPush, pushConfigured } = await import("./push");

      if (!pushConfigured()) {
        out.pushReason = "מפתחות ההתראות לא מוגדרים בשרת";
      } else {
        const sent = await sendPush({
          title: input.returning ? "ליד נכנס שוב" : "ליד חדש",
          body: `${who}${input.channelName ? ` · ${input.channelName}` : ""}`,
          url: input.leadId ? `/leads/${input.leadId}` : "/leads",
          tag: input.leadId ? `lead-${input.leadId}` : undefined,
        });

        out.push = sent > 0;
        if (sent === 0) {
          out.pushReason =
            "אין מכשיר רשום להתראות, או שהשליחה נכשלה - בדוק בהגדרות → התראות בנייד";
        }
      }
    }
  } catch (err) {
    out.pushReason =
      err instanceof Error ? err.message.slice(0, 200) : "שגיאה בהתראת נייד";
  }

  /* ---------- 3. המייל ---------- */
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

  /* ---------- 4. מה קרה בכל ערוץ - תמיד נרשם ---------- */
  /**
   * **נרשם גם בהצלחה, לא רק בכשל.**
   *
   * "לא קיבלתי התראה על הליד הזה" הייתה שאלה בלי תשובה:
   * לא היה שום רישום של מה נשלח ומה לא. עכשיו לכל ליד
   * יש שורה שאומרת בדיוק מה יצא לפעמון, לנייד ולמייל -
   * ומה הסיבה לכל ערוץ שלא יצא.
   */
  if (input.leadId) {
    await db.leadEvent
      .create({
        data: {
          leadId: input.leadId,
          type:
            out.alert || out.push || out.email ? "notify" : "notify_failed",
          actor: "system",
          payload: {
            פעמון: out.alert,
            נייד: out.push,
            מייל: out.email,
            סיבת_נייד: out.pushReason,
            סיבת_מייל: out.emailReason,
            חוזר: input.returning === true,
          },
        },
      })
      .catch(() => null);
  }

  return out;
}
