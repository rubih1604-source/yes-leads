import { sendEmail } from "./email";
import {
  subjectFor,
  textFor,
  htmlFor,
  shouldEmail,
  type LeadEmailInput,
} from "./lead-email";

/**
 * שולח את המייל על ליד חדש.
 *
 * **לעולם לא זורק ולא מעכב את הקליטה.** ליד שנכנס חשוב
 * אינסופית יותר מהתראה עליו: אם Resend איטי או נופל, הליד
 * חייב להישמר בכל מקרה. לכן הקריאה כאן נעשית אחרי שהליד
 * כבר נשמר, והשגיאה נבלעת.
 */
export async function notifyNewLead(
  input: Omit<LeadEmailInput, "appUrl">
): Promise<boolean> {
  try {
    const { getSettings } = await import("./settings");
    const settings = await getSettings();

    if (!settings.notifyEmail) return false;
    if (!shouldEmail(settings.leadEmailMode, input.isSale === true)) {
      return false;
    }

    const full: LeadEmailInput = {
      ...input,
      appUrl: process.env.APP_URL?.trim() || null,
    };

    return await sendEmail({
      subject: subjectFor(full),
      body: textFor(full),
      html: htmlFor(full),
    });
  } catch {
    return false;
  }
}
