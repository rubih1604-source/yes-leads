import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_KNOWLEDGE } from "@/lib/answer";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** טוען את התשובות המוכנות. לא דורס נושאים שכבר קיימים. */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let created = 0;

  for (const item of DEFAULT_KNOWLEDGE) {
    const exists = await db.knowledgeItem.findFirst({
      where: { topic: item.topic },
    });
    if (exists) continue;

    await db.knowledgeItem.create({
      data: { topic: item.topic, answer: item.answer },
    });
    created++;
  }

  return NextResponse.json({ ok: true, created });
}
