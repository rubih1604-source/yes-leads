import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * בדיקת המייל, עם השגיאה האמיתית.
 *
 * sendEmail הרגיל בולע שגיאות בכוונה, כדי ששליחה כושלת
 * לא תפיל תהליך. כאן דווקא רוצים לראות מה Resend אומר.
 */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ALERT_EMAIL?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      problem: "חסר RESEND_API_KEY ברנדר",
    });
  }

  if (!to) {
    return NextResponse.json({
      ok: false,
      problem: "חסר ALERT_EMAIL ברנדר",
    });
  }

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
        subject: "בדיקת מייל מהמערכת",
        text: "אם קיבלת את זה - התזכורות יגיעו אליך. אין צורך לעשות כלום.",
      }),
      cache: "no-store",
    });

    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        status: response.status,
        problem:
          (raw as { message?: string }).message ??
          `Resend החזיר שגיאה ${response.status}`,
        from,
        to,
        raw,
      });
    }

    return NextResponse.json({
      ok: true,
      message: `מייל בדיקה נשלח אל ${to}. אם הוא לא הגיע תוך דקה, בדוק בספאם.`,
      from,
      to,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      problem: err instanceof Error ? err.message : "שגיאת רשת",
    });
  }
}
