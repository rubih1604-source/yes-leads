import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { clearChannelCache } from "@/lib/channels";

export const dynamic = "force-dynamic";

/** קמפיין = קטגוריה שבתוכה ערוצים */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "צריך שם לקמפיין" }, { status: 400 });
  }

  const exists = await db.campaign
    .findUnique({ where: { name } })
    .catch(() => null);

  if (exists) {
    return NextResponse.json({ error: "כבר קיים קמפיין בשם הזה" }, { status: 400 });
  }

  const created = await db.campaign
    .create({ data: { name: name.slice(0, 120) } })
    .catch(() => null);

  if (!created) {
    return NextResponse.json({ error: "הקמפיין לא נוצר" }, { status: 500 });
  }

  clearChannelCache();
  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";

  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 120);
  }
  if (typeof body.active === "boolean") data.active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  await db.campaign.update({ where: { id }, data }).catch(() => null);
  clearChannelCache();
  return NextResponse.json({ ok: true });
}

/**
 * מחיקת קמפיין מוחקת את הערוצים שבו.
 *
 * לכן היא נחסמת כשיש לערוץ היסטוריה: כניסות ושליחות הן
 * הראיה שלך מול הקונה, ואסור שימחקו בלחיצה.
 */
export async function DELETE(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  const channels = await db.channel
    .findMany({ where: { campaignId: id }, select: { id: true } })
    .catch(() => []);

  const used = await db.leadEntry
    .count({ where: { channelId: { in: channels.map((c) => c.id) } } })
    .catch(() => 0);

  if (used > 0) {
    return NextResponse.json(
      {
        error: `${used} כניסות שייכות לערוצים של הקמפיין הזה. כבה אותו במקום למחוק, כדי לא לאבד את ההיסטוריה.`,
      },
      { status: 400 }
    );
  }

  await db.campaign.delete({ where: { id } }).catch(() => null);
  clearChannelCache();
  return NextResponse.json({ ok: true });
}
