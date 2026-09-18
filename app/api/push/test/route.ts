import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { sendPush, pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/** שולח התראת בדיקה לכל המכשירים הרשומים */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({
      ok: false,
      problem: "חסרים VAPID_PUBLIC_KEY או VAPID_PRIVATE_KEY ברנדר",
    });
  }

  const sent = await sendPush({
    title: "בדיקת התראה",
    body: "אם קיבלת את זה על המסך הנעול - הכל מוכן.",
    url: "/today",
  });

  return NextResponse.json({
    ok: sent > 0,
    sent,
    problem:
      sent === 0
        ? "אין מכשירים רשומים. הפעל התראות מהמכשיר עצמו."
        : undefined,
  });
}
