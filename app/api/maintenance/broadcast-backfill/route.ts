import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { phoneDigits } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  מי כבר קיבל את התבנית הזו
 * ============================================================
 *
 *  שתי בעיות נפרדות, ושתיהן מסתיימות באותה תוצאה: אדם מקבל
 *  את אותה הודעה פעמיים.
 *
 *  **1. הדיוור שנעצר.** עד גרסה 141 הדיוור ספר "כמה נשלחו"
 *     ולא רשם **מי**. אין לזה רישום, ולכן אי אפשר לדעת
 *     בוודאות מי היו - רק להעריך לפי סדר הרשימה.
 *
 *  **2. שליחה קודמת לאותה תבנית.** שליחה מרשימת הלידים
 *     **כן** נרשמה, כהודעה יוצאת בכרטיס של כל ליד. זו
 *     הבעיה הגדולה יותר: רשימת דיוור ישנה יכולה לחפוף
 *     ברובה לאנשים שכבר קיבלו את המבצע הבוקר.
 *
 *  לכן הפעולה בודקת את שניהם, ומפרידה ביניהם בתצוגה: מה
 *  שידוע בוודאות מרישום אמיתי, ומה שהוא הערכה.
 */

const WINDOW_DAYS = 14;

type Plan = {
  sendId: string;
  listName: string;
  templateName: string;
  total: number;
  /** נמענים עם רישום הודעה אמיתי - ודאות */
  known: Array<{ id: string; phone: string; at: string }>;
  /** הערכה לפי סדר הרשימה, מהדיוור שלא נרשם */
  guessed: Array<{ id: string; phone: string }>;
};

async function build(): Promise<Plan[]> {
  const sends = await db.broadcastSend
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        list: { include: { contacts: true } },
        deliveries: { select: { contactId: true } },
      },
    })
    .catch(() => []);

  const plans: Plan[] = [];
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const send of sends) {
    const counted = send.sent + send.failed;
    if (counted === 0 && send.deliveries.length === 0) continue;

    const alreadyLogged = new Set(send.deliveries.map((d) => d.contactId));

    /**
     * כל מי שקיבל את התבנית הזו לאחרונה, לפי רישום אמיתי
     * בכרטיס הליד. זה המקור האמין - לא ניחוש.
     */
    const messages = await db.message
      .findMany({
        where: {
          templateName: send.templateName,
          direction: "out",
          status: "sent",
          createdAt: { gte: since },
        },
        select: { createdAt: true, lead: { select: { phone: true } } },
      })
      .catch(() => []);

    const gotAt = new Map<string, Date>();
    for (const m of messages) {
      const key = phoneDigits(m.lead?.phone ?? "");
      if (!key) continue;
      const prev = gotAt.get(key);
      if (!prev || m.createdAt > prev) gotAt.set(key, m.createdAt);
    }

    const known: Plan["known"] = [];
    for (const contact of send.list.contacts) {
      if (alreadyLogged.has(contact.id)) continue;
      const at = gotAt.get(phoneDigits(contact.phone));
      if (!at) continue;
      known.push({
        id: contact.id,
        phone: contact.phone,
        at: at.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
      });
    }

    /**
     * ההערכה: N הראשונים ברשימה, כמו שהקוד הישן חתך.
     * מוצגת בנפרד ובמפורש, כי היא לא ודאית.
     */
    const knownIds = new Set(known.map((k) => k.id));
    const guessed =
      send.deliveries.length === 0
        ? send.list.contacts
            .slice(0, counted)
            .filter((c) => !knownIds.has(c.id))
            .map((c) => ({ id: c.id, phone: c.phone }))
        : [];

    if (known.length === 0 && guessed.length === 0) continue;

    plans.push({
      sendId: send.id,
      listName: send.list.name,
      templateName: send.templateName,
      total: send.list.contacts.length,
      known,
      guessed,
    });
  }

  return plans;
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plans = await build();

  return NextResponse.json({
    פעולה: "תצוגה מקדימה — לא שונה כלום",
    "נבדק טווח": `${WINDOW_DAYS} ימים אחורה`,
    פירוט: plans.map((p) => ({
      רשימה: p.listName,
      תבנית: p.templateName,
      "סך הרשימה": p.total,
      "כבר קיבלו — לפי רישום אמיתי": p.known.length,
      "דוגמאות": p.known.slice(0, 20).map((k) => `${k.phone} · ${k.at}`),
      "הערכה מהדיוור שלא נרשם": p.guessed.length,
      "דוגמאות להערכה": p.guessed.slice(0, 20).map((g) => g.phone),
    })),
    הסבר:
      plans.length === 0
        ? "אין חפיפה. אפשר לשלוח לכל הרשימה בלי שאף אחד יקבל פעמיים."
        : '"לפי רישום אמיתי" הוא ודאי — אלה אנשים שהמערכת שלחה להם את אותה תבנית ורשמה את זה. "הערכה" היא ניחוש לפי סדר הרשימה מהדיוור שנעצר, ואי אפשר לאמת אותו. הרצה תסמן את שניהם כמי שכבר קיבלו.',
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plans = await build();

  let marked = 0;

  for (const plan of plans) {
    const rows = [
      ...plan.known.map((k) => ({ ...k, why: "קיבל את התבנית הזו לאחרונה" })),
      ...plan.guessed.map((g) => ({
        ...g,
        why: "הערכה לפי סדר הרשימה מהדיוור שנעצר",
      })),
    ];

    for (const row of rows) {
      await db.broadcastDelivery
        .create({
          data: {
            sendId: plan.sendId,
            contactId: row.id,
            phone: row.phone,
            ok: true,
            error: row.why,
          },
        })
        .catch(() => null);

      marked++;
    }
  }

  return NextResponse.json({
    פעולה: "בוצע",
    "סומנו כמי שכבר קיבלו": marked,
    הסבר:
      'עכשיו "המשך את הדיוור" ידלג עליהם וישלח רק למי שבאמת לא קיבל.',
  });
}
