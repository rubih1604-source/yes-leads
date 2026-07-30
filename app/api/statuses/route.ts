import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { clearStatusCache } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { name, color, won } = await request.json().catch(() => ({}));

  if (!name?.trim()) {
    return NextResponse.json({ error: "צריך שם לסטטוס" }, { status: 400 });
  }

  const exists = await db.status.findUnique({ where: { name: name.trim() } });
  if (exists) {
    return NextResponse.json({ error: "סטטוס בשם הזה כבר קיים" }, { status: 400 });
  }

  const last = await db.status.findFirst({ orderBy: { position: "desc" } });

  const created = await db.status.create({
    data: {
      name: name.trim(),
      color: typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
        ? color
        : "#64748b",
      won: won === true,
      position: (last?.position ?? 0) + 1,
      builtin: false,
    },
  });

  clearStatusCache();
  return NextResponse.json({ ok: true, status: created });
}
