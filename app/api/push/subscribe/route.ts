import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/** המפתח הציבורי שהדפדפן צריך כדי להירשם */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  /**
   * **מצב כל מכשיר בנפרד.**
   *
   * "ההתראות פעם עובדות ופעם לא" הייתה שאלה בלי תשובה:
   * המסך הציג מספר מכשירים ולא יותר. כשל נכתב לקונסול
   * של רנדר ונעלם, ומנוי שפג נמחק בשקט - כלומר אפשר היה
   * לא לקבל התראות שבועיים בלי שום סימן.
   */
  const rows = await db.pushSubscription
    .findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastTriedAt: true,
        lastOkAt: true,
        lastError: true,
      },
    })
    .catch(() => []);

  return NextResponse.json({
    ok: true,
    configured: pushConfigured(),
    publicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? null,
    devices: rows.length,
    מכשירים: rows.map((row) => ({
      שם: row.label ?? "מכשיר",
      נרשם: row.createdAt,
      נוסה_לאחרונה: row.lastTriedAt,
      עבד_לאחרונה: row.lastOkAt,
      שגיאה: row.lastError,
      תקין: Boolean(row.lastOkAt) && !row.lastError,
    })),
  });
}

/** רישום מכשיר */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { endpoint, keys, label } = await request.json().catch(() => ({}));

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "מנוי לא תקין" }, { status: 400 });
  }

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      label: typeof label === "string" ? label.slice(0, 80) : null,
    },
    update: { p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true });
}

/** ביטול רישום */
export async function DELETE(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { endpoint } = await request.json().catch(() => ({}));

  if (endpoint) {
    await db.pushSubscription.delete({ where: { endpoint } }).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
