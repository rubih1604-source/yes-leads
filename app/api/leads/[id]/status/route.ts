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

  const body = await request
    .json()
    .catch(() => ({ status: "", subStatus: null }));

  const status: string = body?.status ?? "";
  const subStatus: string | null =
    typeof body?.subStatus === "string" && body.subStatus.trim()
      ? body.subStatus.trim()
      : null;

  if (!status || !(await isKnownStatus(status))) {
    return NextResponse.json({ error: "סטטוס לא מוכר" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }

  const statusChanged = lead.status !== status;
  const subChanged = (lead.subStatus ?? null) !== subStatus;

  if (!statusChanged && !subChanged) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  /**
   * תת-הסטטוס נשמר תמיד, גם כשהסטטוס עצמו לא השתנה.
   * זה מה שמאפשר לעדכן "מה חשוב ללקוח" בלי להזיז את הליד
   * בפייפליין ובלי להפעיל מחדש את הרצפים.
   */
  if (subChanged) {
    await db.lead
      .update({ where: { id: lead.id }, data: { subStatus } })
      .catch(() => null);
  }

  // שינוי סטטוס עובר דרך מנוע החוקים: מבטל מה שהיה
  // מתוזמן ומתזמן מחדש לפי הסטטוס החדש
  if (statusChanged) {
    await applyStatusChange({
      leadId: lead.id,
      toStatus: status,
      actor: "user",
    });
  }

  return NextResponse.json({
    ok: true,
    status,
    subStatus,
    statusChanged,
    subChanged,
  });
}
