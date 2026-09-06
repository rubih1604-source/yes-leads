import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizePhone, displayPhone, phoneDigits } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * עוקב אחרי ליד בודד לאורך כל המסלול.
 *
 * שאלה נפוצה: "בליד מנגר נכנסו 3, אצלנו 2 - איפה השלישי?"
 * כאן רואים לכל אדם: האם בכלל הגיעה בקשה, מה היה בה, האם
 * נוצר ליד או שהוא עודכן כי כבר היה קיים, ומה קרה מאז.
 *
 * חיפוש לפי טלפון או לפי שם.
 */
export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json(
      { error: "צריך טלפון או שם לחיפוש" },
      { status: 400 }
    );
  }

  const digits = phoneDigits(q);
  const phone = digits.length >= 7 ? normalizePhone(q) : null;

  // ---- מה הגיע מליד מנגר ----
  const logs = await db.webhookLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  const matching = logs.filter((log) => {
    const raw = JSON.stringify(log.payload ?? {});
    if (digits.length >= 4 && raw.replace(/\D/g, "").includes(digits)) {
      return true;
    }
    return raw.includes(q);
  });

  // ---- האם קיים ליד ----
  const lead = phone
    ? await db.lead.findUnique({
        where: { phone },
        include: {
          events: { orderBy: { createdAt: "desc" }, take: 20 },
          entries: { orderBy: { at: "desc" }, take: 10 },
        },
      })
    : await db.lead.findFirst({
        where: {
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
          ],
        },
        include: {
          events: { orderBy: { createdAt: "desc" }, take: 20 },
          entries: { orderBy: { at: "desc" }, take: 10 },
        },
      });

  return NextResponse.json({
    ok: true,
    query: q,
    arrivals: matching.map((log) => ({
      at: log.createdAt.toISOString(),
      processed: log.processed,
      error: log.error,
      payload: log.payload,
    })),
    lead: lead
      ? {
          id: lead.id,
          name: `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim(),
          phone: displayPhone(lead.phone),
          status: lead.status,
          origin: lead.origin,
          intakeAt: lead.intakeAt.toISOString(),
          createdAt: lead.createdAt.toISOString(),
          entries: lead.entries.map((e) => ({
            campaign: e.campaign,
            isSale: e.isSale,
            at: e.at.toISOString(),
          })),
          events: lead.events.map((e) => ({
            type: e.type,
            from: e.fromStatus,
            to: e.toStatus,
            at: e.createdAt.toISOString(),
          })),
        }
      : null,
    summary: lead
      ? matching.length > 1
        ? `הגיעו ${matching.length} בקשות לאותו מספר. הראשונה יצרה את הליד, השאר עדכנו אותו - לכן הוא נספר פעם אחת ברשימה.`
        : "הליד קיים במערכת."
      : matching.length > 0
      ? "הגיעה בקשה אבל לא נוצר ליד. בדוק את השדה error בבקשה."
      : "לא הגיעה שום בקשה עם הפרטים האלה. הבעיה בצד של ליד מנגר.",
  });
}
