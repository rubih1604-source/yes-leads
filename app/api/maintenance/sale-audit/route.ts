import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveRange } from "@/lib/periods";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  ביקורת על מכירת לידים
 * ============================================================
 *
 *  קוראת בלבד. לא משנה כלום. אין לה POST בכוונה.
 *
 *  עונה על שאלה אחת: **למה המספר במסך הוא מה שהוא.**
 *
 *  כשספרת 64 לידים בליד מנגר והמסך הראה 60, לא הייתה שום
 *  דרך לדעת מי החסרים. הפעולה הזו מפרקת את הסכום לגורמים
 *  ומראה בדיוק אילו כניסות נספרות, אילו לא, ולמה.
 */
export async function GET() {
  /**
   * אותו טווח בדיוק שהמסך משתמש בו.
   *
   * חישוב טווח נפרד כאן היה הדרך הבטוחה לקבל מספר שלישי
   * שלא תואם לא את המסך ולא את ליד מנגר, ולסבך את הבירור
   * במקום לפתור אותו.
   */
  const range = resolveRange("this_month");
  const from = range.from;
  const to = range.to;

  const [entries, channels, campaigns] = await Promise.all([
    db.leadEntry
      .findMany({
        where: { isSale: true },
        select: {
          id: true,
          at: true,
          price: true,
          campaign: true,
          channelId: true,
          billable: true,
          leadId: true,
        },
      })
      .catch(() => []),
    db.channel
      .findMany({ select: { id: true, name: true, pricePerLead: true } })
      .catch(() => []),
    db.salesCampaign
      .findMany({ select: { name: true, pricePerLead: true } })
      .catch(() => []),
  ]);

  const channelById = new Map(channels.map((c) => [c.id, c]));

  const inMonth = entries.filter((e) => e.at >= from && e.at < to);

  // ---- פירוק לפי מקור השיוך ----
  const byChannel = inMonth.filter((e) => e.channelId);
  const byCampaignName = inMonth.filter((e) => !e.channelId && e.campaign);
  const noLabel = inMonth.filter((e) => !e.channelId && !e.campaign);

  // ---- מחירים ----
  const atZero = inMonth.filter((e) => Number(e.price ?? 0) === 0);
  const notBillable = inMonth.filter((e) => e.billable === false);

  const revenue = inMonth
    .filter((e) => e.billable !== false)
    .reduce((s, e) => s + Number(e.price ?? 0), 0);

  // ---- לידים ייחודיים מול כניסות ----
  const uniqueLeads = new Set(inMonth.map((e) => e.leadId)).size;

  // ---- פירוט לפי ערוץ ----
  const perChannel = channels
    .map((c) => {
      const mine = inMonth.filter((e) => e.channelId === c.id);
      return {
        ערוץ: c.name,
        "מחיר מוגדר בערוץ": Number(c.pricePerLead ?? 0),
        כניסות: mine.length,
        "מתוכן ב-0 ₪": mine.filter((e) => Number(e.price ?? 0) === 0).length,
        הכנסה: mine
          .filter((e) => e.billable !== false)
          .reduce((s, e) => s + Number(e.price ?? 0), 0),
      };
    })
    .filter((r) => r.כניסות > 0);

  // ---- שמות קמפיין שאינם ערוץ ולא קמפיין רשום ----
  const known = new Set(campaigns.map((c) => c.name.trim().toLowerCase()));
  const orphanNames = new Map<string, number>();

  for (const e of byCampaignName) {
    const name = (e.campaign ?? "").trim();
    if (!name || known.has(name.toLowerCase())) continue;
    orphanNames.set(name, (orphanNames.get(name) ?? 0) + 1);
  }

  return NextResponse.json({
    פעולה: "ביקורת בלבד — לא שונה כלום",
    חודש: range.label,

    "סך הכל": {
      "כניסות מכירה אי פעם": entries.length,
      "כניסות בחודש הזה": inMonth.length,
      "לידים ייחודיים בחודש": uniqueLeads,
      "הכנסה מחושבת": revenue,
    },

    "איך הכניסות משויכות": {
      "לפי ערוץ": byChannel.length,
      "לפי שם קמפיין בלבד": byCampaignName.length,
      "בלי שום שיוך": noLabel.length,
    },

    מחירים: {
      "כניסות שנחתמו ב-0 ₪": atZero.length,
      "כניסות שסומנו לא לחיוב": notBillable.length,
      "הכנסה חסרה בגלל 0 ₪": atZero
        .map((e) => {
          const c = e.channelId ? channelById.get(e.channelId) : null;
          return Number(c?.pricePerLead ?? 0);
        })
        .reduce((s, n) => s + n, 0),
    },

    "לפי ערוץ": perChannel,

    "שמות קמפיין שאינם רשומים": Array.from(orphanNames.entries())
      .map(([name, count]) => ({ שם: name, כניסות: count }))
      .sort((a, b) => b.כניסות - a.כניסות),

    הסבר:
      "אם 'כניסות בחודש הזה' קטן ממה שספרת בליד מנגר, הלידים החסרים לא נרשמו ככניסות מכירה כלל — הם לא סווגו לערוץ ולא לקמפיין מכירה. אם הוא תואם אבל ההכנסה נמוכה, הסיבה היא כניסות שנחתמו ב-0 ₪.",
  });
}
