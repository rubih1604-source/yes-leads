import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { shiftToWorkingHours } from "@/lib/working-hours";

export const dynamic = "force-dynamic";

/** מרווח בין הודעות, כדי לא להיחסם */
const GAP_SECONDS = 8;

/**
 * דיוור לרשימת לידים שסימנת.
 *
 * חשוב: לא בולעים שגיאות. אם יצירת המשימה נכשלה, זה חוזר
 * אליך עם הסיבה - במקום לדווח "נשלח" ושום דבר לא יקרה.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { leadIds, templateName, sendNow } = await request
    .json()
    .catch(() => ({}));

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "לא נבחרו לידים" }, { status: 400 });
  }

  if (!templateName) {
    return NextResponse.json({ error: "צריך לבחור תבנית" }, { status: 400 });
  }

  const template = await db.template.findUnique({
    where: { name: templateName },
  });
  if (!template) {
    return NextResponse.json(
      { error: `התבנית ${templateName} לא קיימת במערכת` },
      { status: 400 }
    );
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

  /**
   * מזהה ייחודי לדיוור הזה.
   *
   * למשימות דיוור אין חוק, ולכן ruleId ריק. בלי מזהה צעד
   * ייחודי, ליד שכבר קיבל דיוור בעבר עלול להיחסם על ידי
   * מגבלת הייחודיות - וההודעה פשוט לא תיווצר.
   */
  const runId = now % 1_000_000;
  let scheduled = 0;
  let firstError: string | null = null;

  for (const [i, lead] of leads.entries()) {
    const at = new Date(now + i * GAP_SECONDS * 1000);

    /**
     * דיוור ידני יוצא מתי שאתה מחליט.
     *
     * דחיית שעות קיימת כדי שרצף אוטומטי לא יתעורר ב-2 בלילה,
     * אבל כשאתה לוחץ על הכפתור בעצמך - זו החלטה שלך.
     */
    /**
     * דיוור ידני יוצא מיד כברירת מחדל - אתה לחצת על הכפתור.
     * מי שרוצה לדחות לשעות פעילות מכבה את המתג.
     */
    const runAt = sendNow === false ? shiftToWorkingHours(at) : at;

    try {
      await db.scheduledJob.create({
        data: {
          leadId: lead.id,
          action: "send_template",
          templateName,
          runAt,
          stepIndex: runId,
          state: "pending",
          note: "דיוור ידני מרשימת הלידים",
        },
      });
      scheduled++;
    } catch (err) {
      /**
       * ליד שכבר יש לו משימה זהה ממתינה יידחה על ידי
       * מגבלת הייחודיות. זה תקין ולא נחשב לכישלון.
       */
      const message = err instanceof Error ? err.message : String(err);
      if (!firstError && !message.includes("Unique constraint")) {
        firstError = message.slice(0, 300);
      }
    }
  }

  if (scheduled === 0) {
    return NextResponse.json(
      {
        error: firstError
          ? `לא נוצרה אף משימה. השגיאה: ${firstError}`
          : "לא נוצרה אף משימה. ייתכן שכבר קיים דיוור ממתין ללידים האלה.",
      },
      { status: 500 }
    );
  }

  const firstRun = shiftToWorkingHours(new Date(now));

  return NextResponse.json({
    ok: true,
    scheduled,
    skipped: leadIds.length - scheduled,
    startsAt: firstRun.toISOString(),
    warning: firstError,
  });
}
