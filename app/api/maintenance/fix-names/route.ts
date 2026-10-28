import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { splitName, joinName, hasRepeatedSurname } from "@/lib/person-name";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  תיקון שמות שנשמרו כפולים
 * ============================================================
 *
 *  הקליטה תוקנה, אבל לידים שכבר נכנסו שמורים עם השם
 *  השבור: שם פרטי "יאיר סרוסי" ושם משפחה "סרוסי", שמוצגים
 *  יחד כ"יאיר סרוסי סרוסי".
 *
 *  הפעולה נוגעת **רק בשם הפרטי**, ורק כשהוא מסתיים בשם
 *  המשפחה. הטלפון, הסטטוס, הכניסות וההיסטוריה לא נוגעים
 *  בהם בכלל - אין כאן מחיקה ואין שינוי בעלות.
 */

type Fix = {
  id: string;
  phone: string;
  before: string;
  after: string;
  firstName: string;
};

async function plan(): Promise<Fix[]> {
  const leads = await db.lead
    .findMany({
      where: { firstName: { not: null }, lastName: { not: null } },
      select: { id: true, phone: true, firstName: true, lastName: true },
    })
    .catch(() => []);

  const fixes: Fix[] = [];

  for (const lead of leads) {
    if (!hasRepeatedSurname(lead.firstName, lead.lastName)) continue;

    const { firstName } = splitName({
      first: lead.firstName,
      last: lead.lastName,
    });

    /**
     * אם הפיצול לא החזיר שם פרטי - לא נוגעים.
     * שם ריק גרוע יותר משם כפול.
     */
    if (!firstName) continue;

    fixes.push({
      id: lead.id,
      phone: lead.phone,
      before: joinName(lead.firstName, lead.lastName),
      after: joinName(firstName, lead.lastName),
      firstName,
    });
  }

  return fixes;
}

export async function GET() {
  const fixes = await plan();

  return NextResponse.json({
    פעולה: "תצוגה מקדימה - לא שונה כלום",
    "לידים עם שם כפול": fixes.length,
    דוגמאות: fixes.slice(0, 25).map((f) => ({
      טלפון: f.phone,
      לפני: f.before,
      אחרי: f.after,
    })),
    הערה:
      fixes.length === 0
        ? "אין שמות כפולים. או שהם כבר תוקנו, או שלא נכנסו כאלה."
        : "ההרצה תשנה רק את השם הפרטי. שם המשפחה, הטלפון, הסטטוס וההיסטוריה לא ישתנו.",
  });
}

export async function POST() {
  const fixes = await plan();

  let updated = 0;

  for (const fix of fixes) {
    const res = await db.lead
      .update({
        where: { id: fix.id },
        data: { firstName: fix.firstName },
      })
      .catch(() => null);

    if (res) updated++;
  }

  return NextResponse.json({
    פעולה: "בוצע",
    "שמות שתוקנו": updated,
    "לא תוקנו": fixes.length - updated,
    דוגמאות: fixes.slice(0, 25).map((f) => `${f.before} ← ${f.after}`),
  });
}
