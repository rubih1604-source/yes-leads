/**
 * ============================================================
 *  שיוך לפי טופס
 * ============================================================
 *
 *  הטופס הוא היחידה הנכונה לשיוך, וזה בדיוק איך שאתה
 *  עובד בפועל: טופס אחד מחובר לקונה אחד.
 *
 *  סדר ההכרעה בקליטה:
 *
 *    1. **טופס** - אם הטופס מוגדר, הוא קובע. נקודה.
 *    2. שם הקמפיין - כגיבוי, למה שמגיע מליד מנגר בלי
 *       מזהה טופס.
 *
 *  למה הטופס ראשון: שם קמפיין משתנה ולא תמיד מגיע, ושם
 *  הטופס גם הוא טקסט. המזהה שפייסבוק שולחת עם כל ליד
 *  הוא הדבר היחיד שלא זז.
 */

import { db } from "./db";

export type FormAssignment = {
  formId: string;
  formName: string;
  channel: "mine" | "sale";
  buyerId: string | null;
  price: number;
  supplierKey: string | null;
};

let cache: { at: number; byForm: Map<string, FormAssignment> } | null = null;
const CACHE_MS = 30_000;

export function clearLeadFormCache() {
  cache = null;
}

async function assignments(): Promise<Map<string, FormAssignment>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byForm;

  try {
    const rows = await db.leadForm.findMany();

    const byForm = new Map<string, FormAssignment>(
      rows.map((r) => [
        r.formId,
        {
          formId: r.formId,
          formName: r.formName,
          channel: r.channel === "sale" ? "sale" : "mine",
          buyerId: r.buyerId ?? null,
          price: Number(r.pricePerLead ?? 0),
          supplierKey: r.supplierKey ?? null,
        },
      ])
    );

    cache = { at: Date.now(), byForm };
    return byForm;
  } catch {
    return new Map();
  }
}

/**
 * השיוך של הטופס שהליד הגיע ממנו.
 *
 * מחזיר null אם הטופס לא מוגדר - ואז מכריעים לפי שם
 * הקמפיין, כמו קודם. טופס לא מוגדר לא משנה שום התנהגות
 * קיימת.
 */
export async function assignmentForForm(
  formId: string | null | undefined
): Promise<FormAssignment | null> {
  const clean = formId?.trim();
  if (!clean) return null;

  const byForm = await assignments();
  return byForm.get(clean) ?? null;
}

/** שאלת הספק של הטופס, אם נבחרה במפורש */
export async function supplierKeyForForm(
  formId: string | null | undefined
): Promise<string | null> {
  const row = await assignmentForForm(formId);
  return row?.supplierKey ?? null;
}
