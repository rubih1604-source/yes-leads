import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { sendDelivery } from "@/lib/delivery";

export const dynamic = "force-dynamic";

/**
 * שליחה חוזרת של שליחה שנכשלה.
 *
 * מאפסים את מונה הניסיונות, כי זו החלטה שלך ולא ניסיון
 * אוטומטי - ומגיע לה סיבוב מלא.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reset = await db.leadDelivery
    .update({
      where: { id: params.id },
      /**
       * `createdAt` נדרך מחדש, כמו בשחרור קבוצתי.
       *
       * הוא התאריך שהקונה מקבל במטען, ולכן שליחה ידנית
       * עכשיו חייבת לשאת את עכשיו - אחרת העברה שבוצעה
       * במוצאי שבת תגיע עם תאריך של שבת בבוקר.
       */
      data: {
        state: "pending",
        attempts: 0,
        nextTryAt: new Date(),
        createdAt: new Date(),
        releasedAt: new Date(),
        error: null,
      },
    })
    .catch(() => null);

  if (!reset) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }

  const ok = await sendDelivery(params.id).catch(() => false);

  const after = await db.leadDelivery
    .findUnique({ where: { id: params.id } })
    .catch(() => null);

  return NextResponse.json({
    ok,
    state: after?.state ?? "unknown",
    httpStatus: after?.httpStatus ?? null,
    error: after?.error ?? null,
  });
}
