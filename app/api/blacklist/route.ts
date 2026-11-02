import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { blockPhone } from "@/lib/blacklist";
import { displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * חסימה ידנית של מספר.
 *
 * קיים בשביל מי שביקש להפסיק בהקלטה או בשיחה - מצבים
 * שאין בהם טקסט לזהות.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const result = await blockPhone({
    phone: typeof body.phone === "string" ? body.phone : "",
    note: typeof body.note === "string" ? body.note : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "החסימה נכשלה" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    phone: displayPhone(result.phone),
    created: result.created,
    מסקנה: result.created
      ? `${displayPhone(result.phone)} נחסם. המספר לא היה ליד, ולכן נוצרה לו רשומה שלא מופיעה ברשימת הלידים.`
      : `${displayPhone(result.phone)} נחסם. הליד נשאר כמו שהוא - רק החסימה נוספה.`,
  });
}
