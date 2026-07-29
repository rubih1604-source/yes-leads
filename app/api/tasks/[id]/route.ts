import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** סימון משימה כבוצעה או ביטול הסימון */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { done } = await request.json().catch(() => ({ done: null }));
  if (typeof done !== "boolean") {
    return NextResponse.json({ error: "ערך לא תקין" }, { status: 400 });
  }

  await db.task.update({
    where: { id: params.id },
    data: { done, doneAt: done ? new Date() : null },
  });

  return NextResponse.json({ ok: true });
}
