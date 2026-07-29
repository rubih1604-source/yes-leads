import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** שליטה בבוט מול ליד מסוים: השתקה קבועה, או שחרור מיידי */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { action } = await request.json().catch(() => ({ action: "" }));

  if (action === "mute") {
    await db.lead.update({
      where: { id: params.id },
      data: { botMuted: true },
    });
    return NextResponse.json({ ok: true, botMuted: true });
  }

  if (action === "unmute") {
    await db.lead.update({
      where: { id: params.id },
      data: { botMuted: false, botPausedUntil: null },
    });
    return NextResponse.json({ ok: true, botMuted: false });
  }

  return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });
}
