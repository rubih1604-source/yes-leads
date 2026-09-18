import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * משימות עסק שאינן קשורות לליד מסוים.
 *
 * לשלם לספק, לחדש רישיון, לבדוק תקציב קמפיין - דברים
 * שקודם לא היה להם מקום במערכת ולכן נשכחו.
 *
 * אותו מנוע תזכורות של הלידים מטפל גם בהן: בזמן שקבעת
 * יקפוץ באנר על המסך.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { title, body, dueAt, urgent, repeatDays } = await request
    .json()
    .catch(() => ({}));

  if (!title?.trim()) {
    return NextResponse.json({ error: "צריך כותרת" }, { status: 400 });
  }

  let due: Date | null = null;
  if (typeof dueAt === "string" && dueAt.trim()) {
    const parsed = new Date(dueAt);
    if (!Number.isNaN(parsed.getTime())) due = parsed;
  }

  const note =
    typeof body === "string" && body.trim() ? body.trim().slice(0, 1000) : null;

  const repeat = Number(repeatDays);
  const isRepeating = Number.isFinite(repeat) && repeat >= 1 && repeat <= 365;

  const task = await db.task.create({
    data: {
      leadId: null,
      title: title.trim().slice(0, 200),
      body: isRepeating
        ? `${note ? note + "\n" : ""}חוזר כל ${Math.round(repeat)} ימים`
        : note,
      dueAt: due,
      urgent: urgent === true,
    },
  });

  return NextResponse.json({ ok: true, task });
}
