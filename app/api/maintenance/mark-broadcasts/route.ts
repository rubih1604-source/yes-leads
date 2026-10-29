import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  סימון דיוור שיצא לפני שהסימון היה קיים
 * ============================================================
 *
 *  **הבעיה שזה פותר.**
 *
 *  דיוור מרשימת הלידים ודיוור מבצע יוצאים כתבנית רגילה.
 *  עד עדכון 152 שום דבר בהודעה לא העיד שהיא דיוור, ולכן
 *  הבוט לא מזהה את התגובות אליהן כתגובות לדיוור - ולא
 *  שואל את שאלת הסינון.
 *
 *  **למה לפי תבנית ולא לפי ניחוש.** אפשר היה לנסות לזהות
 *  דיוור לפי "הרבה הודעות זהות בזמן קצר". זה היה מסמן גם
 *  שליחות ידניות ומוציא אנשים לרשימה שלא שייכים לה. כאן
 *  אתה בוחר את התבנית ואת התאריך - אתה יודע מה שלחת.
 */

function params(request: Request) {
  const url = new URL(request.url);
  const template = (url.searchParams.get("template") ?? "").trim();
  const days = Math.min(
    365,
    Math.max(1, Number(url.searchParams.get("days") ?? 7))
  );

  return { template, days, from: new Date(Date.now() - days * 86400000) };
}

export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { template, days, from } = params(request);

  /**
   * בלי בחירת תבנית - מראים מה יש, כדי שתדע מה לבחור.
   */
  if (!template) {
    const recent = await db.message
      .findMany({
        where: {
          direction: "out",
          broadcast: false,
          templateName: { not: null },
          createdAt: { gte: from },
        },
        select: { templateName: true, createdAt: true },
        take: 5000,
      })
      .catch(() => []);

    const byTemplate = new Map<string, number>();
    for (const message of recent) {
      const name = message.templateName ?? "";
      byTemplate.set(name, (byTemplate.get(name) ?? 0) + 1);
    }

    return NextResponse.json({
      פעולה: "קריאה בלבד",
      טווח: `${days} ימים אחרונים`,
      הוראות:
        "בחר את התבנית ששלחת בדיוור והוסף אותה לכתובת: ?template=<שם התבנית>&days=<ימים>",
      תבניות_שנשלחו_ולא_מסומנות_כדיוור: [...byTemplate.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ תבנית: name, נשלחה: count })),
    });
  }

  const count = await db.message
    .count({
      where: {
        direction: "out",
        broadcast: false,
        templateName: template,
        createdAt: { gte: from },
      },
    })
    .catch(() => 0);

  return NextResponse.json({
    פעולה: "תצוגה מקדימה - לא שונה כלום",
    תבנית: template,
    טווח: `${days} ימים אחרונים`,
    יסומנו_כדיוור: count,
    הערה:
      count === 0
        ? "אין הודעות כאלה. בדוק את שם התבנית ואת מספר הימים."
        : "ההרצה תסמן אותן כדיוור. אז הבוט יזהה את התגובות אליהן ויישאל את שאלת הסינון.",
  });
}

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { template, days, from } = params(request);

  if (!template) {
    return NextResponse.json(
      { error: "צריך לבחור תבנית. הרץ 'הצג' כדי לראות את הרשימה." },
      { status: 400 }
    );
  }

  const result = await db.message
    .updateMany({
      where: {
        direction: "out",
        broadcast: false,
        templateName: template,
        createdAt: { gte: from },
      },
      data: { broadcast: true },
    })
    .catch(() => null);

  return NextResponse.json({
    פעולה: "בוצע",
    תבנית: template,
    טווח: `${days} ימים אחרונים`,
    סומנו_כדיוור: result?.count ?? 0,
  });
}
