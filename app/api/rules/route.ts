import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { isKnownStatus } from "@/lib/status-store";

export const dynamic = "force-dynamic";

/** יצירת חוק חדש */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    triggerStatus,
    delayMinutes,
    action,
    templateName,
    targetStatus,
    note,
  } = body;

  if (!triggerStatus || !(await isKnownStatus(triggerStatus))) {
    return NextResponse.json(
      { error: "צריך לבחור סטטוס שמפעיל את החוק" },
      { status: 400 }
    );
  }

  if (!["send_template", "notify", "set_status"].includes(action)) {
    return NextResponse.json({ error: "צריך לבחור פעולה" }, { status: 400 });
  }

  if (action === "send_template" && !templateName) {
    return NextResponse.json(
      { error: "צריך לבחור איזו תבנית תישלח" },
      { status: 400 }
    );
  }

  if (action === "set_status") {
    if (!targetStatus || !(await isKnownStatus(targetStatus))) {
      return NextResponse.json(
        { error: "צריך לבחור לאיזה סטטוס להעביר" },
        { status: 400 }
      );
    }
    if (targetStatus === triggerStatus) {
      return NextResponse.json(
        { error: "אי אפשר להעביר לאותו סטטוס - זה ייצור לולאה" },
        { status: 400 }
      );
    }
  }

  const minutes = Number(delayMinutes);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60 * 24 * 365) {
    return NextResponse.json({ error: "זמן לא תקין" }, { status: 400 });
  }

  // הצעד הבא הפנוי בסטטוס הזה
  const last = await db.rule.findFirst({
    where: { triggerStatus },
    orderBy: { stepIndex: "desc" },
  });

  const rule = await db.rule.create({
    data: {
      triggerStatus,
      stepIndex: (last?.stepIndex ?? -1) + 1,
      delayMinutes: Math.round(minutes),
      action,
      templateName: action === "send_template" ? templateName : null,
      targetStatus: action === "set_status" ? targetStatus : null,
      note: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null,
      active: true,
    },
  });

  return NextResponse.json({ ok: true, rule });
}
