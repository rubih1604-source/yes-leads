import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** מדליק או מכבה חוק */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { active } = await request.json().catch(() => ({ active: null }));
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "ערך לא תקין" }, { status: 400 });
  }

  await db.rule.update({ where: { id: params.id }, data: { active } });
  return NextResponse.json({ ok: true, active });
}
