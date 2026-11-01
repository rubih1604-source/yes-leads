import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { readNoteTiming, noteAlertTitle } from "@/lib/note-timing";
import { shiftToWorkingHours } from "@/lib/working-hours";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  שמירת הערה - ופתיחת התזכורת שבתוכה
 * ============================================================
 *
 *  **למה השמירה והתזכורת באותו מקום.**
 *
 *  אם ההערה נשמרת כאן והתזכורת נפתחת במקום אחר, בסוף
 *  יש הערה בלי תזכורת. השמירה **היא** האירוע שפותח את
 *  התזכורת, ולכן שתיהן כאן.
 *
 *  **תזכורת אחת לכל ליד, תמיד מההערה האחרונה.** שינית
 *  את ההערה? הישנה מבוטלת והחדשה נפתחת. בלי זה היו
 *  נערמות תזכורות לתאריכים שכבר לא נכונים.
 */

/** מסמן תזכורת שנולדה מהערה, כדי שאפשר יהיה להחליף רק אותה */
const NOTE_JOB = "הערה";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const raw = typeof body.notes === "string" ? body.notes : "";
  const notes = raw.trim().slice(0, 2000);

  const lead = await db.lead.findUnique({
    where: { id: params.id },
    select: { id: true, notes: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }

  await db.lead.update({
    where: { id: lead.id },
    data: { notes: notes || null },
  });

  await db.leadEvent
    .create({
      data: {
        leadId: lead.id,
        type: "note_saved",
        actor: "user",
        payload: { notes: notes.slice(0, 500) },
      },
    })
    .catch(() => null);

  /** התזכורת הקודמת מההערה מבוטלת לפני שנפתחת חדשה */
  await db.scheduledJob
    .updateMany({
      where: {
        leadId: lead.id,
        state: "pending",
        action: "notify",
        note: { startsWith: NOTE_JOB },
      },
      data: { state: "cancelled", lastError: "ההערה עודכנה" },
    })
    .catch(() => null);

  const now = new Date();
  const timing = notes ? readNoteTiming(notes, now) : null;

  if (!timing) {
    return NextResponse.json({
      ok: true,
      תזכורת: null,
      מסקנה: notes
        ? "ההערה נשמרה. לא זוהה בה מועד, ולכן לא נפתחה תזכורת."
        : "ההערה נמחקה.",
    });
  }

  await db.scheduledJob
    .create({
      data: {
        leadId: lead.id,
        action: "notify",
        runAt: shiftToWorkingHours(timing.remindAt),
        note: `${NOTE_JOB} · ${noteAlertTitle(notes, timing)}`,
      },
    })
    .catch(() => null);

  return NextResponse.json({
    ok: true,
    תזכורת: {
      מה_זוהה: timing.label,
      המועד: timing.dueAt.toLocaleDateString("he-IL", {
        timeZone: "Asia/Jerusalem",
      }),
      ההתראה: timing.remindAt.toLocaleDateString("he-IL", {
        timeZone: "Asia/Jerusalem",
      }),
    },
    מסקנה: `נפתחה תזכורת ל-${timing.remindAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}, שלושה ימים לפני המועד.`,
  });
}
