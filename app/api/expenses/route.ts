import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { title, amount, categoryId, at, recurring, note } = await request
    .json()
    .catch(() => ({}));

  if (!title?.trim()) {
    return NextResponse.json({ error: "צריך תיאור להוצאה" }, { status: 400 });
  }

  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    return NextResponse.json({ error: "סכום לא תקין" }, { status: 400 });
  }

  let when = new Date();
  if (typeof at === "string" && at.trim()) {
    const parsed = new Date(`${at}T12:00:00+03:00`);
    if (!Number.isNaN(parsed.getTime())) when = parsed;
  }

  const expense = await db.expense.create({
    data: {
      title: title.trim().slice(0, 150),
      amount: value,
      categoryId: categoryId || null,
      at: when,
      recurring: recurring === true,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
    },
  });

  return NextResponse.json({ ok: true, expense });
}
