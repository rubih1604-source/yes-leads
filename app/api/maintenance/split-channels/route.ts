import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizeName } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  ניקוי הכניסות הכפולות שנוצרו בעבר
 * ============================================================
 *
 *  מה קרה עד היום:
 *
 *    1. הוובוק רשם כניסה **בלי** לסמן שהיא של המכירה.
 *    2. תהליך הסנכרון ראה כניסה לא מסומנת, והוסיף כניסה
 *       **שנייה** כדי לסמן שזו מכירה.
 *
 *  התוצאה: הגעה אחת של אלעד נשמרה כשתי כניסות. לכן ליד
 *  שנכנס אצלו פעם אחת הופיע אצלך עם התווית "כפול 2".
 *
 *  מה עושים כאן:
 *
 *    - הכניסה המקורית מקבלת את החותמת הנכונה (מכירה).
 *    - העותק שהסנכרון יצר נמחק.
 *    - הבעלות מיושרת: ליד שיש לו כניסה בערוץ שלך נשאר
 *      שלך, גם אם הוא קיים גם אצל אלעד.
 *
 *  GET  = תצוגה מקדימה בלבד. לא משנה כלום.
 *  POST = מבצע.
 *
 *  הכניסות **אינן נמחקות בכמות**: לכל קמפיין נשמר בדיוק
 *  מספר ההגעות האמיתי, כפי שהוובוק רשם אותן. ההכנסה לא
 *  משתנה - היא פשוט מפסיקה להיספר פעמיים.
 */

type Plan = {
  leads: number;
  entriesStamped: number;
  entriesRemoved: number;
  ownershipFixed: number;
  examples: Array<{
    name: string;
    phone: string;
    campaign: string;
    was: string;
    becomes: string;
  }>;
};

async function build(): Promise<{
  plan: Plan;
  apply: Array<() => Promise<unknown>>;
}> {
  const campaigns = await db.salesCampaign
    .findMany({ select: { name: true, pricePerLead: true } })
    .catch(() => []);

  const priceByKey = new Map<string, number>(
    campaigns.map((c) => [normalizeName(c.name), Number(c.pricePerLead ?? 0)])
  );

  const leads = await db.lead.findMany({
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      origin: true,
      entries: {
        select: { id: true, campaign: true, isSale: true, at: true },
        orderBy: { at: "asc" },
      },
    },
  });

  const plan: Plan = {
    leads: 0,
    entriesStamped: 0,
    entriesRemoved: 0,
    ownershipFixed: 0,
    examples: [],
  };

  const apply: Array<() => Promise<unknown>> = [];

  for (const lead of leads) {
    if (lead.entries.length === 0) continue;

    // הכניסות מקובצות לפי קמפיין
    const byCampaign = new Map<string, typeof lead.entries>();
    for (const e of lead.entries) {
      if (!e.campaign) continue;
      const k = normalizeName(e.campaign);
      const list = byCampaign.get(k) ?? [];
      list.push(e);
      byCampaign.set(k, list);
    }

    let touched = false;

    for (const [k, group] of byCampaign) {
      const price = priceByKey.get(k);
      if (price === undefined) continue; // קמפיין שלך - לא נוגעים

      const unstamped = group.filter((e) => !e.isSale);
      const stamped = group.filter((e) => e.isSale);

      /**
       * אם אין אף כניסה לא-מסומנת, הנתונים כבר תקינים
       * (נרשמו אחרי התיקון) - ואין מה לעשות.
       */
      if (unstamped.length === 0) continue;

      /**
       * מספר ההגעות האמיתי הוא מספר הכניסות שהוובוק רשם,
       * כלומר הלא-מסומנות. הן מקבלות חותמת.
       */
      for (const e of unstamped) {
        apply.push(() =>
          db.leadEntry
            .update({
              where: { id: e.id },
              data: { isSale: true, price },
            })
            .catch(() => null)
        );
      }
      plan.entriesStamped += unstamped.length;

      /**
       * המסומנות שכבר היו כאן הן העותקים שהסנכרון יצר
       * לאותן הגעות. הן נמחקות.
       */
      for (const e of stamped) {
        apply.push(() =>
          db.leadEntry.delete({ where: { id: e.id } }).catch(() => null)
        );
      }
      plan.entriesRemoved += stamped.length;

      touched = true;

      if (plan.examples.length < 25) {
        plan.examples.push({
          name:
            `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "ללא שם",
          phone: lead.phone,
          campaign: group[0]?.campaign ?? k,
          was: `${group.length} כניסות רשומות`,
          becomes: `${unstamped.length} כניסות מכירה`,
        });
      }
    }

    /**
     * בעלות: ליד שיש לו ולו כניסה אחת בערוץ שלך נשאר שלך.
     * רק ליד שכל כניסותיו הן מכירה שייך למכירה בלבד.
     */
    const mineAfter = lead.entries.filter((e) => {
      if (!e.campaign) return !e.isSale;
      return priceByKey.get(normalizeName(e.campaign)) === undefined;
    }).length;

    const shouldBe = mineAfter === 0 ? "sale" : "leadmanager";

    if (lead.origin !== shouldBe && lead.origin !== "whatsapp") {
      apply.push(() =>
        db.lead
          .update({ where: { id: lead.id }, data: { origin: shouldBe } })
          .catch(() => null)
      );
      plan.ownershipFixed++;
      touched = true;
    }

    if (touched) plan.leads++;
  }

  return { plan, apply };
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { plan } = await build();

  return NextResponse.json({
    ok: true,
    mode: "תצוגה מקדימה - לא בוצע שום שינוי",
    ...plan,
    howToApply: "כדי לבצע בפועל צריך לשלוח POST לאותה כתובת",
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { plan, apply } = await build();

  for (const step of apply) {
    await step();
  }

  return NextResponse.json({
    ok: true,
    mode: "בוצע",
    ...plan,
  });
}
