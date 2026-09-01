import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** הבאנרים הפעילים - מה שעוד לא הסרת */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ notices: [] });
  }

  const notices = await db.notice
    .findMany({
      where: { dismissedAt: null },
      orderBy: [{ level: "asc" }, { createdAt: "desc" }],
      take: 12,
    })
    .catch(() => []);

  return NextResponse.json({
    ok: true,
    notices: notices.map((n) => ({
      id: n.id,
      level: n.level,
      title: n.title,
      body: n.body,
      campaignName: n.campaignName,
    })),
  });
}

/** הסרת כל הבאנרים בבת אחת */
export async function DELETE() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await db.notice.updateMany({
    where: { dismissedAt: null },
    data: { dismissedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
