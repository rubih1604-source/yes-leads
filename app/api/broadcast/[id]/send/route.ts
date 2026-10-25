import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { sendTemplate } from "@/lib/texter";

export const dynamic = "force-dynamic";

/** כמה נשלחים בכל קריאה, כדי לא לתקוע את הבקשה */
const BATCH = 15;

/**
 * ============================================================
 *  שולח תבנית לרשימת דיוור, במנות
 * ============================================================
 *
 *  **הבאג שהיה כאן.**
 *
 *  המנה הבאה נבחרה לפי **ספירה**: "נשלחו 15, אז קח מ-15
 *  והלאה". זה עבד רק כל עוד הלולאה בדפדפן רצה ברצף. ברגע
 *  שהיא נעצרה - דף שנסגר, רשת שנפלה - לא הייתה שום דרך
 *  להמשיך: לחיצה חדשה יצרה דיוור חדש שמתחיל מאפס, כלומר
 *  **שולח שוב לאותם 15 אנשים** ולעולם לא מגיע ל-16.
 *
 *  עם 421 אנשי קשר זה אומר שרק 15 מהם יכלו לקבל הודעה,
 *  ושהם יקבלו אותה שוב בכל ניסיון.
 *
 *  מעכשיו כל נמען נרשם בנפרד ב-BroadcastDelivery, והמנה
 *  הבאה היא **מי שעוד לא נרשם** - לא מי שאחרי מספר מסוים.
 *  זה גם מה שמאפשר להמשיך דיוור שנעצר, וגם מונע כפילות.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { templateName, sendId } = await request.json().catch(() => ({}));

  const list = await db.broadcastList.findUnique({
    where: { id: params.id },
    include: { contacts: true },
  });

  if (!list) {
    return NextResponse.json({ error: "הרשימה לא נמצאה" }, { status: 404 });
  }

  let send = sendId
    ? await db.broadcastSend.findUnique({ where: { id: sendId } })
    : null;

  if (!send) {
    if (!templateName) {
      return NextResponse.json({ error: "צריך לבחור תבנית" }, { status: 400 });
    }

    const template = await db.template.findUnique({
      where: { name: templateName },
    });
    if (!template) {
      return NextResponse.json(
        { error: `התבנית ${templateName} לא קיימת` },
        { status: 400 }
      );
    }

    send = await db.broadcastSend.create({
      data: {
        listId: list.id,
        templateName,
        total: list.contacts.length,
      },
    });
  }

  /**
   * מי כבר קיבל בדיוור הזה. זו ההגנה מכפילות ומה שמאפשר
   * להמשיך בדיוק מהנקודה שבה נעצרנו.
   */
  const already = await db.broadcastDelivery
    .findMany({ where: { sendId: send.id }, select: { contactId: true } })
    .catch(() => []);

  const sentIds = new Set(already.map((d) => d.contactId));
  const remaining = list.contacts.filter((c) => !sentIds.has(c.id));
  const batch = remaining.slice(0, BATCH);

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const contact of batch) {
    const result = await sendTemplate({
      templateName: send.templateName,
      to: contact.phone,
      body: contact.firstName ? [contact.firstName] : undefined,
    });

    /**
     * הרישום נעשה **בכל מקרה**, גם בכישלון.
     *
     * נמען שנכשל לא יישלח אליו שוב אוטומטית: עדיף לראות
     * אותו ברשימת הכשלים ולהחליט, מאשר לנסות אותו שוב ושוב
     * בכל המשך ולתקוע את הדיוור.
     */
    await db.broadcastDelivery
      .create({
        data: {
          sendId: send.id,
          contactId: contact.id,
          phone: contact.phone,
          ok: result.ok === true,
          error: result.ok ? null : result.error ?? "שגיאה",
        },
      })
      .catch(() => null);

    /**
     * רישום בכרטיס הליד, אם הטלפון מוכר במערכת.
     *
     * בלי זה אי אפשר היה לפתוח לקוח ולדעת שנשלחה אליו
     * הודעת דיוור - והוא היה יכול לקבל שיחה ממך בלי שתדע
     * שכבר פנית אליו הבוקר.
     */
    const lead = await db.lead
      .findFirst({ where: { phone: contact.phone }, select: { id: true } })
      .catch(() => null);

    if (lead) {
      await db.message
        .create({
          data: {
            leadId: lead.id,
            direction: "out",
            templateName: send.templateName,
            bodyText: `דיוור: ${list.name}`,
            status: result.ok ? "sent" : "failed",
            error: result.ok ? null : result.error ?? "שגיאה",
          },
        })
        .catch(() => null);
    }

    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (!lastError) lastError = result.error ?? "שגיאה";
    }

    // מרווח קטן בין הודעות
    await new Promise((r) => setTimeout(r, 400));
  }

  const finished = remaining.length - batch.length <= 0;

  const updated = await db.broadcastSend.update({
    where: { id: send.id },
    data: {
      sent: { increment: sent },
      failed: { increment: failed },
      state: finished ? "done" : "running",
      finishedAt: finished ? new Date() : null,
    },
  });

  return NextResponse.json({
    ok: true,
    sendId: updated.id,
    sent: updated.sent,
    failed: updated.failed,
    total: updated.total,
    /** כמה עוד לא קיבלו - מה שמאפשר למסך להציע המשך */
    remaining: Math.max(0, remaining.length - batch.length),
    finished,
    lastError,
  });
}
