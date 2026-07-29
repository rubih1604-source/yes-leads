/**
 * ============================================================
 *  התראות במייל
 * ============================================================
 *
 *  עובד דרך Resend. אם אין מפתח - המערכת פשוט לא שולחת מייל,
 *  וההתראות ממשיכות להופיע במסך. שום דבר לא נשבר.
 *
 *  RESEND_API_KEY  - מ-resend.com
 *  ALERT_EMAIL     - כתובת המייל שלך
 *  EMAIL_FROM      - אופציונלי. ברירת מחדל onboarding@resend.dev
 */

export async function sendEmail(params: {
  subject: string;
  body: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ALERT_EMAIL?.trim();
  if (!apiKey || !to) return false;

  const from = process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: params.subject,
        text: params.body,
      }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * מייל על ליד שרוצה לדבר איתך.
 * נשלח רק על מעוניינים ועל מי שביקש שתחזור אליו - לא על כל הודעה.
 */
export async function emailLeadAlert(params: {
  headline: string;
  customerName: string;
  phone: string;
  status: string;
  message: string;
  extra?: string | null;
  leadId: string;
  urgent?: boolean;
}) {
  const appUrl = process.env.APP_URL?.trim() || "";

  const lines = [
    params.headline,
    "",
    `שם:     ${params.customerName}`,
    `טלפון:  ${params.phone}`,
    `סטטוס:  ${params.status}`,
    "",
    "ההודעה שלו:",
    `"${params.message}"`,
  ];

  if (params.extra) {
    lines.push("", params.extra);
  }

  if (appUrl) {
    lines.push("", `כרטיס הליד: ${appUrl}/leads/${params.leadId}`);
    lines.push(`חיוג ישיר: tel:${params.phone}`);
  }

  lines.push("", "— העוזר של רובי");

  return sendEmail({
    subject: params.urgent
      ? `🔥 ליד חם - ${params.customerName} (${params.phone})`
      : `${params.customerName} ביקש שתחזור אליו`,
    body: lines.join("\n"),
  });
}
