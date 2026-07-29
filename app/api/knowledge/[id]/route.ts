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
  const data: Record<string, unknown> = {};

  if (typeof body.topic === "string" && body.topic.trim())
    data.topic = body.topic.trim();
  if (typeof body.answer === "string" && body.answer.trim())
    data.answer = body.answer.trim();
  if (typeof body.active === "boolean") data.active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  await db.knowledgeItem.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await db.knowledgeItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
