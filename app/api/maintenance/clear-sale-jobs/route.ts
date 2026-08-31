import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * מבטל כל משימה ממתינה ששייכת לליד מכירה.
 *
 * נחוץ פעם אחת, כדי לנקות מה שנוצר לפני שהמעקות נכנסו.
 * מכאן והלאה זה לא אמור לקרות בכלל.
 */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const count = await db.scheduledJob.count({
    where: { state: "pending", lead: { origin: "sale" } },
  });

  return NextResponse.json({ ok: true, count });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobs = await db.scheduledJob.findMany({
    where: { state: "pending", lead: { origin: "sale" } },
    select: { id: true },
  });

  const result = await db.scheduledJob.updateMany({
    where: { id: { in: jobs.map((j) => j.id) } },
    data: { state: "cancelled", lastError: "ליד מכירה - בוטל" },
  });

  return NextResponse.json({ ok: true, cancelled: result.count });
}
