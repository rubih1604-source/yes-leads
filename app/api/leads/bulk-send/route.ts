import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { shiftToWorkingHours } from "@/lib/working-hours";

export const dynamic = "force-dynamic";

/** מרווח בין הודעות, כדי לא להיחסם */
const GAP_SECONDS = 8;

/** דיוור לרשימת לידים שסימנת ידנית */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { leadIds, templateName } = await request.json().catch(() => ({}));

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "לא נבחרו לידים" }, { status: 400 });
  }

  if (!templateName) {
    return NextResponse.json({ error: "צריך לבחור תבנית" }, { status: 400 });
  }

  const leads = await db.lead.findMany({
    where: { id: { in: leadIds }, doNotContact: false },
    select: { id: true },
  });

  if (leads.length === 0) {
    return NextResponse.json(
      { error: "כל הלידים שנבחרו ברשימת אי-פנייה" },
      { status: 400 }
    );
  }

  const now = Date.now();
  let scheduled = 0;

  for (const [i, lead] of leads.entries()) {
    await db.scheduledJob
      .create({
        data: {
          leadId: lead.id,
          action: "send_template",
          templateName,
          runAt: shiftToWorkingHours(new Date(now + i * GAP_SECONDS * 1000)),
          state: "pending",
          note: "דיוור ידני מרשימת הלידים",
        },
      })
      .catch(() => null);
    scheduled++;
  }

  return NextResponse.json({
    ok: true,
    scheduled,
    skipped: leadIds.length - scheduled,
  });
}
