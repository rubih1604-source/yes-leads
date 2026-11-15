import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * מסמן לידים כפולים.
 *
 * הטלפון הוא מפתח ייחודי, אז כפילות אמיתית היא אותו אדם
 * שמילא טופס פעמיים עם שני מספרים, או ששמו נרשם פעמיים.
 * מזהים לפי שם מלא זהה - והראשון שנכנס נחשב המקורי.
 */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    where: { origin: "leadmanager" },
    orderBy: { intakeAt: "asc" },
    select: { id: true, firstName: true, lastName: true, intakeAt: true },
  });

  const seen = new Map<string, string>();
  let count = 0;

  for (const lead of leads) {
    const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (name.split(" ").length < 2) continue;

    if (seen.has(name)) count++;
    else seen.set(name, lead.id);
  }

  return NextResponse.json({ ok: true, count });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leads = await db.lead.findMany({
    where: { origin: "leadmanager" },
    orderBy: { intakeAt: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });

  const seen = new Map<string, string>();
  let marked = 0;

  for (const lead of leads) {
    const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (name.split(" ").length < 2) continue;

    /**
     * ============================================================
     *  סימון כפילות לפי שם בוטל, בכוונה
     * ============================================================
     *
     *  **למה זה היה שגוי בהגדרה.**
     *
     *  הסימון השווה **שמות מלאים**, לא טלפונים. שני אנשים
     *  שונים לגמרי בשם "משה כהן", עם שני מספרים שונים ושתי
     *  מודעות שונות - אחד מהם סומן ככפול של השני, ומאותו
     *  רגע הוא **נעלם מהספירות**. ליד אמיתי ששילמת עליו,
     *  שהפך לשורה מוסתרת בגלל שם נפוץ.
     *
     *  ליד מזוהה לפי **טלפון**, נקודה. והיום הטלפון הוא
     *  חלק מהמפתח (טלפון + ערוץ), כך שכפילות אמיתית בתוך
     *  ערוץ כבר לא יכולה להיווצר - והתווית "כפול · N"
     *  נגזרת ממספר הכניסות של אותו ליד, לא משורה שנייה.
     *
     *  הכלי מדווח מה הוא **היה** מסמן, ולא נוגע בכלום.
     */
    if (seen.has(name)) marked++;
    else seen.set(name, lead.id);
  }

  return NextResponse.json({ ok: true, marked });
}
