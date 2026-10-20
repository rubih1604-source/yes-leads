import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  מחיקת לידים שסומנו
 * ============================================================
 *
 *  מחיקה היא הפעולה היחידה במערכת שאי אפשר לבטל, ולכן:
 *
 *   - **GET מראה מה יימחק** ולא מוחק. זו התצוגה המקדימה.
 *   - מוחקים רק מזהים שנשלחו במפורש. אין "מחק לפי סינון",
 *     כי סינון שמשתנה בין התצוגה למחיקה הוא אסון.
 *   - המחיקה מוגבלת ל-200 בפעולה, כדי שטעות תהיה קטנה.
 *
 *  עם הליד נמחקים גם הכניסות, ההודעות, המשימות וההיסטוריה
 *  שלו - זה מוגדר במסד עצמו, ולכן אין שאריות.
 */

const MAX = 200;

function idsFrom(body: unknown): string[] {
  const raw = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(raw)) return [];

  const clean = new Set<string>();

  for (const id of raw) {
    if (typeof id === "string" && id.trim()) clean.add(id.trim());
  }

  return [...clean].slice(0, MAX);
}

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids = idsFrom(body);

  if (ids.length === 0) {
    return NextResponse.json({ error: "לא סומנו לידים" }, { status: 400 });
  }

  /**
   * קודם שולפים מה נמצא, כדי להחזיר דיווח מדויק ולא
   * "נמחקו 5" כשבפועל נמחקו 3.
   */
  const found = await db.lead
    .findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    })
    .catch(() => []);

  if (found.length === 0) {
    return NextResponse.json({ error: "הלידים לא נמצאו" }, { status: 404 });
  }

  const preview = (body as { dryRun?: boolean })?.dryRun === true;

  if (preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      יימחקו: found.length,
      לידים: found.map(
        (l) => `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || l.phone
      ),
    });
  }

  const result = await db.lead
    .deleteMany({ where: { id: { in: found.map((l) => l.id) } } })
    .catch(() => null);

  if (!result) {
    return NextResponse.json({ error: "המחיקה נכשלה" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    נמחקו: result.count,
    מתוך_שסומנו: ids.length,
  });
}
