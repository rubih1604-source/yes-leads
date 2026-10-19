import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { syncAdSpend } from "@/lib/ad-spend";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  הוצאת הפרסום מפייסבוק
 * ============================================================
 *
 *  GET  - מראה מה פייסבוק מחזירה, בלי לשמור כלום.
 *  POST - שומר.
 *
 *  ברירת המחדל 14 ימים; `?days=60` לטווח אחר.
 *
 *  ההיגיון עצמו יושב ב-lib/ad-spend.ts, כדי שהכפתור במסך
 *  והמנוע היומי יעשו בדיוק את אותו דבר.
 */

function daysOf(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get("days") ?? 14);
  return Number.isFinite(raw) ? raw : 14;
}

export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncAdSpend(daysOf(request), false);

  return NextResponse.json({
    ok: result.ok,
    error: result.error,
    טווח: `${result.since} עד ${result.until}`,
    חשבונות: result.accounts.map((a) => ({
      id: a.id,
      שם: a.name,
      שורות: a.rows,
      שגיאה: a.error,
    })),
    הוצאה_בטווח: Math.round(
      result.sample.reduce((s, r) => s + r.spend, 0)
    ),
    דוגמה: result.sample,
  });
}

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncAdSpend(daysOf(request), true);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    נשמרו: result.saved,
    טווח: `${result.since} עד ${result.until}`,
    חשבונות: result.accounts.map((a) => ({
      שם: a.name,
      שורות: a.rows,
      שגיאה: a.error,
    })),
  });
}
