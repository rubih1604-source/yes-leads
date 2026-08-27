import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { pendingCallbacks, markSent } from "@/lib/callback-list";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * שולח את רשימת החזרה עכשיו, בלי לחכות למשבצת הקבועה.
 *
 * שימושי לבדיקה, ולימים שבהם אתה רוצה את הרשימה מוקדם.
 */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await pendingCallbacks();

  if (leads.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      message: "אין אף ליד בהמתנה",
    });
  }

  const appUrl = process.env.APP_URL?.trim() || "";

  const lines = [
    `${leads.length} לידים לחזור אליהם`,
    "",
    ...leads.map((l, i) => `${i + 1}. ${l.name} · ${l.phone} · ${l.status}`),
  ];

  if (appUrl) lines.push("", `הרשימה במערכת: ${appUrl}/callbacks`);
  lines.push("", "— העוזר של רובי");

  const emailed = await sendEmail({
    subject: `רשימת חזרה · ${leads.length} לידים`,
    body: lines.join("\n"),
  });

  await db.task
    .create({
      data: {
        title: `רשימת חזרה - ${leads.length} לידים`,
        body: leads
          .slice(0, 40)
          .map((l) => `${l.name} · ${l.phone} · ${l.status}`)
          .join("\n"),
        dueAt: new Date(),
      },
    })
    .catch(() => null);

  await markSent(leads.map((l) => l.id));

  return NextResponse.json({
    ok: true,
    sent: leads.length,
    emailed,
    message: emailed
      ? `${leads.length} לידים נשלחו למייל ונפתחה משימה`
      : `נפתחה משימה עם ${leads.length} לידים. המייל לא נשלח — בדוק ש-RESEND_API_KEY ו-ALERT_EMAIL מוגדרים ברנדר.`,
  });
}
