/**
 * ============================================================
 *  הדחיפה שלפני השיחה
 * ============================================================
 *
 *  **מה שנבדק כאן הוא תזמון, ותזמון הוא כל הסיפור.**
 *
 *  דחיפה שיוצאת מוקדם מדי היא רעש. דחיפה שיוצאת אחרי
 *  שהתזכורת כבר צלצלה היא כפילות. דחיפה שיוצאת פעמיים
 *  היא שתיהן. ולכן כל אחד מהמקרים האלה נבדק בנפרד.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NUDGES,
  MIN_LEAD_MINUTES,
  MAX_LEAD_MINUTES,
  leadMinutesFor,
  shouldNudge,
  nudgeAt,
} from "../lib/pre-call";

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
const runner = read("../lib/runner.ts");
const schema = read("../prisma/schema.prisma");

const minute = 60_000;
const at = (ms: number) => new Date(ms);

/* ============================================================
 *  1. החלון
 * ========================================================= */
console.log("\nמתי הדחיפה יוצאת");

test("**כל דחיפה נופלת בין 15 ל-30 דקות לפני**", () => {
  /**
   * נבדק על מזהים שנראים כמו המזהים האמיתיים במערכת -
   * cuid-ים שנוצרים ברצף ולכן דומים מאוד זה לזה.
   *
   * **גרסה קודמת של הבדיקה השתמשה במזהים מומצאים ועברה
   * בזמן שהחישוב היה שבור:** פעולת XOR ב-JavaScript
   * מחזירה מספר מסומן, השארית יצאה שלילית, וחלק
   * מההתראות נחתו על 0-14 דקות. בדיקה שלא תופסת את זה
   * גרועה מכלום.
   */
  const ids = [
    ...Array.from({ length: 400 }, (_, i) => `clm9x4k${String(i).padStart(4, "0")}a0001`),
    ...Array.from({ length: 200 }, (_, i) => `task-${i}-abcdef`),
    "a",
    "",
    "זהות-בעברית",
  ];

  for (const id of ids) {
    const lead = leadMinutesFor(id);
    assert.ok(
      lead >= MIN_LEAD_MINUTES && lead <= MAX_LEAD_MINUTES,
      `"${id}" קיבל ${lead} דקות - מחוץ לטווח שביקשת`
    );
    assert.ok(Number.isInteger(lead), `${lead} אינו מספר שלם`);
  }
});

test("הפיזור אמיתי ולא נתקע על אותו מספר", () => {
  /**
   * מזהים נוצרים ברצף ולכן נראים דומה. בלי ערבול טוב
   * כולם היו נופלים על אותו הפרש בדיוק, וכל ההתראות
   * היו יוצאות באותו זמן - בדיוק מה שביקשת שלא יקרה.
   */
  const seen = new Map<number, number>();

  for (let i = 0; i < 400; i++) {
    const v = leadMinutesFor(`clm9x4k${String(i).padStart(4, "0")}a0001`);
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }

  const span = MAX_LEAD_MINUTES - MIN_LEAD_MINUTES + 1;
  assert.ok(
    seen.size >= span - 2,
    `רק ${seen.size} הפרשים שונים מתוך ${span} - הפיזור נתקע`
  );
});

test("אותה תזכורת מקבלת תמיד את אותו זמן", () => {
  /**
   * **זה לא קוסמטי.** הגרלה חדשה בכל סיבוב של המנוע
   * הייתה משנה את התשובה כל דקה, וההתראה הייתה יוצאת
   * מוקדם מדי או לא יוצאת בכלל - תלוי במזל של אותה דקה.
   */
  const a = leadMinutesFor("cltask123");
  for (let i = 0; i < 20; i++) {
    assert.equal(leadMinutesFor("cltask123"), a, "הזמן משתנה בין קריאות");
  }
});

test("תזכורות שונות מקבלות זמנים שונים", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) seen.add(leadMinutesFor(`id${i}`));
  assert.ok(seen.size > 8, `רק ${seen.size} זמנים שונים - זה לא מפוזר`);
});

test("לא יוצא לפני שהחלון נפתח", () => {
  const due = 10 * 60 * minute;
  const lead = leadMinutesFor("x1");

  assert.ok(
    !shouldNudge({
      taskId: "x1",
      dueAt: at(due),
      now: at(due - (lead + 1) * minute),
    }),
    "הדחיפה יצאה לפני החלון"
  );

  assert.ok(
    shouldNudge({
      taskId: "x1",
      dueAt: at(due),
      now: at(due - lead * minute),
    }),
    "הדחיפה לא יצאה כשהחלון נפתח"
  );
});

