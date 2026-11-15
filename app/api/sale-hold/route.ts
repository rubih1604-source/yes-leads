import { NextRequest, NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { holdState, startHold, releaseHeld } from "@/lib/sale-hold";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  עצירת העברות לקונה - דלת אחת
 * ============================================================
 *
 *  GET  - מה המצב ברגע זה, וכמה מחכים
 *  POST - { on: true }  מדליק את העצירה
 *         { on: false } מכבה **ומשחרר הכל**
 *         { leadId }    משחרר ליד אחד בלי לכבות
 *
 *  הכיבוי והשחרור הם פעולה אחת בכוונה. מתג שמכבה בלי
 *  לשחרר היה משאיר לידים תקועים בלי שום סימן - וזה בדיוק
 *  סוג התקלה שאי אפשר לגלות.
 */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...(await holdState()) });
}

export async function POST(request: NextRequest) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const leadId = typeof body.leadId === "string" ? body.leadId : null;

  if (leadId) {
    const result = await releaseHeld({ leadId });
    return NextResponse.json({
      ok: !result.error,
      ...result,
      state: await holdState(),
    });
  }

  if (body.on === true) {
    return NextResponse.json({ ok: true, state: await startHold() });
  }

  const result = await releaseHeld({ turnOff: true });

  return NextResponse.json({
    ok: !result.error,
    ...result,
    state: await holdState(),
  });
}
