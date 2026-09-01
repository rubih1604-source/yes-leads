import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** הסרת באנר בודד */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await db.notice
    .update({ where: { id: params.id }, data: { dismissedAt: new Date() } })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
