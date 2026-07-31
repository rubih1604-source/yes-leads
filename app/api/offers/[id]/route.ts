import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { readTargets } from "@/lib/offer-targets";

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

  for (const key of ["title", "price", "decoders", "streaming", "sports", "freeText"]) {
    if (typeof body[key] === "string") {
      data[key] = body[key].trim().slice(0, 1500) || null;
    }
  }

  if (body.targets !== undefined) {
    data.targets = readTargets(body.targets);
  }

  if (typeof body.active === "boolean") data.active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  await db.offer.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await db.offer.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
