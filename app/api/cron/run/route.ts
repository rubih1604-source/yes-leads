import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/runner";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * מריץ את המשימות שהגיע זמנן.
 * נקרא אוטומטית מתוך השרת כל 5 דקות, ואפשר גם לקרוא לו ידנית
 * עם הטוקן - שימושי לבדיקה ולשירות תזמון חיצוני.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expected = process.env.CRON_SECRET;

  const authorized =
    isLoggedIn() || (expected ? token === expected : false);

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runDueJobs();
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
