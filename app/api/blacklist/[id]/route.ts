import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { addToBlacklist, removeFromBlacklist } from "@/lib/blacklist";

export const dynamic = "force-dynamic";

/**
 * הוספה והוצאה ידנית מהרשימה השחורה.
 *
 * שתיהן עוברות דרך אותו מקום אחד שהקליטה משתמשת בו, כדי
 * שלא ייווצרו שתי דרכים להיכנס שמתנהגות שונה.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const done = await removeFromBlacklist(params.id);

  if (!done) {
    return NextResponse.json(
      { error: "ההוצאה נכשלה - הליד לא נמצא" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * הוספה ידנית - הכפתור "הסר מדיוור" בכרטיס הליד.
 *
 * לא כל בקשת הסרה מגיעה כהודעה: לקוח אומר את זה בטלפון,
 * או שאתה פשוט יודע. בלי זה הדרך היחידה להוסיף מישהו
 * הייתה לקוות שהוא יכתוב "הסר" בוואטסאפ.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const done = await addToBlacklist({
    leadId: params.id,
    reason: "הוסר ידנית",
  });

  if (!done) {
    return NextResponse.json(
      { error: "ההוספה נכשלה - הליד לא נמצא" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
