import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizeName } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  חישוב מחדש של הכניסות
 * ============================================================
 *
 *  **הבאג שהיה כאן, וחייב לא לחזור.**
 *
 *  הפעולה הזו נכתבה כשהסיווג היחיד היה "קמפיין רשום". היא
 *  עברה על כל הכניסות, ו**כל כניסה שסומנה כמכירה אבל שם
 *  הקמפיין שלה לא הופיע ברשימת הקמפיינים - בוטלה**, והמחיר
 *  שלה אופס.
 *
 *  כשנוספו ערוצים, לידים התחילו להגיע דרך ערוץ ובלי שם
 *  קמפיין רשום. הפעולה לא ידעה מה זה ערוץ, ולכן לחיצה אחת
 *  על "חשב הכל מחדש" **מחקה מהמכירה את כל הלידים החדשים**
 *  ואיפסה להם את המחיר. זה קרה בשקט, בלי אזהרה ובלי תצוגה
 *  מקדימה.
 *
 *  שלושה כללים שמונעים את זה מעכשיו:
 *
 *   1. **כניסה ששייכת לערוץ - הערוץ קובע, לא הקמפיין.**
 *      כניסה בערוץ מכירה לעולם לא מבוטלת כאן.
 *
 *   2. **מחיר שנחתם לא נדרס.** מחיר מושלם רק כשהוא 0.
 *      שינוי מחיר בערוץ לא משכתב למפרע חיובים שנסגרו.
 *
 *   3. **יש תצוגה מקדימה.** GET מראה מה ישתנה בלי לגעת,
 *      ו-POST מבצע. פעולה שמבטלת מכירות בלחיצה אחת בלי
 *      להראות מה היא עומדת לעשות היא מלכודת.
 */

type Plan = {
  toMark: number;
  toUnmark: number;
  toReprice: number;
  protectedByChannel: number;
  unmarkSamples: Array<{ id: string; campaign: string | null }>;
};

async function build(): Promise<Plan & { apply: Array<() => Promise<void>> }> {
  const [campaigns, channels, entries] = await Promise.all([
    db.salesCampaign.findMany({ where: { active: true } }),
    db.channel.findMany({
      select: { id: true, isSale: true, pricePerLead: true },
    }),
    db.leadEntry.findMany({
      select: {
        id: true,
        campaign: true,
        isSale: true,
        price: true,
        channelId: true,
      },
    }),
  ]);

  const priceByName = new Map<string, number>(
    campaigns.map((c) => [normalizeName(c.name), Number(c.pricePerLead ?? 0)])
  );

  const channelById = new Map(channels.map((c) => [c.id, c]));

  const plan: Plan = {
    toMark: 0,
    toUnmark: 0,
    toReprice: 0,
    protectedByChannel: 0,
    unmarkSamples: [],
  };

  const apply: Array<() => Promise<void>> = [];

  for (const entry of entries) {
    const channel = entry.channelId ? channelById.get(entry.channelId) : null;

    /**
     * כלל 1: כניסה בערוץ מכירה - הערוץ קובע.
     *
     * היא לא מבוטלת כאן בשום מקרה, גם אם אין לה שם קמפיין
     * ואין קמפיין רשום שמתאים לה.
     */
    if (channel?.isSale) {
      plan.protectedByChannel++;

      const channelPrice = Number(channel.pricePerLead ?? 0);
      const current = Number(entry.price ?? 0);

      // כלל 2: משלימים מחיר רק כשהוא 0
      const needsPrice = current === 0 && channelPrice > 0;

      if (!entry.isSale || needsPrice) {
        if (!entry.isSale) plan.toMark++;
        else plan.toReprice++;

        apply.push(async () => {
          await db.leadEntry
            .update({
              where: { id: entry.id },
              data: {
                isSale: true,
                ...(needsPrice ? { price: channelPrice } : {}),
              },
            })
            .catch(() => null);
        });
      }

      continue;
    }

    /**
     * כניסה בערוץ שאינו מכירה - גם היא לא נגעת כאן.
     * הערוץ הוא ההחלטה, ולא רשימת הקמפיינים.
     */
    if (channel) {
      plan.protectedByChannel++;
      continue;
    }

    // ---- מכאן: כניסות ללא ערוץ, ההתנהגות הוותיקה ----
    const key = entry.campaign ? normalizeName(entry.campaign) : null;
    const price = key ? priceByName.get(key) : undefined;
    const shouldBeSale = price !== undefined;

    if (shouldBeSale) {
      const priceChanged = Number(entry.price ?? 0) !== price;

      if (!entry.isSale || priceChanged) {
        if (!entry.isSale) plan.toMark++;
        else plan.toReprice++;

        apply.push(async () => {
          await db.leadEntry
            .update({ where: { id: entry.id }, data: { isSale: true, price } })
            .catch(() => null);
        });
      }
    } else if (entry.isSale) {
      plan.toUnmark++;

      if (plan.unmarkSamples.length < 15) {
        plan.unmarkSamples.push({ id: entry.id, campaign: entry.campaign });
      }

      apply.push(async () => {
        await db.leadEntry
          .update({ where: { id: entry.id }, data: { isSale: false, price: 0 } })
          .catch(() => null);
      });
    }
  }

  return { ...plan, apply };
}

/** תצוגה מקדימה - לא נוגע בכלום */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = await build();

  return NextResponse.json({
    פעולה: "תצוגה מקדימה — לא שונה כלום",
    "יסומנו כמכירה": plan.toMark,
    "יושלם להן מחיר": plan.toReprice,
    "יבוטלו מהמכירה": plan.toUnmark,
    "מוגנות כי הן בערוץ": plan.protectedByChannel,
    "דוגמאות למה שיבוטל": plan.unmarkSamples.map(
      (s) => s.campaign ?? "(בלי שם קמפיין)"
    ),
    אזהרה:
      plan.toUnmark > 0
        ? `${plan.toUnmark} כניסות יצאו מהמכירה והמחיר שלהן יתאפס. אם המספר הזה מפתיע אותך — אל תריץ, ותשלח לי את הפלט.`
        : "שום כניסה לא תצא מהמכירה.",
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = await build();

  for (const run of plan.apply) await run();

  return NextResponse.json({
    ok: true,
    פעולה: "בוצע",
    סומנו: plan.toMark,
    "הושלם מחיר": plan.toReprice,
    בוטלו: plan.toUnmark,
    "מוגנות כי הן בערוץ": plan.protectedByChannel,
  });
}
