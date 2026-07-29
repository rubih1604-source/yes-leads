import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { applyStatusChange } from "@/lib/rules";

export const dynamic = "force-dynamic";

/**
 * מבטל את שינוי הסטטוס האחרון שהמערכת עשתה לבד,
 * ומחזיר את הליד לסטטוס הקודם.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const lastAuto = await db.leadEvent.findFirst({
    where: {
      leadId: params.id,
      type: "status_changed",
      actor: { in: ["bot", "system"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lastAuto?.fromStatus) {
    return NextResponse.json(
      { error: "אין שינוי אוטומטי לבטל" },
      { status: 400 }
    );
  }

  await applyStatusChange({
    leadId: params.id,
    toStatus: lastAuto.fromStatus,
    actor: "user",
    note: "ביטול שינוי אוטומטי",
  });

  // ביטול שינוי אוטומטי מוציא גם מרשימת אי-הפנייה
  await db.lead
    .update({ where: { id: params.id }, data: { doNotContact: false } })
    .catch(() => null);

  return NextResponse.json({ ok: true, restored: lastAuto.fromStatus });
}
