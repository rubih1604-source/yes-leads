/**
 * ============================================================
 *  כל ליד שנכנס מתריע. בלי יוצא מן הכלל.
 * ============================================================
 *
 *  **המקרה שהבדיקה הזו נולדה ממנו.**
 *
 *  ליד שכבר היה במערכת נכנס שוב, שויך לקונה, **ולא יצאה
 *  עליו שום התראה** - לא פעמון, לא נייד, לא מייל. הדרך
 *  היחידה לגלות אותו הייתה להסתכל במקרה ברשימה של הקונה.
 *
 *  היו לזה שתי סיבות נפרדות, ושתיהן שלי:
 *
 *   1. **בקליטה** - ענף ההגעה החוזרת היה חסום ב-
 *      `!channel.isSale`, בזמן שענף הליד החדש לא היה.
 *      אותו אירוע, שתי התנהגויות הפוכות, לפי ענף בקוד.
 *
 *   2. **בהתראות** - הפעמון והנייד השתיקו כל ליד של
 *      המכירה. לקחתי כלל נכון (האוטומציות שלך לא רצות על
 *      ליד של הקונה) והחלתי אותו גם על **מידע**.
 *
 *  יחד הן יצרו את התוצאה הגרועה ביותר האפשרית: דווקא
 *  השיוך השגוי - המקרה שהכי חשוב לתפוס - היה המקרה
 *  השקט ביותר במערכת.
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
const notify = read("../lib/notify-lead.ts");

/* ============================================================
 *  הקליטה
 * ========================================================= */
console.log("\nהקליטה - שני הענפים מתריעים אותו דבר");

test("ליד חדש וגם הגעה חוזרת קוראים ל-notifyNewLead", () => {
  const calls = intake.match(/notifyNewLead\(\{/g) ?? [];
  assert.equal(
    calls.length,
    2,
    `נמצאו ${calls.length} קריאות במקום 2 - ענף שלם לא מתריע`
  );
});

test("**ההתראה על הגעה חוזרת אינה חסומה לפי ערוץ**", () => {
  /**
   * זה הבאג המדויק: ליד חוזר של המכירה עבר בשקט מוחלט,
   * בזמן שליד חדש של המכירה כן התריע.
   */
  const at = intake.indexOf("void notifyNewLead({\n          leadId: existing.id");
  assert.ok(at > -1, "לא נמצאה ההתראה על הגעה חוזרת");

  const guard = intake.slice(Math.max(0, at - 400), at);

  assert.ok(
    !/if \(!sameSubmission && !channel\.isSale\) \{\s*$/.test(guard.trimEnd()),
    "התנאי שחסם התראה על ליד חוזר של המכירה חזר"
  );
});

test("התנאי היחיד שנשאר הוא 'אותה הגשה'", () => {
  assert.ok(
    intake.includes("if (!sameSubmission) {"),
    "ההתראה על הגעה חוזרת אינה מוגנת כלל, או מוגנת בתנאי אחר"
  );
});

test("האוטומציות כן נשארות חסומות לערוץ המכירה", () => {
  /**
   * זו ההגדרה שלך ולא באג: האוטומציות **שלך** לא רצות
   * על ליד של הקונה. מה שהיה שגוי הוא להחיל אותה גם על
   * מידע.
   */
  const at = intake.indexOf("scheduleForStatus(");
  const guard = intake.slice(Math.max(0, at - 400), at);

  assert.ok(
    guard.includes("!goesToSale"),
    "האוטומציות שלך ירוצו על לידים של הקונה"
  );

  /**
   * וגם לא על ליד שנכנס אליך בזמן שההעברות עצורות.
   * העצירה היא בשבת, ואתה לא עובד בשבת - הודעה שיוצאת
   * לבד בשבת היא בדיוק מה שהעצירה נועדה למנוע.
   */
  assert.ok(
    guard.includes("!stopped"),
    "הודעות אוטומטיות ייצאו בשבת על לידים שנעצרו"
  );
});

/* ============================================================
 *  ערוצי ההתראה
 * ========================================================= */
console.log("\nהפעמון והנייד - כל ליד, גם של המכירה");

test("הפעמון לא משתיק ליד של המכירה", () => {
  const at = notify.indexOf("db.alert.create");
  const guard = notify.slice(Math.max(0, at - 900), at);

  assert.ok(
    !guard.includes("input.isSale !== true"),
    "הפעמון עדיין משתיק לידים של המכירה"
  );
});

test("הנייד לא משתיק ליד של המכירה", () => {
  const at = notify.indexOf("sendPush({");
  const guard = notify.slice(Math.max(0, at - 900), at);

  assert.ok(
    !guard.includes("input.isSale !== true"),
    "הנייד עדיין משתיק לידים של המכירה"
  );
});

test("אין יותר אף השתקה לפי isSale בכל קובץ ההתראות", () => {
  assert.ok(
    !notify.includes("input.isSale !== true"),
    "נשארה השתקה לפי ערוץ"
  );
});

test("ההתראה אומרת לאיזה צד הליד הלך", () => {
  /**
   * בלי זה לא תדע מההתראה אם הליד הגיע אליך או לקונה -
   * וזו בדיוק השאלה שצריך לענות עליה מיד.
   */
  const marks = notify.match(/" · למכירה"/g) ?? [];
  assert.ok(
    marks.length >= 2,
    `הסימון מופיע ${marks.length} פעמים - צריך גם בפעמון וגם בנייד`
  );
});

test("המייל נשאר לפי ההגדרה שלך, ולא נדרס", () => {
  /**
   * `leadEmailMode` הוא מתג שאתה קבעת, ולכן הוא נשאר
   * בידיים שלך. ברירת המחדל היא "all" - כלומר מייל על
   * כל ליד.
   */
  assert.ok(
    notify.includes("shouldEmail(settings.leadEmailMode"),
    "המייל כבר לא מכבד את ההגדרה שלך"
  );

  const settings = read("../lib/settings.ts");
  assert.ok(
    settings.includes('leadEmailMode: "all"'),
    "ברירת המחדל של המייל אינה 'כל הלידים'"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
