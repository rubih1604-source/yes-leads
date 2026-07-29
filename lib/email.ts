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

/** מייל על משימה חדשה */
export async function emailTask(params: {
  title: string;
  body?: string | null;
  leadId?: string | null;
  urgent?: boolean;
}) {
  const appUrl = process.env.APP_URL?.trim() || "";
  const link =
    appUrl && params.leadId ? `\n\nלכרטיס הליד: ${appUrl}/leads/${params.leadId}` : "";

  return sendEmail({
    subject: params.urgent ? `🔥 ליד חם - ${params.title}` : params.title,
    body: `${params.body ?? ""}${link}\n\n— העוזר של רובי`,
  });
}
