import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { cameFromFacebook } from "@/lib/via";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  האם החיבור הישיר לפייסבוק חי
 * ============================================================
 *
 *  מסך אחד שעונה על השאלה בזמן שליד מנגר מכובה: האם פייסבוק
 *  פנתה אלינו, האם הליד נקלט, ומאיזו דלת.
 *
 *  הכל נקרא מהנתונים עצמם - אין כאן ניחוש ואין "אמור להיות
 *  בסדר".
 */

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [fbLogs, lmLogs, recentEntries, forms, lastDelivery] =
    await Promise.all([
      db.webhookLog
        .findMany({
          where: { source: "facebook" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { createdAt: true, processed: true, error: true },
        })
        .catch(() => []),
      db.webhookLog
        .count({
          where: { source: { not: "facebook" }, createdAt: { gte: dayAgo } },
        })
        .catch(() => 0),
      db.leadEntry
        .findMany({
          where: { at: { gte: dayAgo } },
          orderBy: { at: "desc" },
          take: 30,
          select: {
            at: true,
            via: true,
            isSale: true,
            campaign: true,
            lead: { select: { firstName: true, phone: true } },
          },
        })
        .catch(() => []),
      db.leadForm
        .findMany({ select: { formName: true, channel: true, supplierKey: true } })
        .catch(() => []),
      db.leadDelivery
        .findFirst({
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            state: true,
            httpStatus: true,
            error: true,
            buyer: { select: { name: true } },
          },
        })
        .catch(() => null),
    ]);

  const fbEntries = recentEntries.filter((e) => cameFromFacebook(e.via));

  const when = (d: Date | null | undefined) =>
    d
      ? d.toLocaleString("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  /**
   * המשפט שאומר מה המצב, כדי שלא תצטרך לפרש מספרים.
   */
  let verdict: string;

  if (fbLogs.length === 0) {
    verdict =
      "פייסבוק לא פנתה אלינו אף פעם. הבעיה היא בחיבור עצמו, לא בקליטה.";
  } else if (fbEntries.length > 0) {
    verdict = `החיבור הישיר עובד — ${fbEntries.length} הגעות ב-24 השעות האחרונות הגיעו ישירות מפייסבוק.`;
  } else if (fbLogs.some((l) => l.error)) {
    verdict =
      "פייסבוק פנתה אלינו אבל הפנייה נדחתה. ראה את השגיאה למטה.";
  } else {
    verdict =
      "פייסבוק פנתה אלינו בעבר, אבל ב-24 השעות האחרונות לא נקלט ליד דרך הדלת הישירה.";
  }

  return NextResponse.json({
    מצב: verdict,

    פייסבוק: {
      פניות_שנרשמו: fbLogs.length,
      הפנייה_האחרונה: when(fbLogs[0]?.createdAt),
      שגיאה_אחרונה: fbLogs.find((l) => l.error)?.error ?? null,
    },

    הגעות_24_שעות: {
      סך_הכל: recentEntries.length,
      ישירות_מפייסבוק: fbEntries.length,
      מליד_מנגר: recentEntries.length - fbEntries.length,
      פניות_מליד_מנגר_ביומן: lmLogs,
    },

    ההגעות_האחרונות: recentEntries.slice(0, 10).map((e) => ({
      מתי: when(e.at),
      דלת: e.via ?? "לא מסומן",
      ערוץ: e.isSale ? "מכירה" : "שלך",
      קמפיין: e.campaign,
      ליד: e.lead.firstName || e.lead.phone,
    })),

    טפסים_מוגדרים: forms.map((f) => ({
      טופס: f.formName,
      ערוץ: f.channel === "sale" ? "מכירה" : "שלך",
      שאלת_ספק: f.supplierKey ? "נבחרה" : "זיהוי אוטומטי",
    })),

    השליחה_האחרונה_לקונה: lastDelivery
      ? {
          קונה: lastDelivery.buyer.name,
          מתי: when(lastDelivery.createdAt),
          מצב: lastDelivery.state,
          קוד: lastDelivery.httpStatus,
          שגיאה: lastDelivery.error,
        }
      : "עוד לא נשלח כלום",
  });
}
