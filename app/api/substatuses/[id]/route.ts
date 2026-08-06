import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const n = Number(body.commission);

  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    return NextResponse.json({ error: "סכום לא תקין" }, { status: 400 });
  }

  await db.subStatus.update({
    where: { id: params.id },
    data: { commission: n },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sub = await db.subStatus.findUnique({ where: { id: params.id } });
  if (!sub) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const inUse = await db.lead.count({ where: { subStatus: sub.name } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `${inUse} לידים מסומנים בתת-סטטוס הזה` },
      { status: 400 }
    );
  }

  await db.subStatus.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
