import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * מתקן תאריכי כניסה חריגים.
 *
 * ליד שנוצר היום אבל תאריך הכניסה שלו נקרא לא נכון מקובץ
 * נדחק לסוף הרשימה ונראה כאילו נעלם. כאן מזהים את המקרים
 * האלה ומיישרים את התאריך לפי מתי הרשומה באמת נוצרה.
 *
 * חריג = תאריך לפני 2020, או תאריך שקדם ליצירת הרשומה
 * ביותר משנתיים, או תאריך עתידי.
 */

const FLOOR = new Date("2020-01-01");

function looksWrong(intakeAt: Date, createdAt: Date): boolean {
  if (intakeAt < FLOOR) return true;
  if (intakeAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) return true;
  const gap = createdAt.getTime() - intakeAt.getTime();
  return gap > 2 * 365 * 24 * 60 * 60 * 1000;
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    select: { id: true, intakeAt: true, createdAt: true },
  });

  const bad = leads.filter((l) => looksWrong(l.intakeAt, l.createdAt));

  return NextResponse.json({ ok: true, count: bad.length });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    select: { id: true, intakeAt: true, createdAt: true },
  });

  let fixed = 0;
  for (const lead of leads) {
    if (!looksWrong(lead.intakeAt, lead.createdAt)) continue;
    await db.lead
      .update({ where: { id: lead.id }, data: { intakeAt: lead.createdAt } })
      .catch(() => null);
    fixed++;
  }

  return NextResponse.json({ ok: true, fixed });
}
