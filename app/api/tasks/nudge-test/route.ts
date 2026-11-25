import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { nudgeAt, NUDGES } from "@/lib/pre-call";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  בדיקה של הדחיפה שלפני השיחה
 * ============================================================
 *
 *  **למה זה קיים.** הדחיפה יוצאת 15-30 דקות לפני תזכורת,
 *  ולכן הדרך היחידה לוודא שהיא מגיעה לנייד הייתה לקבוע
 *  תזכורת ולחכות. אם משהו לא מוגדר - התראות נייד שלא
 *  אושרו, מכשיר שלא נרשם - היית מגלה את זה בדיוק כשהיית
 *  צריך אותה.
 *
 *  **זו לא הדמיה.** היא עוברת באותו מסלול בדיוק: אותה
 *  שליחה לנייד ואותו באנר. בדיקה שמדמה משהו אחר לא מוכיחה
 *  שהדבר האמיתי עובד.
 *
 *  לא יוצרת משימה ולא נוגעת בתזכורות קיימות.
 */
export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const row = await db.settings
    .findUnique({ where: { id: "main" }, select: { nudgeCursor: true } })
    .catch(() => null);

  const text = nudgeAt(row?.nudgeCursor ?? 0);
  const title = "⏰ עוד 20 דק׳ — בדיקה";

  /**
   * המונה לא מתקדם.
   *
   * בדיקה ששורפת שורה מהבנק הייתה גורמת לשורה הבאה לדלג
   * על לקוח אמיתי - והבנק הוא בדיוק מה שאמור להתחלף
   * בשווה.
   */
  const notice = await db.notice
    .create({
      data: {
        kind: "task",
        level: "bad",
        title,
        body: text,
        campaignName: null,
      },
    })
    .catch(() => null);

  const { sendPush, pushConfigured } = await import("@/lib/push");

  if (!pushConfigured()) {
    return NextResponse.json({
      ok: true,
      push: 0,
      banner: Boolean(notice),
      text,
      הערה:
        "התראות נייד לא מוגדרות בשרת (חסרים מפתחות VAPID). הבאנר במערכת כן נוצר.",
    });
  }

  const push = await sendPush({
    title,
    body: text,
    url: "/tasks",
    urgent: true,
    tag: "pre-test",
  }).catch(() => 0);

  return NextResponse.json({
    ok: true,
    push,
    banner: Boolean(notice),
    text,
    בבנק: NUDGES.length,
  });
}
