import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { shiftToWorkingHours } from "@/lib/working-hours";
import { readTargets, hasAnyTarget } from "@/lib/offer-targets";

export const dynamic = "force-dynamic";

/** כמה שניות בין הודעה להודעה - שמירה על קצב שפוי מול וואטסאפ */
const GAP_SECONDS = 8;

/** מוצא את הלידים שהמבצע מיועד להם */
async function recipientsFor(offerId: string) {
  const offer = await db.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { offer: null, leads: [] };

  const targets = readTargets(offer.targets);
  if (!hasAnyTarget(targets)) return { offer, leads: [] };

  /**
   * ליד נכנס אם הוא בסטטוס שסומן, או אם הוא מסומן
   * בתת-סטטוס שסומן. הרשימה נבנית מחדש בכל שליחה.
   */
  const or: Array<Record<string, unknown>> = [];
  if (targets.statuses.length) or.push({ status: { in: targets.statuses } });
  if (targets.subStatuses.length)
    or.push({ subStatus: { in: targets.subStatuses } });

  const leads = await db.lead.findMany({
    where: {
      origin: "leadmanager",
      doNotContact: false,
      OR: or,
    },
    orderBy: { intakeAt: "desc" },
    select: {
      id: true,
      phone: true,
      firstName: true,
      status: true,
      subStatus: true,
    },
  });

  return { offer, leads };
}

/** תצוגה מקדימה של הרשימה */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { offer, leads } = await recipientsFor(params.id);
  if (!offer) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ ok: true, count: leads.length, leads });
}

/** יצירת הדיוור - שליחה מדורגת דרך המנוע */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { templateName } = await request.json().catch(() => ({}));
  if (!templateName) {
    return NextResponse.json({ error: "צריך לבחור תבנית" }, { status: 400 });
  }

  const { offer, leads } = await recipientsFor(params.id);
  if (!offer) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  if (leads.length === 0) {
    return NextResponse.json(
      { error: "אין לידים שמתאימים למבצע הזה" },
      { status: 400 }
    );
  }

  /**
   * לא שולחים הכל בבת אחת. כל הודעה מתוזמנת עם מרווח,
   * והמנוע מוציא אותן בקצב. גם מגן מפני חסימה של וואטסאפ
   * וגם נותן לך זמן לעצור אם משהו נראה לא טוב.
   */
  const now = Date.now();
  let created = 0;

  for (const [i, lead] of leads.entries()) {
    const runAt = shiftToWorkingHours(
      new Date(now + i * GAP_SECONDS * 1000)
    );

    await db.scheduledJob
      .create({
        data: {
          leadId: lead.id,
          action: "send_template",
          templateName,
          runAt,
          state: "pending",
          note: `דיוור מבצע: ${offer.title}`,
        },
      })
      .catch(() => null);

    created++;
  }

  await db.offerSend.create({
    data: { offerId: offer.id, templateName, total: created },
  });

  return NextResponse.json({ ok: true, scheduled: created });
}
