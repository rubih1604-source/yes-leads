import { NextResponse } from "next/server";
import { getDaySummary } from "@/lib/day-summary";

export const dynamic = "force-dynamic";

/**
 * סיכום למסך הצד.
 *
 * קריאה בלבד. מוגן בטוקן משלו (SUMMARY_TOKEN) ולא בסיסמת
 * הכניסה, כי מסך הצד הוא מערכת אחרת. בלי טוקן מוגדר -
 * הנקודה סגורה לגמרי.
 *
 * ?period=today|week|month|custom  (custom: &from=YYYY-MM-DD&to=YYYY-MM-DD)
 */
export async function GET(request: Request) {
  const expected = process.env.SUMMARY_TOKEN;
  const url = new URL(request.url);
  const got =
    request.headers.get("x-summary-token") || url.searchParams.get("token");

  if (!expected || got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await getDaySummary({
    period: url.searchParams.get("period"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
