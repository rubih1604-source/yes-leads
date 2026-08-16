import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // הקמפיינים לא נמחקים - רק מתנתקים מהלקוח
  await db.salesCampaign
    .updateMany({ where: { buyerId: params.id }, data: { buyerId: null } })
    .catch(() => null);

  await db.leadBuyer.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
