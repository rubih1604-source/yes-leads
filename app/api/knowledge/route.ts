import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** הוספת פריט ידע חדש */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { topic, answer } = await request.json().catch(() => ({}));

  if (!topic?.trim() || !answer?.trim()) {
    return NextResponse.json(
      { error: "צריך גם נושא וגם תשובה" },
      { status: 400 }
    );
  }

  const item = await db.knowledgeItem.create({
    data: { topic: topic.trim(), answer: answer.trim() },
  });

  return NextResponse.json({ ok: true, item });
}
