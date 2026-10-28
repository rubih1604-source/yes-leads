import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { detectUnsubscribe } from "@/lib/unsubscribe";
import { addToBlacklist } from "@/lib/blacklist";
import { displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  סריקת ההיסטוריה אחרי בקשות הסרה
 * ============================================================
 *
 *  **למה זה נחוץ דווקא עכשיו.**
 *
 *  הזיהוי החדש רץ על הודעות שנכנסות מעכשיו. כל מי שכתב
 *  "הסר" בחודשים האחרונים יושב במסד עם הודעה נכנסת שאף
 *  אחד לא קרא ככה - והוא ימשיך לקבל דיוור.
 *
 *  הפעולה הזו עוברת על ההודעות הנכנסות שכבר נשמרו ומעבירה
 *  אותן דרך **אותו זיהוי בדיוק** שרץ בקליטה. לא כלל שני
 *  ולא רשימה שנייה - אותה פונקציה, אותה רשימה שחורה.
 *
 *  ל-GET יש תצוגה מקדימה מלאה, כי זו פעולה שמוציאה אנשים
 *  מהדיוור ואתה צריך לראות את מי לפני שהיא רצה.
 */

type Found = {
  leadId: string;
  name: string;
  phone: string;
  text: string;
  reason: string;
  at: Date;
};

async function scan(): Promise<Found[]> {
  const messages = await db.message
    .findMany({
      where: { direction: "in" },
      orderBy: { createdAt: "desc" },
      select: {
        bodyText: true,
        createdAt: true,
        lead: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            doNotContact: true,
          },
        },
      },
      take: 20000,
    })
    .catch(() => []);

  const found: Found[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    const lead = message.lead;

    if (!lead) continue;

    // כבר ברשימה - אין מה לעשות
    if (lead.doNotContact) continue;

    // ההודעה האחרונה שלו שמבקשת הסרה מספיקה
    if (seen.has(lead.id)) continue;

    const match = detectUnsubscribe(message.bodyText ?? "");
    if (!match.blacklist) continue;

    seen.add(lead.id);

    found.push({
      leadId: lead.id,
      name:
        `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
        displayPhone(lead.phone),
      phone: displayPhone(lead.phone),
      text: (message.bodyText ?? "").slice(0, 160),
      reason: match.reason ?? "ביקש להסיר",
      at: message.createdAt,
    });
  }

  return found;
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const found = await scan();

  return NextResponse.json({
    פעולה: "תצוגה מקדימה - לא שונה כלום",
    נמצאו: found.length,
    אנשים: found.map((f) => ({
      מי: f.name,
      טלפון: f.phone,
      כתב: f.text,
      סיבה: f.reason,
      מתי: f.at.toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }),
    })),
    הערה:
      found.length === 0
        ? "אף אחד בהיסטוריה לא ביקש להסיר בניסוח שהמערכת מזהה. מי שכבר ברשימה השחורה אינו נספר כאן."
        : "עבור על הרשימה. ההרצה תוסיף את כולם לרשימה השחורה, והם לא יקבלו דיוור יותר. אפשר להוציא מישהו ידנית אחר כך.",
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const found = await scan();

  let added = 0;

  for (const person of found) {
    const ok = await addToBlacklist({
      leadId: person.leadId,
      reason: person.reason,
      text: person.text,
    });

    if (ok) added++;
  }

  return NextResponse.json({
    פעולה: "בוצע",
    נוספו_לרשימה_השחורה: added,
    לא_נוספו: found.length - added,
    אנשים: found.slice(0, 50).map((f) => `${f.name} · ${f.reason}`),
  });
}