test("**לא יוצא אחרי שהתזכורת עצמה הגיעה**", () => {
  /**
   * אחרת היית מקבל "תתקשר עכשיו, לפני השני" בדיוק כשהתזכורת
   * האמיתית צלצלה - שתי התראות על אותה שיחה.
   */
  const due = 10 * 60 * minute;

  assert.ok(
    !shouldNudge({ taskId: "x1", dueAt: at(due), now: at(due) }),
    "הדחיפה יצאה בדיוק בזמן התזכורת"
  );
  assert.ok(
    !shouldNudge({ taskId: "x1", dueAt: at(due), now: at(due + minute) }),
    "הדחיפה יצאה אחרי התזכורת"
  );
});

test("תזכורת שנקבעה לעוד 10 דקות עדיין מקבלת דחיפה מיד", () => {
  /** החלון כבר נפתח, והדחיפה רלוונטית בדיוק כמו תמיד */
  const now = 10 * 60 * minute;
  assert.ok(
    shouldNudge({
      taskId: "late",
      dueAt: at(now + 10 * minute),
      now: at(now),
    }),
    "תזכורת קצרה לא קיבלה דחיפה בכלל"
  );
});

/* ============================================================
 *  2. המלל
 * ========================================================= */
console.log("\nבנק המלל");

test("יש בנק אמיתי ולא שתי שורות", () => {
  assert.ok(NUDGES.length >= 12, `רק ${NUDGES.length} תבניות - יחזור על עצמו`);
});

test("**סבב ולא הגרלה - אין חזרה ברצף**", () => {
  for (let i = 0; i < NUDGES.length * 3; i++) {
    assert.notEqual(
      nudgeAt(i),
      nudgeAt(i + 1),
      `המלל חזר על עצמו פעמיים ברצף במונה ${i}`
    );
  }
});

test("הסבב עובר על כל הבנק לפני שהוא חוזר", () => {
  const seen = new Set<string>();
  for (let i = 0; i < NUDGES.length; i++) seen.add(nudgeAt(i));
  assert.equal(seen.size, NUDGES.length, "חלק מהתבניות לא יוצאות לעולם");
});

test("מונה שלילי או ענק לא שובר כלום", () => {
  assert.ok(typeof nudgeAt(-7) === "string" && nudgeAt(-7).length > 0);
  assert.ok(typeof nudgeAt(999999) === "string");
});

test("כל שורה אומרת משהו, ולא ריקה", () => {
  for (const n of NUDGES) {
    assert.ok(n.trim().length > 15, `שורה קצרה מדי: "${n}"`);
  }
});

test("אין שתי שורות זהות בבנק", () => {
  assert.equal(new Set(NUDGES).size, NUDGES.length, "יש כפילות בבנק");
});

/* ============================================================
 *  3. החיבור למנוע
 * ========================================================= */
console.log("\nהחיבור למנוע");

test("הדחיפה רצה **לפני** התזכורות", () => {
  /**
   * אם תזכורת שהגיע זמנה הייתה מסומנת קודם, הדחיפה שלה
   * הייתה יוצאת באותו סיבוב - שתי התראות בפער של שנייה.
   */
  const pre = runner.indexOf('["דחיפה לפני שיחה"');
  const rem = runner.indexOf('["תזכורות משימות"');
  assert.ok(pre > -1, "הדחיפה לא רשומה במנוע בכלל");
  assert.ok(pre < rem, "הדחיפה רצה אחרי התזכורות");
});

test("**דחיפה אחת לכל תזכורת**", () => {
  assert.ok(
    schema.includes("preNotifiedAt DateTime?"),
    "אין סימון - תקבל את אותה דחיפה כל דקה"
  );
  assert.ok(
    runner.includes("preNotifiedAt: null"),
    "המנוע לא מסנן תזכורות שכבר קיבלו דחיפה"
  );
});

test("לא מסמן כשההתראה נכשלה", () => {
  /** אחרת הדחיפה נעלמת בשקט - וזו השיחה שרצית לא לפספס */
  const at2 = runner.indexOf("async function sendPreCallNudges");
  const body = runner.slice(at2, runner.indexOf("async function sendTaskReminders"));
  assert.ok(
    body.includes("if (delivered > 0)"),
    "תזכורת מסומנת גם כשאף ערוץ לא עבד"
  );
});

