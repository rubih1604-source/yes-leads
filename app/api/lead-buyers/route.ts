import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { name, note } = await request.json().catch(() => ({}));

  if (!name?.trim()) {
    return NextResponse.json({ error: "צריך שם ללקוח" }, { status: 400 });
  }

  const exists = await db.leadBuyer.findUnique({ where: { name: name.trim() } });
  if (exists) {
    return NextResponse.json({ error: "לקוח בשם הזה כבר קיים" }, { status: 400 });
  }

  const buyer = await db.leadBuyer.create({
    data: {
      name: name.trim().slice(0, 120),
      note: typeof note === "string" && note.trim() ? note.trim() : null,
    },
  });

  return NextResponse.json({ ok: true, buyer });
}
