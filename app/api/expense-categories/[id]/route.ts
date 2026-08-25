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

  const count = await db.expense.count({ where: { categoryId: params.id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `${count} הוצאות משויכות לקטגוריה הזו. העבר אותן קודם.` },
      { status: 400 }
    );
  }

  await db.expenseCategory.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
