/**
 * ============================================================
 *  כל הגעה היא ליד. גם אם הוא נכנס בעבר.
 * ============================================================
 *
 *  **הכלל, במילים של רובי:**
 *
 *      "כל ליד שנכנס לא משנה כמה פעמים הוא נכנס הוא מקבל
 *       שורה של ליד מחדש. אבנר נכנס בחודש נובמבר 3 פעמים
 *       אז כל פעם הוא יופיע כחדש ומהליד השני תהיה תווית
 *       של כפול וזהו! אבל הוא חדש לחלוטין."
 *
 *  **מה שבניתי במקום, ולמה זה היה הפוך.**
 *
 *  בניתי את מה שמקובל במערכות CRM: שורה אחת לאדם,
 *  שמתרעננת בכל הגעה. התוצאה בשטח הייתה בדיוק ההפך ממה
 *  שהתבקש - אדם שנכנס שוב הופיע עם **הסטטוס והתוויות של
 *  הפעם הקודמת**: "אין מענה", "נמען דיוור". ליד חדש
 *  לגמרי, שנראה כמו ליד שכבר טופל ונכשל.
 *
 *  וגרוע מזה: בניתי אכיפה במסד שחסמה את ההתנהגות הנכונה
 *  לגמרי. הקוד לא יכול היה לעשות את הדבר הנכון גם אם
 *  היה רוצה.
 *
 *  הבדיקה הזו נועלת את הכלל בכל שלוש הרמות: המסד, הקליטה
 *  והתצוגה.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error("     " + (err instanceof Error ? err.message : String(err)));
  }
}

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const intake = read("../app/api/webhooks/leadmanager/route.ts");
const index = read("../lib/lead-index.ts");
const schema = read("../prisma/schema.prisma");
const page = read("../app/page.tsx");

/* ============================================================
 *  1. המסד מרשה את זה
 * ========================================================= */
console.log("\nהמסד");

test("**אין שום אכיפה של טלפון אחד = ליד אחד**", () => {
  assert.ok(
    !schema.includes("@@unique([phone, channel])"),
    "אכיפה בסכימה - הגעה חוזרת תיכשל"
  );
  assert.ok(
    !/\n\s*phone\s+String\s+@unique/.test(schema),
    "phone @unique חזר"
  );
  assert.ok(
    !index.includes("CREATE UNIQUE INDEX"),
    "אכיפה נוצרת בקוד - הגעה חוזרת תיכשל בשקט"
  );
});

test("אינדקס שנשאר מעדכון קודם מוסר", () => {
  assert.ok(
    index.includes("DROP INDEX IF EXISTS"),
    "אינדקס ישן ימשיך לחסום הגעות חוזרות"
  );
});

/* ============================================================
 *  2. הקליטה יוצרת שורה חדשה
 * ========================================================= */
console.log("\nהקליטה");

test("**הגעה אמיתית תמיד יוצרת ליד, גם אם הוא נכנס בעבר**", () => {
  assert.ok(
    intake.includes("if (!existing || !sameSubmission) {"),
    "ליד שנכנס בעבר נכנס לענף העדכון ונדרס"
  );
});

test("הסטטוס מתחיל נקי ולא יורש את הקודם", () => {
  const at = intake.indexOf("if (!existing || !sameSubmission) {");
  const block = intake.slice(at, at + 3000);

  assert.ok(
    block.includes('status: incomingStatus ?? (alreadyCustomer ? "לקוח קיים" : "חדש")'),
    "ההגעה החדשה יורשת סטטוס במקום להתחיל כ'חדש'"
  );
  assert.ok(
    !block.includes("existing.status"),
    "הסטטוס הישן דולף לליד החדש"
  );
});

test("ההגעה החדשה מסומנת ככפולה בלי לאחד שורות", () => {
  assert.ok(
    intake.includes("duplicateOf:"),
    "אין סימון - לא תדע שהאדם הזה כבר נכנס"
  );
  assert.ok(
    intake.includes("priorLeads[priorLeads.length - 1].id"),
    "הסימון לא מצביע על ההגעה הראשונה"
  );
});

test("**אותה הגשה משתי דלתות עדיין לא יוצרת שורה שנייה**", () => {
  /**
   * ליד מנגר והחיבור הישיר מוסרים את אותה הגשה בהפרש
   * שניות. בלי הבדיקה הזו כל ליד היה נכפל אוטומטית,
   * וה"כפול" היה חסר משמעות.
   */
  const at = intake.indexOf("const sameSubmission =");
  const create = intake.indexOf("if (!existing || !sameSubmission) {");

  assert.ok(at > -1, "בדיקת אותה הגשה נעלמה");
  assert.ok(
    at < create,
    "ההכרעה על אותה הגשה קורית אחרי שכבר נוצר ליד"
  );
});

test("עדכון סטטוס מליד מנגר אינו הגעה", () => {
  assert.ok(
    intake.includes("statusOnly ||"),
    "עדכון סטטוס ייצור ליד חדש בכל פעם"
  );
});

/* ============================================================
 *  3. התצוגה סופרת הגעות
 * ========================================================= */
console.log("\nהתצוגה");

test('"כפול · N" סופר הגעות, לא כניסות על שורה אחת', () => {
  assert.ok(
    page.includes("arrivalNo.get(l.phone)"),
    "הספירה עדיין על כניסות של שורה אחת"
  );
});

test("הספירה מהישן לחדש, כך ש-2 הוא באמת השני", () => {
  assert.ok(
    page.includes("a.intakeAt.getTime() - b.intakeAt.getTime()"),
    "הסדר הפוך - ההגעה האחרונה תסומן 1"
  );
});

test("הספירה נעשית פעם אחת ולא בשאילתה לכל ליד", () => {
  assert.ok(
    page.includes("const arrivalNo = new Map<string, number>()"),
    "ספירה לכל שורה בנפרד תאט את הרשימה"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
