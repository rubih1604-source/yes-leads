import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** הקטגוריות שהעסק מתחיל איתן */
export const DEFAULT_CATEGORIES = [
  { name: "פרסום", color: "#2563eb" },
  { name: "מרכזייה", color: "#0891b2" },
  { name: "תפעול לידים", color: "#7c3aed" },
  { name: "כלים ותוכנה", color: "#ea580c" },
  { name: "רכב ונסיעות", color: "#f59e0b" },
  { name: "אחר", color: "#64748b" },
];

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { name, color, seed } = await request.json().catch(() => ({}));

  if (seed === true) {
    let created = 0;
    for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
      const exists = await db.expenseCategory.findUnique({
        where: { name: c.name },
      });
      if (exists) continue;
      await db.expenseCategory
        .create({ data: { name: c.name, color: c.color, position: i } })
        .catch(() => null);
      created++;
    }
    return NextResponse.json({ ok: true, created });
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "צריך שם לקטגוריה" }, { status: 400 });
  }

  const exists = await db.expenseCategory.findUnique({
    where: { name: name.trim() },
  });
  if (exists) {
    return NextResponse.json({ error: "כבר קיימת" }, { status: 400 });
  }

  const last = await db.expenseCategory.findFirst({
    orderBy: { position: "desc" },
  });

  const category = await db.expenseCategory.create({
    data: {
      name: name.trim().slice(0, 80),
      color: /^#[0-9a-f]{6}$/i.test(color ?? "") ? color : "#64748b",
      position: (last?.position ?? -1) + 1,
    },
  });

  return NextResponse.json({ ok: true, category });
}
