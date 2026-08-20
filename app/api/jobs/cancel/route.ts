import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** כמה ממתינות יש כרגע, ומתי הראשונה אמורה לצאת */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [count, next] = await Promise.all([
    db.scheduledJob.count({ where: { state: "pending" } }),
    db.scheduledJob.findFirst({
      where: { state: "pending" },
      orderBy: { runAt: "asc" },
      select: { runAt: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    count,
    nextAt: next?.runAt.toISOString() ?? null,
  });
}

/**
 * ביטול משימות ממתינות.
 *
 * scope: "all" מבטל הכל, "bulk" רק דיוורים ידניים
 * (אלה עם הערה), כדי לא לפגוע ברצפים האוטומטיים.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { scope, jobId } = await request.json().catch(() => ({}));

  if (jobId) {
    await db.scheduledJob.updateMany({
      where: { id: jobId, state: "pending" },
      data: { state: "cancelled", lastError: "בוטל ידנית" },
    });
    return NextResponse.json({ ok: true, cancelled: 1 });
  }

  const where =
    scope === "bulk"
      ? { state: "pending", note: { not: null } }
      : { state: "pending" };

  const result = await db.scheduledJob.updateMany({
    where,
    data: { state: "cancelled", lastError: "בוטל ידנית" },
  });

  return NextResponse.json({ ok: true, cancelled: result.count });
}
