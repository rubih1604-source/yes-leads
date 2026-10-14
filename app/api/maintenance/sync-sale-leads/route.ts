import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { SALE_ORIGIN } from "@/lib/sales-campaigns";
import {
  buildLookup,
  identifiersOf,
  planEntries,
} from "@/lib/campaign-match";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  מחזיר כל ליד של קונה לערוץ שלו
 * ============================================================
 *
 *  סורק את **כל** הלידים, לא רק את האחרונים, ומחזיר למכירה
 *  כל מה ששייך לקמפיין מכירה רשום.
 *
 *  הזיהוי נעשה לפי שם **וגם** לפי מזהים (טופס, קמפיין,
 *  מודעה). זה מה שמאפשר לתפוס גם לידים שנכנסו בלי שם
 *  קמפיין - בדיוק אלה שנפלו לרשימה האישית.
 *
 *  שתי מגבלות שנשמרות בקנאות:
 *
 *  1. **לא נוצרות כניסות חדשות.** הכניסה הקיימת רק מקבלת
 *     את החותמת הנכונה. יצירת כניסה כאן היא מה שגרם בעבר
 *     להגעה אחת להיספר כשתיים ("כפול 2").
 *
 *  2. **ליד שיש לו כניסה אחת אצלך נשאר שלך.** הוא ליד רגיל
 *     אצלך וליד רגיל אצל הקונה במקביל. רק ליד שכל כניסותיו
 *     הן מכירה עובר לבעלות הקונה.
 *
 *  GET  - תצוגה מקדימה
 *  POST - ביצוע
 */

type Change = {
  leadId: string;
  name: string;
  /** לפי מה זוהה: מזהה טופס, מודעה, או שם הקמפיין */
  matchedOn: string;
  campaign: string;
  /** כמה כניסות יקבלו חותמת מכירה */
  stamping: number;
  /** האם הבעלות עוברת לקונה, או שהליד נשאר גם שלך */
  ownership: "עובר לקונה" | "נשאר גם אצלך";

  /** מה בדיוק ייעשה - נקבע כאן פעם אחת, ולא מחושב מחדש בביצוע */
  steps: {
    stamp: Array<{ entryId: string; price: number }>;
    origin: string;
  };
};

async function plan(): Promise<{ campaigns: number; changes: Change[] }> {
  const campaigns = await db.salesCampaign
    .findMany({ where: { active: true } })
    .catch(() => []);

  if (campaigns.length === 0) return { campaigns: 0, changes: [] };

  const lookup = buildLookup(
    campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      pricePerLead: Number(c.pricePerLead ?? 0),
      matchKeys: c.matchKeys ?? [],
    }))
  );

  /**
   * לידים שנוצרו מהודעת וואטסאפ אינם לידים של קמפיין
   * ולא נוגעים בהם.
   */
  const leads = await db.lead
    .findMany({
      where: { origin: { not: "whatsapp" } },
      select: {
        id: true,
        origin: true,
        extra: true,
        firstName: true,
        lastName: true,
        phone: true,
        entries: { select: { id: true, campaign: true, isSale: true, price: true } },
      },
    })
    .catch(() => []);

  const changes: Change[] = [];

  for (const lead of leads) {
    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, unknown>)
        : null;

    const leadIds = identifiersOf(extra);

    /**
     * אותה פונקציה שהמנוע משתמש בה - כולל כלל הזהירות
     * שמונע חתימת מכירה על כניסה ותיקה שלך.
     */
    const plan = planEntries(lead.entries, leadIds, lookup);
    const { stamp: toStamp, hit, mineLeft } = plan;

    if (!hit) continue;

    const shouldBe = mineLeft === 0 ? SALE_ORIGIN : "leadmanager";

    if (toStamp.length === 0 && lead.origin === shouldBe) continue;

    changes.push({
      leadId: lead.id,
      name:
        `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.phone,
      matchedOn: hit.matchedOn,
      campaign: hit.name,
      stamping: toStamp.length,
      ownership: shouldBe === SALE_ORIGIN ? "עובר לקונה" : "נשאר גם אצלך",
      steps: {
        stamp: toStamp.map((e) => ({ entryId: e.id, price: e.price })),
        origin: shouldBe,
      },
    });
  }

  return { campaigns: campaigns.length, changes };
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { campaigns, changes } = await plan();

  return NextResponse.json({
    ok: true,
    קמפייני_מכירה: campaigns,
    לידים_לתיקון: changes.length,
    עוברים_לקונה: changes.filter((c) => c.ownership === "עובר לקונה").length,
    נשארים_גם_אצלך: changes.filter((c) => c.ownership === "נשאר גם אצלך").length,
    changes: changes
      .slice(0, 200)
      .map(({ steps, ...rest }) => rest),
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { campaigns, changes } = await plan();

  if (campaigns === 0) {
    return NextResponse.json(
      { error: "לא רשומים קמפיינים של מכירה" },
      { status: 400 }
    );
  }

  let stamped = 0;
  let moved = 0;
  let cancelled = 0;

  for (const change of changes) {
    /**
     * חותמים על הכניסות הקיימות. לא נוצרת שום כניסה חדשה,
     * ולכן מספר ההגעות של הליד לא משתנה.
     */
    for (const entry of change.steps.stamp) {
      const done = await db.leadEntry
        .update({
          where: { id: entry.entryId },
          data: { isSale: true, price: entry.price },
        })
        .catch(() => null);

      if (done) stamped++;
    }

    const current = await db.lead
      .findUnique({ where: { id: change.leadId }, select: { origin: true } })
      .catch(() => null);

    if (current && current.origin !== change.steps.origin) {
      await db.lead
        .update({
          where: { id: change.leadId },
          data: { origin: change.steps.origin },
        })
        .catch(() => null);
      moved++;
    }

    /**
     * ליד שעבר לבעלות הקונה לא מקבל ממך הודעות.
     * ליד שנשאר גם שלך כן - ולכן המשימות שלו נשארות.
     */
    if (change.steps.origin === SALE_ORIGIN) {
      const res = await db.scheduledJob
        .updateMany({
          where: { leadId: change.leadId, state: "pending" },
          data: { state: "cancelled", lastError: "ליד מכירה - הועבר" },
        })
        .catch(() => ({ count: 0 }));

      cancelled += res.count;
    }
  }

  return NextResponse.json({
    ok: true,
    כניסות_שסומנו: stamped,
    לידים_שעברו_לקונה: moved,
    משימות_שבוטלו: cancelled,
  });
}
