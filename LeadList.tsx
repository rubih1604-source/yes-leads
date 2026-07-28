import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isKnownStatus } from "@/lib/statuses";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { status } = await request.json().catch(() => ({ status: "" }));

  if (!status || !isKnownStatus(status)) {
    return NextResponse.json({ error: "סטטוס לא מוכר" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }

  if (lead.status === status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await db.lead.update({
    where: { id: lead.id },
    data: { status },
  });

  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "status_changed",
      fromStatus: lead.status,
      toStatus: status,
      actor: "user",
    },
  });

  return NextResponse.json({ ok: true, status });
}
