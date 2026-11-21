import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { runWatchdog } from "@/lib/watchdog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * הרצה ידנית של הסוכן הבודק.
 *
 * הוא רץ לבד כל 5 דקות; זה כאן כדי שתוכל לבדוק **עכשיו**
 * אחרי שעשית משהו, בלי לחכות.
 */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runWatchdog().catch(() => null);

  if (!result) {
    return NextResponse.json({ error: "הבדיקה נכשלה" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...result });
}
