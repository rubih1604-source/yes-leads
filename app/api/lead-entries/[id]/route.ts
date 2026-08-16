import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * סימון כניסה כלא לחיוב.
 *
 * ליד שהועבר אליך ואתה עובד עליו בעצמך - לא נכון לגבות
 * עליו תשלום מהקונה. הכניסה נשארת ברשימה כדי שתראה
 * אותה, אבל יורדת מהסכום הכולל.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { billable } = await request.json().catch(() => ({}));

  if (typeof billable !== "boolean") {
    return NextResponse.json({ error: "ערך לא תקין" }, { status: 400 });
  }

  await db.leadEntry.update({
    where: { id: params.id },
    data: { billable },
  });

  return NextResponse.json({ ok: true, billable });
}
