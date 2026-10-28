import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { doors, DOOR_FACEBOOK, DOOR_LEADMANAGER } from "@/lib/via";
import { displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  האם אפשר לכבות את ליד מנגר
 * ============================================================
 *
 *  קוראת בלבד. אין לה POST בכוונה.
 *
 *  **זו ההחלטה היקרה ביותר שאפשר לקחת על ניחוש.** אם החיבור
 *  הישיר מפספס ליד אחד בחודש, כיבוי ליד מנגר עולה לך את
 *  הליד הזה לנצח - ולא תדע שהוא היה קיים.
 *
 *  לכן במקום להעריך, סופרים: כל כניסה נושאת את הדלתות
 *  שהביאו אותה. המספר שקובע הוא **כמה כניסות הגיעו מליד
 *  מנגר בלבד** - אלה בדיוק מה שתאבד.
 */
export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const days = Math.min(
    120,
    Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 30))
  );

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const entries = await db.leadEntry
    .findMany({
      where: { at: { gte: from } },
      orderBy: { at: "desc" },
      select: {
        at: true,
        via: true,
        campaign: true,
        isSale: true,
        lead: { select: { phone: true, firstName: true, lastName: true } },
      },
      take: 5000,
    })
    .catch(() => []);

  let bothDoors = 0;
  let facebookOnly = 0;
  let leadmanagerOnly = 0;
  let noDoor = 0;

  /** אלה שהיו נעלמים - הרשימה שבאמת מכריעה */
  const wouldBeLost: Array<Record<string, string>> = [];

  for (const entry of entries) {
    const list = doors(entry.via);
    const fb = list.includes(DOOR_FACEBOOK);
    const lm = list.includes(DOOR_LEADMANAGER);

    if (fb && lm) bothDoors++;
    else if (fb) facebookOnly++;
    else if (lm) {
      leadmanagerOnly++;

      if (wouldBeLost.length < 50) {
        const name =
          `${entry.lead?.firstName ?? ""} ${entry.lead?.lastName ?? ""}`.trim();

        wouldBeLost.push({
          מי: name || displayPhone(entry.lead?.phone ?? ""),
          טלפון: displayPhone(entry.lead?.phone ?? ""),
          מתי: entry.at.toLocaleString("he-IL", {
            timeZone: "Asia/Jerusalem",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
          קמפיין: entry.campaign ?? "—",
        });
      }
    } else noDoor++;
  }

  const total = entries.length;

  /**
   * המסקנה נאמרת במפורש ולא מושארת לפרשנות.
   *
   * "0 כניסות מליד מנגר בלבד" פירושו שהחיבור הישיר הביא
   * הכל - וזה התנאי היחיד שבו כיבוי בטוח.
   */
  const verdict =
    total === 0
      ? "אין כניסות בטווח הזה. הרחב את מספר הימים."
      : leadmanagerOnly === 0
        ? `בטוח לכבות: כל ${total} הכניסות ב-${days} הימים האחרונים הגיעו גם מהחיבור הישיר. ליד מנגר לא הביא אף ליד שהחיבור הישיר פספס.`
        : `אל תכבה עדיין: ${leadmanagerOnly} כניסות הגיעו **רק** מליד מנגר ב-${days} הימים האחרונים. אלה הלידים שהיית מאבד.`;

  return NextResponse.json({
    פעולה: "קריאה בלבד - לא שונה כלום",
    טווח: `${days} ימים אחרונים`,
    סהכ_כניסות: total,
    משתי_הדלתות: bothDoors,
    רק_מהחיבור_הישיר: facebookOnly,
    רק_מליד_מנגר: leadmanagerOnly,
    בלי_סימון_דלת: noDoor,
    מסקנה: verdict,
    מה_היית_מאבד: wouldBeLost,
    הערה:
      noDoor > 0
        ? `${noDoor} כניסות נרשמו לפני שסימון הדלת היה קיים, ולכן אינן נספרות לכאן ולא לכאן.`
        : undefined,
  });
}
