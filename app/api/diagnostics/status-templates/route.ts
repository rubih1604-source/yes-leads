import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { listTemplates, parseTemplates } from "@/lib/texter";
import { parsePool } from "@/lib/template-pool";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  למה סטטוס מסוים לא שולח
 * ============================================================
 *
 *  קוראת בלבד. לא שולחת כלום ולא משנה כלום.
 *
 *  **מה שנתפס בשטח.** "סטטוסים אחרים כן שולחים, רק
 *  'נשלחה הצעת מחיר' לא."
 *
 *  זה מצמצם את החיפוש לנקודה אחת: התבנית. סטטוס שיש לו
 *  בנק של שלוש תבניות מתחלף ביניהן בסבב - ואם אחת מהן
 *  לא קיימת בטקסטר או לא מאושרת, **חלק מהלידים לא
 *  מקבלים כלום** וזה נראה אקראי לגמרי.
 *
 *  כאן מושווה מה שהחוק מבקש לשלוח מול מה שבאמת קיים
 *  בטקסטר **ברגע זה** - לא מול הטבלה המקומית, שיכולה
 *  להיות מיושנת. זה ההבדל בין "התבנית אצלנו" ל"התבנית
 *  אצלם".
 */

type Problem = {
  סטטוס: string;
  תבנית: string;
  בעיה: string;
  מה_לעשות: string;
};

export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const wanted = (new URL(request.url).searchParams.get("status") ?? "").trim();

  const rules = await db.rule
    .findMany({
      where: { action: "send_template", ...(wanted ? { triggerStatus: wanted } : {}) },
      orderBy: [{ triggerStatus: "asc" }, { stepIndex: "asc" }],
      select: {
        id: true,
        triggerStatus: true,
        stepIndex: true,
        templateName: true,
        templatePool: true,
        active: true,
        delayMinutes: true,
      },
    })
    .catch(() => []);

  if (rules.length === 0) {
    return NextResponse.json({
      נמצא: false,
      מסקנה: wanted
        ? `אין אף חוק על הסטטוס "${wanted}". לכן שינוי לסטטוס הזה לא אמור לשלוח כלום.`
        : "אין אף חוק במערכת.",
    });
  }

  /** מה שקיים בטקסטר ברגע זה - מקור האמת */
  const live = await listTemplates();
  const liveTemplates = live.ok ? parseTemplates(live.raw ?? live.data) : [];

  const byName = new Map(liveTemplates.map((t) => [t.name, t]));

  const local = await db.template
    .findMany({ select: { name: true, variables: true, approved: true } })
    .catch(() => []);
  const localByName = new Map(local.map((t) => [t.name, t]));

  const problems: Problem[] = [];
  const rows = [];

  for (const rule of rules) {
    /** הבנק, ואם אין בנק - התבנית היחידה של החוק */
    const names = parsePool(rule.templatePool);
    const pool = names.length > 0 ? names : [rule.templateName].filter(Boolean);

    const checked = pool.map((name) => {
      const inTexter = byName.get(name);
      const inLocal = localByName.get(name);

      let state = "תקינה";

      if (!inLocal) {
        state = "לא קיימת בטבלה המקומית";
        problems.push({
          סטטוס: rule.triggerStatus,
          תבנית: name,
          בעיה: "החוק מבקש תבנית שלא קיימת במערכת",
          מה_לעשות:
            "תחזוקה → 'סנכרן תבניות מטקסטר', או לתקן את שם התבנית בחוק",
        });
      } else if (!live.ok) {
        state = "לא ניתן לבדוק מול טקסטר";
      } else if (!inTexter) {
        state = "לא קיימת בטקסטר";
        problems.push({
          סטטוס: rule.triggerStatus,
          תבנית: name,
          בעיה: "התבנית לא קיימת בטקסטר - כל שליחה שלה נכשלת",
          מה_לעשות:
            "ליצור אותה בטקסטר בדיוק בשם הזה, או להסיר אותה מבנק התבניות של החוק",
        });
      } else if (!inTexter.approved) {
        state = "לא מאושרת בטקסטר";
        problems.push({
          סטטוס: rule.triggerStatus,
          תבנית: name,
          בעיה: "התבנית קיימת אבל לא מאושרת - מטא לא תשלח אותה",
          מה_לעשות: "לבדוק את מצב האישור בטקסטר ולהגיש אותה מחדש",
        });
      } else if (
        inLocal.variables !== inTexter.variableCount &&
        inTexter.bodyText !== null
      ) {
        state = `מספר משתנים לא תואם (אצלנו ${inLocal.variables}, בטקסטר ${inTexter.variableCount})`;
        problems.push({
          סטטוס: rule.triggerStatus,
          תבנית: name,
          בעיה: state,
          מה_לעשות: "תחזוקה → 'סנכרן תבניות מטקסטר'",
        });
      }

      return {
        שם: name,
        מצב: state,
        קיימת_בטקסטר: Boolean(inTexter),
        מאושרת: inTexter?.approved ?? null,
        משתנים_בטקסטר: inTexter?.variableCount ?? null,
        משתנים_אצלנו: inLocal?.variables ?? null,
      };
    });

    if (!rule.active) {
      problems.push({
        סטטוס: rule.triggerStatus,
        תבנית: "—",
        בעיה: "החוק כבוי",
        מה_לעשות: "להדליק אותו במסך החוקים",
      });
    }

    rows.push({
      סטטוס: rule.triggerStatus,
      שלב: rule.stepIndex,
      פעיל: rule.active,
      אחרי_דקות: rule.delayMinutes,
      כמה_תבניות: checked.length,
      תבניות: checked,
    });
  }

  /**
   * שליחות אמיתיות מהסטטוס הזה, כדי לראות מה קרה בפועל
   * ולא רק מה אמור לקרות.
   */
  const recent = await db.message
    .findMany({
      where: {
        direction: "out",
        templateName: { in: rows.flatMap((r) => r.תבניות.map((t) => t.שם)) },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        templateName: true,
        status: true,
        error: true,
        createdAt: true,
      },
    })
    .catch(() => []);

  return NextResponse.json({
    נמצא: true,
    חוקים: rows,
    טקסטר_נענתה: live.ok,
    תבניות_בטקסטר: liveTemplates.length,
    שליחות_אחרונות: recent.map(
      (m) =>
        `${m.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })} · ${m.templateName} · ${m.status}${m.error ? ` · ${m.error.slice(0, 160)}` : ""}`
    ),
    בעיות: problems,
    מסקנה: !live.ok
      ? `לא הצלחנו לקרוא את רשימת התבניות מטקסטר (${live.error ?? "שגיאה"}). בלי זה אי אפשר לדעת אילו תבניות באמת קיימות.`
      : problems.length === 0
        ? "כל התבניות של הסטטוס הזה קיימות בטקסטר, מאושרות, ומספר המשתנים תואם. אם בכל זאת לא נשלח - הסתכל בשליחות האחרונות למטה."
        : `${problems.length} בעיות. זו הסיבה שהסטטוס הזה לא שולח.`,
  });
}
