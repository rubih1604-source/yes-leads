import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listTemplates, parseTemplates } from "@/lib/texter";
import { isLoggedIn } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** מושך את התבניות המאושרות מטקסטר ומעדכן את הרשימה המקומית */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await listTemplates();

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "לא הצלחנו להתחבר לטקסטר",
        status: result.status,
        raw: result.raw,
      },
      { status: 502 }
    );
  }

  const templates = parseTemplates(result.raw);

  if (templates.length === 0) {
    // התחברנו, אבל לא זיהינו תבניות. מחזירים את התשובה הגולמית
    // כדי שנוכל להתאים את הפענוח בלי לנחש.
    return NextResponse.json(
      {
        error: "התחברנו לטקסטר אבל לא זוהו תבניות בתשובה",
        raw: result.raw,
      },
      { status: 200 }
    );
  }

  for (const t of templates) {
    await db.template.upsert({
      where: { name: t.name },
      create: {
        name: t.name,
        displayName: t.displayName,
        bodyText: t.bodyText,
        variables: t.variableCount,
        approved: t.approved,
        raw: t.raw as Prisma.InputJsonValue,
      },
      update: {
        displayName: t.displayName,
        bodyText: t.bodyText,
        variables: t.variableCount,
        approved: t.approved,
        raw: t.raw as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true, count: templates.length });
}
