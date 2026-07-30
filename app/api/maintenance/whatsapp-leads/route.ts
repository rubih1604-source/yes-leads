import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * לידים שנוצרו מהודעת וואטסאפ נכנסת לפני שהוספנו את שדה המקור
 * קיבלו בטעות "מליד מנגר" כברירת מחדל, ולכן הם מופיעים ברשימת
 * הלידים. הסימן המזהה שלהם: המקור נרשם כ"הודעה נכנסת".
 */
const WHATSAPP_MARK = { source: "הודעה נכנסת", origin: "leadmanager" };

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const count = await db.lead.count({ where: WHATSAPP_MARK });
  return NextResponse.json({ ok: true, count });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await db.lead.updateMany({
    where: WHATSAPP_MARK,
    data: { origin: "whatsapp" },
  });

  return NextResponse.json({ ok: true, moved: result.count });
}
