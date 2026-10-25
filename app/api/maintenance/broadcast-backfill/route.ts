import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  השלמת רישום לדיוור ישן
 * ============================================================
 *
 *  עד הגרסה הזו הדיוור ספר רק "כמה נשלחו" ולא רשם **מי**.
 *  דיוור שנעצר באמצע השאיר מספר בלי שמות, ולכן המשך שלו
 *  היה מתחיל מההתחלה ושולח שוב לאותם אנשים.
 *
 *  הפעולה הזו משלימה את הרישום החסר: היא לוקחת את N אנשי
 *  הקשר הראשונים ברשימה - בדיוק באותו סדר שבו הקוד הישן
 *  שלף אותם - ומסמנת אותם כ"כבר קיבלו".
 *
 *  **הסתייגות שחשוב שתכיר.** הקוד הישן חתך לפי מיקום
 *  ברשימה, והסדר שבו המסד מחזיר שורות בלי מיון מפורש אינו
 *  מובטח. בפועל זה כמעט תמיד סדר ההוספה, ולכן הסיכוי גבוה
 *  שאלה בדיוק אותם אנשים - אבל זו הסתברות, לא ודאות.
 *
 *  לכן GET מראה את הרשימה **בשמות ובטלפונים**, כדי שתוכל
 *  להשוות מול יומן השליחות של טקסטר לפני שאתה מאשר. אין
 *  דרך אחרת לדעת בוודאות מי קיבל, כי הרישום פשוט לא נעשה.
 */

type Plan = {
  sendId: string;
  listName: string;
  templateName: string;
  alreadyCounted: number;
  total: number;
  contacts: Array<{ id: string; phone: string; name: string }>;
};

async function build(): Promise<Plan[]> {
  const sends = await db.broadcastSend
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        list: { include: { contacts: true } },
        deliveries: { select: { id: true }, take: 1 },
      },
    })
    .catch(() => []);

  const plans: Plan[] = [];

  for (const send of sends) {
    const counted = send.sent + send.failed;

    // אין מה להשלים: או שלא נשלח כלום, או שכבר יש רישום
    if (counted === 0) continue;
    if (send.deliveries.length > 0) continue;

    plans.push({
      sendId: send.id,
      listName: send.list.name,
      templateName: send.templateName,
      alreadyCounted: counted,
      total: send.list.contacts.length,
      contacts: send.list.contacts.slice(0, counted).map((c) => ({
        id: c.id,
        phone: c.phone,
        name: c.firstName ?? "",
      })),
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
    "דיוורים שחסר להם רישום": plans.length,
    פירוט: plans.map((p) => ({
      רשימה: p.listName,
      תבנית: p.templateName,
      "נספרו כנשלחו": p.alreadyCounted,
      "סך הרשימה": p.total,
      "יסומנו כמי שכבר קיבלו": p.contacts.map(
        (c) => `${c.phone}${c.name ? ` · ${c.name}` : ""}`
      ),
    })),
    הסבר:
      plans.length === 0
        ? "אין מה להשלים. כל הדיוורים כבר מנוהלים ברישום לכל נמען."
        : "השווה את הרשימה הזו ליומן השליחות בטקסטר. אם אלה אותם אנשים — הרץ, והם לא יקבלו שוב. אם לא — אל תריץ, וכל הרשימה תקבל מההתחלה.",
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plans = await build();

  let marked = 0;

  for (const plan of plans) {
    for (const contact of plan.contacts) {
      /**
       * נרשם כהצלחה, כי כך הם נספרו בדיוור המקורי.
       * המטרה היחידה היא שלא יקבלו שוב.
       */
      await db.broadcastDelivery
        .create({
          data: {
            sendId: plan.sendId,
            contactId: contact.id,
            phone: contact.phone,
            ok: true,
            error: "הושלם בדיעבד — הדיוור המקורי לא רשם לכל נמען",
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
      "עכשיו אפשר ללחוץ 'המשך את הדיוור' במסך דיוור, והוא ימשיך רק למי שעוד לא קיבל.",
  });
}
