import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * מסמן לידים כפולים.
 *
 * הטלפון הוא מפתח ייחודי, אז כפילות אמיתית היא אותו אדם
 * שמילא טופס פעמיים עם שני מספרים, או ששמו נרשם פעמיים.
 * מזהים לפי שם מלא זהה - והראשון שנכנס נחשב המקורי.
 */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    where: { origin: "leadmanager" },
    orderBy: { intakeAt: "asc" },
    select: { id: true, firstName: true, lastName: true, intakeAt: true },
  });

  const seen = new Map<string, string>();
  let count = 0;

  for (const lead of leads) {
    const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (name.split(" ").length < 2) continue;

    if (seen.has(name)) count++;
    else seen.set(name, lead.id);
  }

  return NextResponse.json({ ok: true, count });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    where: { origin: "leadmanager" },
    orderBy: { intakeAt: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });

  const seen = new Map<string, string>();
  let marked = 0;

  for (const lead of leads) {
    const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (name.split(" ").length < 2) continue;

    const original = seen.get(name);
    if (original) {
      await db.lead
        .update({ where: { id: lead.id }, data: { duplicateOf: original } })
        .catch(() => null);
      marked++;
    } else {
      seen.set(name, lead.id);
    }
  }

  return NextResponse.json({ ok: true, marked });
}
