import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { subjectFor, textFor, htmlFor, shouldEmail } from "@/lib/lead-email";

export const dynamic = "force-dynamic";

/**
 * מייל לדוגמה של ליד חדש.
 *
 * GET  = בודק שהכל מוגדר, בלי לשלוח
 * POST = שולח מייל אמיתי לעצמך
 *
 * קיים כדי שלא תצטרך לחכות לליד אמיתי כדי לדעת אם ההתראה
 * עובדת - ובעיקר כדי לראות איך היא נראית בתיבה שלך.
 */

const SAMPLE = {
  leadId: "demo",
  firstName: "ליד",
  lastName: "לדוגמה",
  phone: "+972500000000",
  status: "חדש",
  extra: {
    email: "demo@example.com",
    supplier_question: "סלקום",
    fb_campaign: "קמפיין לידים Yes tv",
    fb_adset: "קבוצת מודעות",
    fb_ad: "מבצע סטינג 149",
    fb_platform: "fb",
    fb_leadid: "1234567890",
  },
  channelName: null,
  isSale: false,
};

export async function GET() {
  const settings = await getSettings();

  const hasKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasTo = Boolean(process.env.ALERT_EMAIL?.trim());
  const from = process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";

  const blocked: string[] = [];
  if (!hasKey) blocked.push("חסר RESEND_API_KEY ברנדר");
  if (!hasTo) blocked.push("חסרה ALERT_EMAIL ברנדר — לאן לשלוח");
  if (!settings.notifyEmail) blocked.push('"מייל" כבוי בהתראות שבהגדרות');
  if (settings.leadEmailMode === "off") {
    blocked.push('"מייל על ליד חדש" מוגדר ל"בלי מייל"');
  }

  return NextResponse.json({
    פעולה: "בדיקה בלבד — לא נשלח מייל",
    מוכן: blocked.length === 0,
    חסם: blocked.length ? blocked : "אין — אפשר לשלוח",
    "נשלח מהכתובת": from.includes("<") ? from : `ראובן חגג <${from}>`,
    "נשלח אל": process.env.ALERT_EMAIL?.trim() || "(לא מוגדר)",
    "על אילו לידים": settings.leadEmailMode,
    "ישלח על ליד שלי": shouldEmail(settings.leadEmailMode, false),
    "ישלח על ליד של קונה": shouldEmail(settings.leadEmailMode, true),
    הערה:
      "EMAIL_FROM חייבת להיות כתובת בדומיין שאימתת ב-resend.com, אחרת המייל לא יישלח או ייפול לספאם.",
  });
}

export async function POST() {
  const full = {
    ...SAMPLE,
    at: new Date(),
    appUrl: process.env.APP_URL?.trim() || null,
  };

  const sent = await sendEmail({
    subject: `[בדיקה] ${subjectFor(full)}`,
    body: textFor(full),
    html: htmlFor(full),
  });

  return NextResponse.json({
    פעולה: "בוצע",
    נשלח: sent,
    אל: process.env.ALERT_EMAIL?.trim() || "(לא מוגדר)",
    הסבר: sent
      ? "המייל יצא. אם הוא לא הגיע תוך דקה — בדוק בספאם, ואז שהדומיין ב-EMAIL_FROM מאומת ב-resend.com."
      : "לא נשלח. הרץ את הבדיקה (הצג) כדי לראות מה חסם.",
  });
}
