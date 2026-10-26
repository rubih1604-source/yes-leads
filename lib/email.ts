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
  /** גרסת HTML. כשהיא קיימת, הטקסט משמש כגיבוי בתיבות שלא מציגות HTML */
  html?: string;
  /**
   * השם שמופיע כשולח.
   *
   * ברירת המחדל היא השם שלך ולא שם טכני: מייל שמגיע
   * מ-"onboarding" נראה כמו ספאם ונקבר בתיבה.
   */
  fromName?: string;
  /**
   * כותרות נוספות.
   *
   * משמשות לקיבוץ לשיחה אחת: References ו-In-Reply-To עם
   * אותו מזהה גורמים לג'ימייל להציג את כל מיילי היום
   * כפריט אחד בתיבה.
   */
  headers?: Record<string, string>;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ALERT_EMAIL?.trim();
  if (!apiKey || !to) return false;

  const address = process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";

  /**
   * אם EMAIL_FROM כבר כולל שם בסוגריים משולשים - משאירים
   * אותו כמו שהוא. אחרת עוטפים אותו בשם.
   */
  const name = (params.fromName ?? "ראובן חגג").trim();
  const from = address.includes("<") ? address : `${name} <${address}>`;

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
        ...(params.html ? { html: params.html } : {}),
        ...(params.headers && Object.keys(params.headers).length
          ? { headers: params.headers }
          : {}),
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
    lines.push(`חיוג ישיר: tel:${params.phone.replace(/\D/g, "")}`);
  }

  lines.push("", "— העוזר של רובי");

  return sendEmail({
    subject: params.urgent
      ? `🔥 ליד חם - ${params.customerName} (${params.phone})`
      : `${params.customerName} ביקש שתחזור אליו`,
    body: lines.join("\n"),
  });
}
