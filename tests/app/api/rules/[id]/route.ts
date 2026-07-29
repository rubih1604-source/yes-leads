import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** עריכת חוק: הדלקה/כיבוי, זמן ההמתנה, והתבנית שנשלחת */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.active === "boolean") {
    data.active = body.active;
  }

  if (body.delayMinutes !== undefined) {
    const minutes = Number(body.delayMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60 * 24 * 365) {
      return NextResponse.json({ error: "זמן לא תקין" }, { status: 400 });
    }
    data.delayMinutes = Math.round(minutes);
  }

  if (typeof body.templateName === "string") {
    data.templateName = body.templateName || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  const updated = await db.rule.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ ok: true, rule: updated });
}
