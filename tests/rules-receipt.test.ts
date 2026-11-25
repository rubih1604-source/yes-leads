/**
 * ============================================================
 *  כל שינוי סטטוס משאיר עקבה
 * ============================================================
 *
 *  **זו הבדיקה שהייתה חסרה חודשיים.**
 *
 *  הנושא "שיניתי סטטוס ולא נשלחה הודעה" חזר שוב ושוב לא
 *  כי התיקונים לא עבדו, אלא כי **לא היה מה לבדוק**: היו
 *  חמש דרכים לצאת ממנוע החוקים בלי לשלוח כלום, וארבע
 *  מהן לא השאירו שום סימן. לא התראה, לא אירוע, כלום.
 *
 *  כאן נבדק שכל אחת מהיציאות האלה נרשמת.
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
const rules = read("../lib/rules.ts");
const watchdog = read("../lib/watchdog.ts");
const trace = read("../app/api/diagnostics/trace/route.ts");

/** גוף הפונקציה בלבד, לא כל הקובץ */
const fn = rules.slice(
  rules.indexOf("export async function scheduleForStatus"),
  rules.indexOf("export async function applyStatusChange")
);

/* ============================================================
 *  1. אין יציאה שקטה
 * ========================================================= */
console.log("\nאין יציאה שקטה ממנוע החוקים");

test("**ה-catch הריק סביב יצירת המשימה נעלם**", () => {
  /**
   * זה היה הכשל הכי שקט במערכת: תקלה ביצירת המשימה
   * נבלעה, הלולאה המשיכה, והליד נשאר בלי שום משימה ובלי
   * שום סימן.
   */
  /**
   * נבדק רק ה-catch של יצירת המשימה. ה-catch שסביב
   * ההרצה המיידית הוא לגיטימי: הטיימר מריץ שוב בדקה
   * הבאה, והמנוע עצמו כבר מתעד.
   */
  const upsertBlock = fn.slice(
    fn.indexOf("await db.scheduledJob.upsert"),
    fn.indexOf("if (dueNow)")
  );

  assert.ok(upsertBlock.length > 100, "לא נמצא הקטע של יצירת המשימה");
  assert.ok(
    !/catch\s*\{/.test(upsertBlock),
    "נשאר catch שבולע את התקלה ביצירת המשימה"
  );
  assert.ok(
    upsertBlock.includes("catch (err)") &&
      upsertBlock.includes("התזמון נכשל"),
    "כישלון תזמון לא נרשם ולא מתריע"
  );
});

test("כל יציאה כותבת קבלה על הליד", () => {
  assert.ok(fn.includes("const receipt ="), "אין מנגנון תיעוד בכלל");
  assert.ok(
    fn.includes('type: "rules_evaluated"'),
    "ההחלטה לא נשמרת כאירוע על הליד"
  );

  /** כל ארבע היציאות, כל אחת עם קבלה משלה */
  const exits = [
    "ליד של מכירת לידים",
    "אין אף חוק מוגדר לסטטוס",
    "וכולם כבויים",
    "לא תוזמנה אף משימה",
  ];

  for (const e of exits) {
    assert.ok(fn.includes(e), `יציאה בלי קבלה: ${e}`);
  }
});

test("**חוק כבוי כבר לא נראה כמו 'אין חוק'**", () => {
  /**
   * קודם השאילתה סיננה active:true, ולכן חוק כבוי וחוק
   * שלא קיים יצאו שניהם בשקט ובאותה דרך. חוקי "נשלחה
   * הצעת מחיר" נכנסים כבויים בכוונה - ובלי להגיד לך,
   * חיכית להודעה שלא תגיע לעולם.
   */
  assert.ok(
    !fn.includes("triggerStatus: status, active: true"),
    "חוקים כבויים עדיין מסוננים החוצה בשקט"
  );
  assert.ok(
    fn.includes("const off = rules.filter((r) => !r.active)"),
    "אין הפרדה בין כבוי ללא קיים"
  );
  assert.ok(
    fn.includes("החוקים כבויים"),
    "אין התראה על סטטוס שכל חוקיו כבויים"
  );
});

test("רק חוקים פעילים באמת רצים", () => {
  /** התיעוד לא אמור להפעיל חוק שכיבית */
  assert.ok(
    fn.includes("for (const rule of active)"),
    "הלולאה רצה על כל החוקים, כולל הכבויים - יישלחו הודעות שכיבית"
  );
});

test("סתירה בין origin לערוץ מתריעה", () => {
  /**
   * ליד שיושב ברשימה שלך אבל מסומן origin של מכירה נראה
   * רגיל לגמרי במסך, ושקט לחלוטין באוטומציות.
   */
  assert.ok(
    fn.includes("owner.channel !== \"sale\"") &&
      fn.includes("ליד ברשימה שלך שלא יקבל אף הודעה"),
    "הסתירה הזו עדיין שקטה"
  );
});

test("שינוי סטטוס שלא יצר כלום מתריע", () => {
  assert.ok(
    fn.includes("שינוי סטטוס שלא יצר שום פעולה"),
    "חוקים פעילים שלא יצרו משימה יישארו בשקט"
  );
});

/* ============================================================
 *  2. אפשר לראות את זה
 * ========================================================= */
console.log("\nהמסקנה מגיעה למסך");

test("**המסקנה מופיעה במעקב אחרי הליד**", () => {
  /**
   * קבלה שנשמרת ואי אפשר לקרוא אותה היא לא קבלה.
   */
  assert.ok(
    trace.includes("payload.conclusion") && trace.includes("מסקנה"),
    "הטיימליין מראה 'הסטטוס השתנה' בלי להגיד למה לא נשלח"
  );
});

/* ============================================================
 *  3. הסוכן תופס את זה לבד
 * ========================================================= */
console.log("\nהסוכן תופס סטטוס שותק");

test("יש בדיקה לסטטוסים שכל חוקיהם כבויים", () => {
  assert.ok(
    watchdog.includes("async function checkDisabledRules"),
    "אין בדיקה - תגלה את זה רק כשתפספס מכירה"
  );
  assert.ok(
    watchdog.includes("checkDisabledRules,"),
    "הבדיקה לא רשומה ברשימת הבדיקות"
  );
});

test("**הסוכן לא מדליק חוקים לבד**", () => {
  /**
   * הדלקה אוטומטית הייתה מתחילה לשלוח הודעות ללקוחות
   * בלי שביקשת. זו החלטה שלך.
   */
  const body = watchdog.slice(
    watchdog.indexOf("async function checkDisabledRules"),
    watchdog.indexOf("const CHECKS")
  );
  assert.ok(
    !/rule\.update|updateMany/.test(body),
    "הסוכן מדליק חוקים בעצמו - יצאו הודעות שלא ביקשת"
  );
  assert.ok(body.includes("needsYou: true"), "לא מסומן שנדרשת החלטה שלך");
});

test("רק סטטוסים שאתה באמת משתמש בהם", () => {
  /** סטטוס שלא נגעת בו חודש הוא לא תקלה */
  const body = watchdog.slice(
    watchdog.indexOf("async function checkDisabledRules"),
    watchdog.indexOf("const CHECKS")
  );
  assert.ok(
    body.includes('type: "status_changed"') && body.includes("14 * 24"),
    "הסוכן יתלונן על סטטוסים שלא בשימוש"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
