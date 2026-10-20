import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { clearStatusCache } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color)) {
    data.color = body.color;
  }
  if (typeof body.won === "boolean") data.won = body.won;

  if (body.commission !== undefined) {
    const n = Number(body.commission);
    if (Number.isFinite(n) && n >= 0 && n <= 100000) data.commission = n;
  }

  /**
   * סטטוס שמעביר ליד לקונה.
   *
   * null מנתק את ההעברה. מחיר נשמר גם כשהוא 0, כדי שאפשר
   * יהיה להעביר ליד בלי לחייב עליו.
   */
  /**
   * הערוץ שאליו הסטטוס מעביר. זו הדרך המועדפת: הערוץ
   * מחזיק את הכתובת, המחיר וההגדרות.
   */
  if (body.transferChannelId !== undefined) {
    data.transferChannelId =
      typeof body.transferChannelId === "string" && body.transferChannelId
        ? body.transferChannelId
        : null;
  }

  if (body.transferBuyerId !== undefined) {
    data.transferBuyerId =
      typeof body.transferBuyerId === "string" && body.transferBuyerId
        ? body.transferBuyerId
        : null;
  }

  if (body.transferPrice !== undefined) {
    const n = Number(body.transferPrice);
    if (Number.isFinite(n) && n >= 0 && n <= 100000) data.transferPrice = n;
  }

  /**
   * וובוק יוצא. מחרוזת ריקה מנתקת, כדי שאפשר יהיה לבטל
   * בלי למחוק את הסטטוס.
   */
  if (typeof body.hookUrl === "string") {
    const url = body.hookUrl.trim();

    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "כתובת הוובוק חייבת להתחיל ב-https" },
        { status: 400 }
      );
    }

    data.hookUrl = url || null;
  }

  if (typeof body.hookTemplate === "string") {
    data.hookTemplate = body.hookTemplate.trim() || null;
  }

  if (typeof body.hookSecret === "string") {
    data.hookSecret = body.hookSecret.trim() || null;
  }

  if (typeof body.hookActive === "boolean") data.hookActive = body.hookActive;

  if (typeof body.hookHeaders === "string") {
    const { parseHeaders } = await import("@/lib/delivery-payload");
    const parsed = parseHeaders(body.hookHeaders);
    data.hookHeaders = Object.keys(parsed).length ? parsed : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  await db.status.update({ where: { id: params.id }, data });
  clearStatusCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = await db.status.findUnique({ where: { id: params.id } });
  if (!status) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }

  if (status.builtin) {
    return NextResponse.json(
      { error: "אי אפשר למחוק סטטוס מובנה" },
      { status: 400 }
    );
  }

  const inUse = await db.lead.count({ where: { status: status.name } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `${inUse} לידים נמצאים בסטטוס הזה. העבר אותם קודם.` },
      { status: 400 }
    );
  }

  await db.status.delete({ where: { id: params.id } });
  clearStatusCache();
  return NextResponse.json({ ok: true });
}
