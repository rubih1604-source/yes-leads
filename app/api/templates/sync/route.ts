import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { syncTemplates } from "@/lib/template-sync";

export const dynamic = "force-dynamic";

/**
 * מושך את התבניות מטקסטר ומעדכן את הרשימה המקומית.
 *
 * **ההיגיון עצמו עבר ל-lib/template-sync.** הוא רץ גם
 * מהמנוע, אוטומטית, ולא רק בלחיצה - ושני המסלולים חייבים
 * להיות אותו קוד בדיוק. שתי גרסאות של סנכרון הן בדיוק
 * סוג הכפילות שגרמה כאן לנזק.
 */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncTemplates();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, raw: result.raw },
      { status: result.raw ? 200 : 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    count: result.count,
    disabled: result.disabled,
    הודעה:
      result.disabled > 0
        ? `${result.count} תבניות עודכנו. ${result.disabled} סומנו כלא זמינות כי הן כבר לא קיימות בטקסטר - המנוע ידלג עליהן.`
        : `${result.count} תבניות עודכנו.`,
  });
}
