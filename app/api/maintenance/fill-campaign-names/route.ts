import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  השלמת שמות קמפיין ללידים שנכנסו בלי שיוך
 * ============================================================
 *
 *  **למי זה נועד.** ליד שנכנס מחשבון מודעות שלא היה משויך
 *  לטוקן של העמוד הגיע עם המזהים בלבד - בלי שם קמפיין,
 *  סט ומודעה. אחרי שמשייכים את חשבון המודעות, פייסבוק
 *  כן מחזירה את השמות, אבל **רק לליד חדש**: הישנים נשארים
 *  כמו שהם לנצח.
 *
 *  הפעולה הזו מושכת את השמות שוב ללידים שכבר נכנסו.
 *
 *  **לא נוגעת בשום דבר אחר.** רק מוסיפה שלושה שדות
 *  לשדות הקיימים של הליד, ורק למי שחסרים אצלו.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : {};
}

function text(fields: Fields, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value.trim() : "";
}

/** הלידים שחסרים להם שמות ויש להם מזהה שאפשר לשאול עליו */
async function pending(limit: number) {
  const leads = await db.lead
    .findMany({
      where: { origin: { not: "sale" } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { id: true, phone: true, firstName: true, extra: true },
    })
    .catch(() => []);

  return leads
    .filter((lead) => {
      const fields = fieldsOf(lead.extra);
      if (text(fields, "fb_campaign")) return false;
      return Boolean(text(fields, "fb_leadid"));
    })
    .slice(0, limit);
}

/** קוראת בלבד - מראה מי מחכה ולא נוגעת בכלום */
export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const rows = await pending(Math.min(Math.max(limit, 1), 500));

  return NextResponse.json({
    כמה: rows.length,
    מי: rows
      .slice(0, 40)
      .map((lead) => `${lead.firstName ?? ""} ${lead.phone}`.trim()),
    הסבר:
      "לידים שנכנסו בלי שם קמפיין. הפעלה תמשוך את השמות מפייסבוק - אבל רק אם חשבון המודעות כבר משויך לטוקן של העמוד.",
  });
}

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.FB_PAGE_TOKEN?.trim();

  if (!token) {
    return NextResponse.json(
      { error: "אין טוקן עמוד מוגדר בשרת" },
      { status: 400 }
    );
  }

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const rows = await pending(Math.min(Math.max(limit, 1), 500));

  let filled = 0;
  let stillMissing = 0;
  let firstError = "";

  for (const lead of rows) {
    const fields = fieldsOf(lead.extra);
    const leadgenId = text(fields, "fb_leadid");

    const response = await fetch(
      `${GRAPH}/${leadgenId}?fields=campaign_name,adset_name,ad_name&access_token=${encodeURIComponent(
        token
      )}`,
      { cache: "no-store" }
    ).catch(() => null);

    if (!response) {
      stillMissing++;
      continue;
    }

    const body = await response.text().catch(() => "");

    if (!response.ok) {
      stillMissing++;
      if (!firstError) {
        try {
          const parsed = JSON.parse(body) as { error?: { message?: string } };
          firstError = (parsed.error?.message ?? body).slice(0, 300);
        } catch {
          firstError = body.slice(0, 300);
        }
      }
      continue;
    }

    const got = JSON.parse(body) as {
      campaign_name?: string;
      adset_name?: string;
      ad_name?: string;
    };

    if (!got.campaign_name && !got.ad_name && !got.adset_name) {
      stillMissing++;
      continue;
    }

    const merged: Fields = { ...fields };
    if (got.campaign_name) merged.fb_campaign = got.campaign_name;
    if (got.adset_name) merged.fb_adset = got.adset_name;
    if (got.ad_name) merged.fb_ad = got.ad_name;

    /** ההסבר כבר לא נכון אחרי שהשמות הושלמו */
    delete merged.fb_names_missing;
    delete merged.fb_names_error;

    await db.lead
      .update({
        where: { id: lead.id },
        data: { extra: merged as Prisma.InputJsonObject },
      })
      .catch(() => null);

    filled++;
  }

  return NextResponse.json({
    הושלמו: filled,
    עדיין_חסרים: stillMissing,
    שגיאה: firstError || null,
    מסקנה:
      filled > 0
        ? `הושלמו שמות ל-${filled} לידים.`
        : stillMissing > 0
          ? "אף שם לא הושלם. סימן שחשבון המודעות עדיין לא משויך לטוקן של העמוד - Meta Business Settings → משתמש מערכת → הוספת נכסים → חשבון המודעות, עם הרשאת קריאה."
          : "אין לידים שמחכים להשלמה.",
  });
}
