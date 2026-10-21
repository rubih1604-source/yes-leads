import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  השלמת מחיר לכניסות של ערוץ
 * ============================================================
 *
 *  המחיר נחתם על הכניסה **ברגע שהליד נכנס**, לפי המחיר
 *  שהיה אז בערוץ. ערוץ שנוצר בלי מחיר חתם 0 על כל ליד
 *  שנכנס דרכו - וזה כסף אמיתי שנעלם מהדוחות.
 *
 *  הפעולה הזו משלימה את המחיר **רק לכניסות שנחתמו ב-0**.
 *  כניסה עם מחיר אחר לא נגעת בה: אולי הוא נקבע בכוונה,
 *  ודריסה שלו הייתה משנה היסטוריית חיוב בלי שתדע.
 *
 *  GET  = מראה מה ישתנה, לא נוגע בכלום
 *  POST = מבצע
 */

type Plan = {
  channelId: string;
  channelName: string;
  pricePerLead: number;
  entriesAtZero: number;
  totalToAdd: number;
};

async function plan(): Promise<{ plans: Plan[]; totalToAdd: number }> {
  const channels = await db.channel
    .findMany({
      where: { isSale: true },
      select: { id: true, name: true, pricePerLead: true },
    })
    .catch(() => []);

  const plans: Plan[] = [];

  for (const channel of channels) {
    const price = Number(channel.pricePerLead ?? 0);

    // ערוץ בלי מחיר - אין מה להשלים ממנו
    if (price <= 0) continue;

    const entriesAtZero = await db.leadEntry
      .count({
        where: { channelId: channel.id, isSale: true, price: 0 },
      })
      .catch(() => 0);

    if (entriesAtZero === 0) continue;

    plans.push({
      channelId: channel.id,
      channelName: channel.name,
      pricePerLead: price,
      entriesAtZero,
      totalToAdd: entriesAtZero * price,
    });
  }

  return {
    plans,
    totalToAdd: plans.reduce((sum, p) => sum + p.totalToAdd, 0),
  };
}

export async function GET() {
  const { plans, totalToAdd } = await plan();

  return NextResponse.json({
    פעולה: "תצוגה מקדימה - לא שונה כלום",
    ערוצים: plans.map((p) => ({
      ערוץ: p.channelName,
      "מחיר לליד": p.pricePerLead,
      "כניסות שנחתמו ב-0": p.entriesAtZero,
      "יתווסף להכנסות": p.totalToAdd,
    })),
    "סך הכל שיתווסף": totalToAdd,
    הערה:
      plans.length === 0
        ? "אין מה להשלים. או שאין ערוצי מכירה עם מחיר, או שכל הכניסות כבר נושאות מחיר."
        : "הרצה תעדכן רק כניסות שנחתמו ב-0. כניסה עם מחיר אחר לא תישתנה.",
  });
}

export async function POST() {
  const { plans } = await plan();

  let updated = 0;
  let added = 0;

  for (const p of plans) {
    const res = await db.leadEntry
      .updateMany({
        where: { channelId: p.channelId, isSale: true, price: 0 },
        data: { price: p.pricePerLead },
      })
      .catch(() => null);

    if (res) {
      updated += res.count;
      added += res.count * p.pricePerLead;
    }
  }

  return NextResponse.json({
    פעולה: "בוצע",
    "כניסות שעודכנו": updated,
    "סכום שנוסף להכנסות": added,
    ערוצים: plans.map((p) => `${p.channelName} · ${p.pricePerLead} ₪`),
  });
}
