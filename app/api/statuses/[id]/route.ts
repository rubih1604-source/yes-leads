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
