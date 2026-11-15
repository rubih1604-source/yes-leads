import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { findGap, importMissing } from "@/lib/facebook-gap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * השוואה מול פייסבוק: מי קיים שם ולא כאן.
 *
 * **ההשוואה עצמה יושבת ב-lib/facebook-gap**, כי המנוע
 * מריץ אותה לבד כל שעתיים. שתי גרסאות של אותה בדיקה הן
 * בדיוק הכפילות שגרמה כאן לנזק.
 */

const DEFAULT_DAYS = 7;

function daysOf(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get("days") ?? DEFAULT_DAYS);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : DEFAULT_DAYS, 1), 90);
}

/** קוראת בלבד - משווה ולא מייבאת כלום */
export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gap = await findGap(daysOf(request));

  return NextResponse.json({
    נבדקו_טפסים: gap.forms.length,
    נבדקו_לידים: gap.checked,
    חסרים: gap.missing.length,
    מי: gap.missing.map(
      (m) =>
        `${m.name || "ללא שם"} · ${m.phone ? displayPhone(m.phone) : "בלי טלפון"} · ${m.at.slice(0, 16).replace("T", " ")}`
    ),
    שגיאה: gap.error,
    מסקנה: gap.error
      ? `לא הצלחנו לקרוא את הלידים מפייסבוק: ${gap.error}`
      : gap.missing.length === 0
        ? `כל ${gap.checked} הלידים מפייסבוק נמצאים גם אצלנו. אין פער.`
        : `${gap.missing.length} לידים קיימים בפייסבוק ולא אצלנו. 'הפעל' יכניס אותם.`,
  });
}

/** מייבא את מה שחסר */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gap = await findGap(daysOf(request));

  if (gap.error && gap.missing.length === 0) {
    return NextResponse.json({ error: gap.error }, { status: 502 });
  }

  const result = await importMissing(gap.missing);

  return NextResponse.json({
    הוכנסו: result.imported,
    נכשלו: result.failed,
    בעיות: result.problems.slice(0, 20),
    מסקנה:
      result.imported > 0
        ? `${result.imported} לידים שחסרו הוכנסו למערכת.`
        : result.failed > 0
          ? "אף ליד לא הוכנס. ראה בעיות."
          : "אין לידים חסרים.",
  });
}
