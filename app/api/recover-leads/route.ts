import { NextRequest, NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { scanMissing, recoverMissing, DEFAULT_DAYS } from "@/lib/replay-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ============================================================
 *  שחזור לידים שהגיעו ולא הופיעו
 * ============================================================
 *
 *  GET  - סורק ומראה מה חסר. **לא משנה כלום.**
 *  POST - משחזר. `logIds` מצמצם לשורות שבחרת.
 *
 *  הסריקה נפרדת מהשחזור בכוונה: אתה רואה קודם מה עומד
 *  להיווצר, ורק אז מחליט. כלי שמשנה נתונים בלחיצה אחת
 *  בלי להראות מה הוא עושה הוא כלי שלא סומכים עליו.
 */
export async function GET(request: NextRequest) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const days = Number(
    new URL(request.url).searchParams.get("days") ?? DEFAULT_DAYS
  );

  const result = await scanMissing(
    Number.isFinite(days) && days > 0 && days <= 180 ? days : DEFAULT_DAYS
  ).catch(() => null);

  if (!result) {
    return NextResponse.json({ error: "הסריקה נכשלה" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    days?: number;
    logIds?: string[];
  };

  const result = await recoverMissing({
    days: body.days,
    logIds: Array.isArray(body.logIds) ? body.logIds : undefined,
  }).catch(() => null);

  if (!result) {
    return NextResponse.json({ error: "השחזור נכשל" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...result });
}
