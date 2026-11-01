import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  שחרור מי שנחסם רק כי אמר "לא מעוניין"
 * ============================================================
 *
 *  **הבעיה שזה פותר.**
 *
 *  עד עדכון 170, "לא מעוניין" הכניס לרשימה השחורה בדיוק
 *  כמו "תסירו אותי". שני הדברים אינם זהים: הראשון הוא
 *  סירוב להצעה הנוכחית, השני הוא סוף הקשר.
 *
 *  התוצאה: לידים שסתם אמרו "לא מעוניין" נחסמו לתמיד,
 *  ובעוד חודש - כשהמחירים משתנים ויוצא מבצע - אי אפשר
 *  לפנות אליהם. זו דאטה שאבדה בלי סיבה.
 *
 *  הפעולה משחררת **רק** את מי שהסיבה שלו היא "אמר שלא
 *  מעוניין". מי שביקש להסיר נשאר חסום, תמיד.
 *
 *  הסטטוס שלהם לא משתנה: הם עדיין "לא מעוניין", והם לא
 *  יקפצו לראש שום רשימה. רק החסימה מוסרת.
 */

/** הסיבה היחידה שמשתחררת. כל השאר נשארות. */
const SOFT_REASON = "אמר שלא מעוניין";

async function softlyBlocked() {
  return db.lead.findMany({
    where: {
      doNotContact: true,
      doNotContactReason: SOFT_REASON,
    },
    select: {
      id: true,
      phone: true,
      firstName: true,
      status: true,
      doNotContactAt: true,
    },
    orderBy: { doNotContactAt: "desc" },
    take: 500,
  });
}

/** קוראת בלבד */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await softlyBlocked().catch(() => null);

  if (!rows) {
    return NextResponse.json({
      מסקנה:
        "לא ניתן לקרוא את סיבת החסימה במסד. אם הרשימה השחורה שלך לא שומרת סיבה, אין דרך בטוחה להבדיל בין 'לא מעוניין' ל'תסירו אותי' - ועדיף לא לשחרר כלום.",
    });
  }

  return NextResponse.json({
    כמה: rows.length,
    מי: rows.map(
      (r) =>
        `${r.firstName ?? ""} ${displayPhone(r.phone)} · ${r.status}`.trim()
    ),
    מסקנה:
      rows.length === 0
        ? "אין אף אחד שנחסם רק בגלל 'לא מעוניין'."
        : `${rows.length} לידים נחסמו רק כי אמרו "לא מעוניין". שחרור יחזיר אותם לדאטה - הסטטוס שלהם לא ישתנה. מי שביקש להסיר לא נוגעים בו.`,
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await softlyBlocked().catch(() => null);

  if (!rows) {
    return NextResponse.json(
      { error: "לא ניתן לקרוא את סיבת החסימה - לא שוחרר אף אחד" },
      { status: 500 }
    );
  }

  let released = 0;

  for (const lead of rows) {
    const done = await db.lead
      .update({
        where: { id: lead.id },
        data: {
          doNotContact: false,
          doNotContactReason: null,
          doNotContactAt: null,
        },
      })
      .catch(() => null);

    if (!done) continue;
    released++;

    /** נרשם על הליד, כדי שתמיד יהיה אפשר לראות מה קרה כאן */
    await db.leadEvent
      .create({
        data: {
          leadId: lead.id,
          type: "blacklist_released",
          actor: "system",
          payload: {
            reason: SOFT_REASON,
            note: "חוסר עניין אינו בקשת הסרה - שוחרר בעדכון 170",
          },
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    שוחררו: released,
    מסקנה: `${released} לידים חזרו לדאטה. מי שביקש להסיר נשאר חסום.`,
  });
}
