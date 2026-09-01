import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { runCampaignChecks } from "@/lib/campaign-monitor";

export const dynamic = "force-dynamic";

/**
 * קובע יעד לקמפיין, או ברירת מחדל לכולם.
 * campaignName ריק = הכלל חל על כל קמפיין שאין לו כלל משלו.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  if (body.runNow === true) {
    const results = await runCampaignChecks();

    // אותם באנרים שהמנוע יוצר, כדי שהבדיקה הידנית תיראה זהה
    for (const c of results) {
      await db.notice
        .updateMany({
          where: { campaignName: c.name, dismissedAt: null },
          data: { dismissedAt: new Date() },
        })
        .catch(() => null);

      await db.notice
        .create({
          data: {
            kind: "campaign",
            level: c.passed ? "good" : "bad",
            campaignName: c.name,
            title: c.passed
              ? `${c.name} עומד על ${c.percent}% מכירה, מעל היעד של ${c.target}%`
              : `${c.name} עומד על ${c.percent}% מכירה, מתחת ליעד של ${c.target}%`,
            body: `${c.closes} סגירות מתוך ${c.leads} לידים · הקמפיין רץ ${c.ageDays} ימים`,
          },
        })
        .catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      checked: results.length,
      failing: results.filter((c) => !c.passed).length,
    });
  }

  const name =
    typeof body.campaignName === "string" && body.campaignName.trim()
      ? body.campaignName.trim()
      : null;

  const target = Number(body.targetPercent);
  const grace = Number(body.graceDays);
  const recheck = Number(body.recheckDays);

  if (!Number.isFinite(target) || target < 0 || target > 100) {
    return NextResponse.json({ error: "אחוז לא תקין" }, { status: 400 });
  }
  if (!Number.isFinite(grace) || grace < 0 || grace > 365) {
    return NextResponse.json({ error: "ימי חסד לא תקינים" }, { status: 400 });
  }

  const data = {
    targetPercent: target,
    graceDays: Math.round(grace),
    recheckDays:
      Number.isFinite(recheck) && recheck >= 1 && recheck <= 365
        ? Math.round(recheck)
        : 7,
  };

  const existing = name
    ? await db.campaignRule.findUnique({ where: { campaignName: name } })
    : await db.campaignRule.findFirst({ where: { campaignName: null } });

  const rule = existing
    ? await db.campaignRule.update({ where: { id: existing.id }, data })
    : await db.campaignRule.create({ data: { ...data, campaignName: name } });

  return NextResponse.json({ ok: true, rule });
}
