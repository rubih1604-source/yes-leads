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

  const count = await db.pushSubscription.count().catch(() => 0);

  return NextResponse.json({
    ok: true,
    configured: pushConfigured(),
    publicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? null,
    devices: count,
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
