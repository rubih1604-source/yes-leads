import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_RULES } from "@/lib/rules";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** טוען את חוקי ברירת המחדל. לא דורס חוקים שכבר קיימים. */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let created = 0;

  for (const rule of DEFAULT_RULES) {
    const exists = await db.rule.findUnique({
      where: {
        triggerStatus_stepIndex: {
          triggerStatus: rule.triggerStatus,
          stepIndex: rule.stepIndex,
        },
      },
    });
    if (exists) continue;

    await db.rule.create({
      data: {
        triggerStatus: rule.triggerStatus,
        stepIndex: rule.stepIndex,
        delayMinutes: rule.delayMinutes,
        action: rule.action,
        templateName: rule.templateName ?? null,
        targetStatus: rule.targetStatus ?? null,
        note: rule.note,
        active: rule.active,
      },
    });
    created++;
  }

  return NextResponse.json({ ok: true, created });
}
