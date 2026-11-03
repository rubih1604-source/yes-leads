import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  שחרור לידים שהבוט הושתק מולם בטעות
 * ============================================================
 *
 *  **הבעיה שזה פותר.**
 *
 *  הד של דיוור שיצא מהמערכת נקרא בטעות כ"רובי ענה
 *  ידנית", והבוט הושתק מול אותו ליד לשעות - בדיוק
 *  בחלון שבו הלקוחות עונים לדיוור.
 *
 *  הכשל עצמו תוקן, אבל ההשתקות שכבר נרשמו ממשיכות
 *  לחסום. הפעולה מסירה אותן.
 *
 *  **נוגעת רק בהשתקה.** הבוט המושתק ידנית (botMuted)
 *  נשאר מושתק, והסטטוס, ההיסטוריה והרשימה השחורה לא
 *  משתנים.
 */
async function paused() {
  return db.lead
    .findMany({
      where: { botPausedUntil: { gt: new Date() } },
      select: {
        id: true,
        phone: true,
        firstName: true,
        botPausedUntil: true,
      },
      orderBy: { botPausedUntil: "desc" },
      take: 1000,
    })
    .catch(() => []);
}

/** קוראת בלבד */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await paused();

  return NextResponse.json({
    כמה: rows.length,
    מי: rows.map(
      (r) =>
        `${r.firstName ?? ""} ${displayPhone(r.phone)} · מושתק עד ${r.botPausedUntil?.toLocaleString(
          "he-IL",
          { timeZone: "Asia/Jerusalem" }
        )}`.trim()
    ),
    מסקנה:
      rows.length === 0
        ? "אין אף ליד שהבוט מושתק מולו."
        : `הבוט מושתק מול ${rows.length} לידים. שחרור יחזיר אותו לפעולה מולם מיד.`,
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await db.lead
    .updateMany({
      where: { botPausedUntil: { gt: new Date() } },
      data: { botPausedUntil: null },
    })
    .catch(() => null);

  return NextResponse.json({
    ok: true,
    שוחררו: result?.count ?? 0,
    מסקנה: `${result?.count ?? 0} לידים שוחררו. הבוט יענה להם מעכשיו.`,
  });
}
