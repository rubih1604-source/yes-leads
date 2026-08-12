import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** כל המשימות של הליד - פתוחות קודם, ואז מה שכבר בוצע */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tasks = await db.task.findMany({
    where: { leadId: params.id },
    orderBy: [
      { done: "asc" },
      { urgent: "desc" },
      { dueAt: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 40,
  });

  return NextResponse.json({
    ok: true,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      body: t.body,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      urgent: t.urgent,
      needsReview: t.needsReview,
      done: t.done,
      doneAt: t.doneAt ? t.doneAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      notifiedAt: t.notifiedAt ? t.notifiedAt.toISOString() : null,
    })),
  });
}

/** פתיחת משימה ידנית על ליד, עם שעה שתתריע במייל */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { title, body, dueAt, urgent } = await request
    .json()
    .catch(() => ({}));

  if (!title?.trim()) {
    return NextResponse.json({ error: "צריך כותרת למשימה" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }

  let due: Date | null = null;
  if (typeof dueAt === "string" && dueAt.trim()) {
    const parsed = new Date(dueAt);
    if (!Number.isNaN(parsed.getTime())) due = parsed;
  }

  const task = await db.task.create({
    data: {
      leadId: lead.id,
      title: title.trim().slice(0, 200),
      body: typeof body === "string" ? body.trim().slice(0, 1000) : null,
      dueAt: due,
      urgent: urgent === true,
    },
  });

  /**
   * ביומן נשמרים גם הפרטים, לא רק העובדה שנוצרה משימה,
   * כדי שאפשר יהיה לראות מה בדיוק נפתח ומתי.
   */
  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "task_created",
      actor: "user",
      payload: {
        title: task.title,
        body: task.body,
        dueAt: due?.toISOString() ?? null,
        urgent: task.urgent,
      },
    },
  });

  return NextResponse.json({ ok: true, task });
}
