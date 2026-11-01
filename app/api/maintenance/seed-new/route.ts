import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { DEFAULT_STATUSES } from "@/lib/statuses";
import { DEFAULT_RULES } from "@/lib/rules";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  טעינת סטטוסים וחוקים שנוספו אחרי ההתקנה
 * ============================================================
 *
 *  **הבעיה שזה פותר.**
 *
 *  הסטטוסים נטענים למסד פעם אחת, כשהטבלה ריקה. כל סטטוס
 *  שנוסף לקוד אחרי זה פשוט לא מגיע למערכת שכבר עובדת -
 *  הוא קיים בקוד ולא קיים אצלך. ככה "אין מענה 2" היה
 *  נשאר בלתי נראה.
 *
 *  **מוסיף בלבד.**
 *
 *  סטטוס או חוק שכבר קיימים אצלך לא נגעו בהם: לא הצבע,
 *  לא התבנית, לא ההדלקה. סטטוס שמחקת בכוונה כן יחזור -
 *  ולכן 'הצג' מראה בדיוק מה ייווצר לפני שנוצר משהו.
 *
 *  חוק חדש נכנס **כבוי**. חוק פעיל עם שם תבנית שעוד לא
 *  אושר בטקסטר היה נכשל על כל ליד שמגיע לסטטוס, בשקט.
 */

type Plan = {
  statuses: string[];
  rules: string[];
  /** סטטוסים קיימים שעדיין בלי קטגוריה, ויש להם אחת בברירת המחדל */
  categories: string[];
};

async function plan(): Promise<Plan> {
  const rows = await db.status.findMany({
    select: { name: true, category: true },
  });
  const existingStatuses = new Set(rows.map((s) => s.name));

  /**
   * סטטוס שקיים אצלך מלפני הקטגוריות יושב בלי שיוך,
   * ולכן ייפול ל"אחרים" - כלומר הרשימה הארוכה חוזרת.
   * כאן משלימים לו את הקטגוריה מברירת המחדל, **רק אם
   * אין לו אחת**: שיוך שעשית בעצמך לא נדרס.
   */
  const needCategory = rows.filter((row) => {
    if ((row.category ?? "").trim()) return false;
    const def = DEFAULT_STATUSES.find((d) => d.name === row.name);
    return Boolean((def?.category ?? "").trim());
  });

  const existingRules = new Set(
    (
      await db.rule.findMany({
        select: { triggerStatus: true, stepIndex: true },
      })
    ).map((r) => `${r.triggerStatus}#${r.stepIndex}`)
  );

  return {
    statuses: DEFAULT_STATUSES.filter((s) => !existingStatuses.has(s.name)).map(
      (s) => s.name
    ),
    rules: DEFAULT_RULES.filter(
      (r) => !existingRules.has(`${r.triggerStatus}#${r.stepIndex}`)
    ).map(
      (r) =>
        `${r.triggerStatus} · צעד ${r.stepIndex} · ${r.note}`
    ),
    categories: needCategory.map((row) => {
      const def = DEFAULT_STATUSES.find((d) => d.name === row.name);
      return `${row.name} → ${def?.category}`;
    }),
  };
}

/** קוראת בלבד - מראה מה ייווצר */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const p = await plan();

  const nothing =
    p.statuses.length === 0 && p.rules.length === 0 && p.categories.length === 0;

  return NextResponse.json({
    סטטוסים_שייווצרו: p.statuses,
    חוקים_שייווצרו: p.rules,
    קטגוריות_שישויכו: p.categories,
    מסקנה: nothing
      ? "הכל כבר קיים אצלך - אין מה להוסיף."
      : `ייווצרו ${p.statuses.length} סטטוסים ו-${p.rules.length} חוקים, ו-${p.categories.length} סטטוסים קיימים ישויכו לקטגוריה. החוקים נכנסים כבויים, ושיוך קיים לא נדרס.`,
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const p = await plan();

  /** הסטטוס החדש נכנס אחרי האחרון הקיים ולא קופץ לראש */
  const last = await db.status.findFirst({ orderBy: { position: "desc" } });
  let position = (last?.position ?? 0) + 1;

  let statusesCreated = 0;

  for (const name of p.statuses) {
    const def = DEFAULT_STATUSES.find((s) => s.name === name);
    if (!def) continue;

    const created = await db.status
      .create({
        data: {
          name: def.name,
          color: def.color,
          position: position++,
          terminal: def.terminal ?? false,
          won: def.won ?? false,
          category: def.category ?? null,
          builtin: true,
        },
      })
      .catch(() => null);

    if (created) statusesCreated++;
  }

  /**
   * שיוך הקטגוריה לסטטוסים ותיקים.
   *
   * זה העדכון היחיד כאן על רשומה קיימת, והוא נוגע בשדה
   * אחד בלבד ורק כשהוא ריק.
   */
  let categorised = 0;

  for (const line of p.categories) {
    const name = line.split(" → ")[0];
    const def = DEFAULT_STATUSES.find((d) => d.name === name);
    if (!def?.category) continue;

    const done = await db.status
      .updateMany({
        where: { name, OR: [{ category: null }, { category: "" }] },
        data: { category: def.category },
      })
      .catch(() => null);

    categorised += done?.count ?? 0;
  }

  let rulesCreated = 0;

  for (const rule of DEFAULT_RULES) {
    const exists = await db.rule.findUnique({
      where: {
        triggerStatus_stepIndex: {
          triggerStatus: rule.triggerStatus,
          stepIndex: rule.stepIndex,
        },
      },
    });
    if (exists) continue;

    const created = await db.rule
      .create({
        data: {
          triggerStatus: rule.triggerStatus,
          stepIndex: rule.stepIndex,
          delayMinutes: rule.delayMinutes,
          action: rule.action,
          templateName: rule.templateName ?? null,
          templatePool: rule.templatePool ?? null,
          targetStatus: rule.targetStatus ?? null,
          note: rule.note,
          /**
           * נכנס כבוי תמיד, גם אם ברירת המחדל פעילה:
           * מערכת שעובדת לא אמורה להתחיל לשלוח הודעות
           * חדשות בגלל פעולת תחזוקה.
           */
          active: false,
        },
      })
      .catch(() => null);

    if (created) rulesCreated++;
  }

  /** הרשימה נקראת עם מטמון קצר - בלי ניקוי, הקטגוריות לא יופיעו מיד */
  const { clearStatusCache } = await import("@/lib/status-store");
  clearStatusCache();

  return NextResponse.json({
    ok: true,
    סטטוסים_שנוצרו: statusesCreated,
    חוקים_שנוצרו: rulesCreated,
    שויכו_לקטגוריה: categorised,
    מסקנה: `נוצרו ${statusesCreated} סטטוסים ו-${rulesCreated} חוקים, ו-${categorised} סטטוסים שויכו לקטגוריה. החוקים כבויים - הדלק אותם במסך "חוקים" אחרי שתמפה את התבניות המאושרות.`,
  });
}
