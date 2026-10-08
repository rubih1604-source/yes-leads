import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { israelParts } from "@/lib/working-hours";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  איחוד כניסות שנוצרו מעדכוני סטטוס
 * ============================================================
 *
 *  מה קרה:
 *
 *  ליד מנגר שולח webhook גם כשמשתנה **סטטוס**, לא רק כשנכנס
 *  ליד חדש. כל עוד לא היה מזהה הגשה של פייסבוק, לא היה איך
 *  להבדיל - וכל שינוי סטטוס שעשית נרשם ככניסה חדשה.
 *
 *  התוצאה:
 *    - תאריך הכניסה של הליד קפץ לתאריך שבו שינית סטטוס
 *    - הליד נספר כ"כפול" בלי סיבה
 *    - סינון "החודש" הראה כמעט הכל, כי כמעט לכל ליד
 *      היה תאריך עדכני
 *
 *  מה הכלי הזה עושה:
 *
 *  **שתי כניסות של אותו ליד, באותו ערוץ, באותו יום = הגעה
 *  אחת.** נשמרת המוקדמת ביותר, והשאר נמחקות. אחר כך תאריך
 *  הכניסה של הליד מחושב מחדש לפי הכניסה האחרונה שנשארה
 *  בערוץ שלך.
 *
 *  למה דווקא "אותו יום": זה גבול ברור שלא יכול להתפשט.
 *  אדם שבאמת מילא טופס פעמיים באותו יום הוא מקרה נדיר,
 *  ולספור אותו כאחד מזיק הרבה פחות מהמצב הנוכחי.
 *
 *  GET  = מראה בלבד, כולל השפעה על ההכנסה. לא משנה כלום.
 *  POST = מבצע.
 */

type Entry = {
  id: string;
  at: Date;
  isSale: boolean;
  price: number;
};

/** מפתח יומי בשעון ישראל, כדי שחצות יהיה חצות שלך */
function dayKey(at: Date): string {
  const p = israelParts(at);
  return `${p.year}-${p.month}-${p.day}`;
}

async function build() {
  const leads = await db.lead.findMany({
    where: { entries: { some: {} } },
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      intakeAt: true,
      entries: {
        select: { id: true, at: true, isSale: true, price: true },
        orderBy: { at: "asc" },
      },
    },
  });

  const toDelete: string[] = [];
  const intakeFixes: Array<{ id: string; at: Date }> = [];

  let leadsTouched = 0;
  let revenueRemoved = 0;

  const examples: Array<{
    name: string;
    phone: string;
    was: number;
    becomes: number;
    oldDate: string;
    newDate: string;
  }> = [];

  for (const lead of leads) {
    const keptByBucket = new Map<string, Entry>();
    const removed: Entry[] = [];

    for (const entry of lead.entries as Entry[]) {
      // ערוץ + יום = דלי אחד
      const bucket = `${entry.isSale ? "sale" : "mine"}|${dayKey(entry.at)}`;
      const kept = keptByBucket.get(bucket);

      if (!kept) {
        keptByBucket.set(bucket, entry);
        continue;
      }

      // הכניסות ממוינות, ולכן הראשונה בדלי היא המוקדמת
      removed.push(entry);
    }

    if (removed.length === 0) continue;

    leadsTouched++;
    for (const e of removed) {
      toDelete.push(e.id);
      if (e.isSale) revenueRemoved += Number(e.price ?? 0);
    }

    /**
     * תאריך הכניסה מחושב מחדש מהכניסות שנשארו בערוץ שלך.
     * זה התאריך שהרשימה מסדרת ומסננת לפיו.
     */
    const mineKept = Array.from(keptByBucket.values()).filter((e) => !e.isSale);

    if (mineKept.length > 0) {
      const latest = mineKept.reduce((a, b) => (a.at > b.at ? a : b));
      if (latest.at.getTime() !== lead.intakeAt.getTime()) {
        intakeFixes.push({ id: lead.id, at: latest.at });

        if (examples.length < 25) {
          examples.push({
            name:
              `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
              "ללא שם",
            phone: lead.phone,
            was: lead.entries.length,
            becomes: keptByBucket.size,
            oldDate: lead.intakeAt.toISOString().slice(0, 10),
            newDate: latest.at.toISOString().slice(0, 10),
          });
        }
      }
    }
  }

  return {
    leadsTouched,
    entriesRemoved: toDelete.length,
    datesFixed: intakeFixes.length,
    revenueRemoved: Math.round(revenueRemoved * 100) / 100,
    examples,
    toDelete,
    intakeFixes,
  };
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = await build();

  return NextResponse.json({
    ok: true,
    mode: "תצוגה מקדימה - לא בוצע שום שינוי",
    verdict:
      plan.entriesRemoved === 0
        ? "הנתונים נקיים. אין כניסות כפולות לאחד"
        : `${plan.entriesRemoved} כניסות נוצרו מעדכוני סטטוס, ב-${plan.leadsTouched} לידים`,
    leadsTouched: plan.leadsTouched,
    entriesRemoved: plan.entriesRemoved,
    datesFixed: plan.datesFixed,
    revenueRemoved: plan.revenueRemoved,
    revenueNote:
      plan.revenueRemoved > 0
        ? `שים לב: ${plan.revenueRemoved} ש"ח ייגרעו מספירת ההכנסה, כי הם נספרו פעמיים על אותה הגעה`
        : "ההכנסה לא מושפעת",
    examples: plan.examples,
    howToApply: "כדי לבצע בפועל צריך לשלוח POST לאותה כתובת",
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = await build();

  // מחיקה במנות, כדי לא להעמיס שאילתה אחת ענקית
  for (let i = 0; i < plan.toDelete.length; i += 200) {
    const batch = plan.toDelete.slice(i, i + 200);
    await db.leadEntry
      .deleteMany({ where: { id: { in: batch } } })
      .catch(() => null);
  }

  for (const fix of plan.intakeFixes) {
    await db.lead
      .update({ where: { id: fix.id }, data: { intakeAt: fix.at } })
      .catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    mode: "בוצע",
    leadsTouched: plan.leadsTouched,
    entriesRemoved: plan.entriesRemoved,
    datesFixed: plan.datesFixed,
    revenueRemoved: plan.revenueRemoved,
  });
}
