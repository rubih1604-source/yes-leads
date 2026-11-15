import { NextRequest, NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { traceClaim, findCollisions } from "@/lib/claim-trace";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  "למה הליד הזה הלך לצד הלא נכון"
 * ============================================================
 *
 *  בלי פרמטרים - כל ההתנגשויות: מפתח שרשום בשני מקומות.
 *  זו הסיבה הסבירה ביותר לליד שהלך לקונה במקום אליך, והיא
 *  הייתה בלתי נראית לגמרי.
 *
 *  עם פרמטרים - הרצה של שרשרת ההכרעה על מזהים נתונים,
 *  צעד אחר צעד. אפשר להעתיק אותם ישר מהבלוק האפור ביומן
 *  הקליטה ולראות מי תופס, בלי לחכות לליד הבא.
 */
export async function GET(request: NextRequest) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const p = new URL(request.url).searchParams;
  const read = (k: string) => p.get(k)?.trim() || null;

  const ids = {
    campaign: read("campaign"),
    campaignId: read("campaignId"),
    adsetId: read("adsetId"),
    adId: read("adId"),
    formId: read("formId"),
  };

  const any = Object.values(ids).some(Boolean);

  const collisions = await findCollisions().catch(() => []);

  if (!any) {
    return NextResponse.json({ ok: true, collisions, trace: null });
  }

  const trace = await traceClaim(ids).catch(() => null);

  return NextResponse.json({ ok: true, collisions, trace });
}