test("כיבוי ערוצים בהגדרות מכובד גם כאן", () => {
  const at2 = runner.indexOf("async function sendPreCallNudges");
  const body = runner.slice(at2, runner.indexOf("async function sendTaskReminders"));
  assert.ok(
    body.includes("if (!toBanner && !toPush) return"),
    "הדחיפה תצא גם אחרי שכיבית את ההתראות"
  );
});

test("**התזכורת עצמה לא זזה**", () => {
  /**
   * היא הזמן שסיכמת עם הלקוח. אם הקדמנו אותה, איבדנו את
   * המידע הזה - וזה לא מה שביקשת.
   */
  const at2 = runner.indexOf("async function sendPreCallNudges");
  const body = runner.slice(at2, runner.indexOf("async function sendTaskReminders"));
  assert.ok(
    !/data:\s*\{[^}]*dueAt/.test(body),
    "הדחיפה משנה את זמן התזכורת"
  );
});

test("החלון שנשלף מהמסד צר, ולא כל העתיד", () => {
  const at2 = runner.indexOf("async function sendPreCallNudges");
  const body = runner.slice(at2, runner.indexOf("async function sendTaskReminders"));
  assert.ok(
    body.includes("31 * 60_000"),
    "המנוע מושך מאות משימות עתידיות בכל דקה"
  );
});

/* ============================================================
 *  4. אפשר לראות שזה קיים
 * ========================================================= */
console.log("\nהפיצ'ר נראה לעין");

const settingsScreen = read("../components/PreCallSettings.tsx");
const general = read("../components/GeneralTasks.tsx");
const leadTasks = read("../components/LeadTasks.tsx");
const settingsPage = read("../app/settings/page.tsx");
const test1 = read("../app/api/tasks/nudge-test/route.ts");

test("**כל תזכורת מראה מתי תצא הדחיפה**", () => {
  /**
   * הפיצ'ר עובד לבד ואין מה להקים - ולכן בלי השורה הזו
   * אין שום דרך לראות שהוא קיים. פיצ'ר שאי אפשר לראות
   * הוא פיצ'ר שלא בטוח שהוא עובד.
   */
  for (const [name, src] of [
    ["משימות עסק", general],
    ["משימות ליד", leadTasks],
  ] as const) {
    assert.ok(
      src.includes("function nudgeTime") && src.includes("דחיפה לנייד ב-"),
      `${name}: לא מוצג מתי תצא הדחיפה`
    );
  }
});

test("לא מוצג על תזכורת שהזמן שלה עבר", () => {
  for (const src of [general, leadTasks]) {
    assert.ok(
      src.includes("!late && nudgeTime("),
      "מוצגת דחיפה עתידית על תזכורת שכבר עברה"
    );
  }
});

test("יש מתג משלו, ואפשר לכבות בלי לכבות תזכורות", () => {
  assert.ok(
    settingsPage.includes("<PreCallSettings"),
    "המתג לא מופיע במסך ההגדרות"
  );
  assert.ok(
    schema.includes("preCallNudge   Boolean  @default(true)"),
    "אין מתג בסכימה"
  );
  assert.ok(
    runner.includes("settings.preCallNudge === false"),
    "המנוע מתעלם מהמתג"
  );
});

test("**הבנק גלוי, ולא מוסתר בקוד**", () => {
  assert.ok(
    settingsScreen.includes("NUDGES.map"),
    "אי אפשר לראות מה המערכת תשלח בשמך"
  );
});

test("**אפשר לבדוק בלי לחכות לתזכורת אמיתית**", () => {
  /**
   * אחרת היית מגלה שהתראות נייד לא מוגדרות בדיוק כשהיית
   * צריך אותן.
   */
  assert.ok(test1.includes("sendPush("), "הבדיקה לא שולחת לנייד באמת");
  assert.ok(
    test1.includes("pushConfigured()"),
    "לא נבדק אם התראות נייד מוגדרות בכלל"
  );
});

test("הבדיקה לא שורפת שורה מהבנק", () => {
  /**
   * בדיקה שמקדמת את המונה הייתה גורמת לשורה הבאה לדלג
   * על לקוח אמיתי.
   */
  assert.ok(
    !/nudgeCursor:\s*\{?\s*increment/.test(test1) &&
      !test1.includes("settings.update"),
    "הבדיקה מקדמת את מונה הסבב"
  );
});

test("הבדיקה לא יוצרת משימה ולא נוגעת בתזכורות", () => {
  assert.ok(
    !test1.includes("db.task.create") && !test1.includes("db.task.update"),
    "בדיקה שמשנה תזכורות אמיתיות"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
