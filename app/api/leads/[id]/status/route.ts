import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isKnownStatus } from "@/lib/status-store";
import { isLoggedIn } from "@/lib/auth";
import { applyStatusChange } from "@/lib/rules";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { status } = await request.json().catch(() => ({ status: "" }));

  if (!status || !(await isKnownStatus(status))) {
    return NextResponse.json({ error: "סטטוס לא מוכר" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }

  if (lead.status === status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // כל שינוי סטטוס עובר דרך מנוע החוקים:
  // מבטל מה שהיה מתוזמן ומתזמן מחדש לפי הסטטוס החדש
  // תת-הסטטוס נשמר גם כשהסטטוס לא משתנה
  await db.lead
    .update({
      where: { id: params.id },
      data: { subStatus: typeof subStatus === "string" && subStatus ? subStatus : null },
    })
    .catch(() => null);

  await applyStatusChange({ leadId: lead.id, toStatus: status, actor: "user" });

  return NextResponse.json({ ok: true, status });
}
