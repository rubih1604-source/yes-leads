/**
 * ============================================================
 *  למה ליד שויך למי ששויך - חייב להיות כתוב, תמיד
 * ============================================================
 *
 *  **המקרה שהבדיקה הזו נולדה ממנו.**
 *
 *  נכנסו שני לידים. אחד לא הופיע בכלל, ואחד שנכנס מהטופס
 *  של רובי שויך לקמפיין של הקונה. השאלה "למה?" לא הייתה
 *  ניתנת לענייה: שלושה מנגנונים שונים יכולים לתפוס ליד,
 *  **ואף אחד מהם לא רשם שהוא תפס**.
 *
 *  בלי הרישום הזה כל תיקון הוא ניחוש, וניחוש כבר הוכיח
 *  את עצמו כלא עובד. לכן:
 *
 *   1. הסיבה נשמרת על **כל** כניסה - גם "לא נתפס".
 *   2. ההסבר קורא לאותן פונקציות שהקליטה קוראת להן, ולא
 *      מחשב לבד - אחרת הוא מנגנון רביעי שישקר בדיוק ברגע
 *      שהוא הכי נחוץ.
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
const trace = read("../lib/claim-trace.ts");
const schema = read("../prisma/schema.prisma");
const card = read("../app/leads/[id]/page.tsx");

console.log("\nהסיבה נשמרת על כל כניסה");

test("יש שדה לסיבה על הכניסה", () => {
  assert.ok(
    /matchedOn String\?/.test(schema),
    "אין איפה לשמור את הסיבה"
  );
});

test("הסיבה נרשמת על שתי הכניסות - חדשה וחוזרת", () => {
  const hits = intake.match(/^\s*matchedOn,$/gm) ?? [];
  assert.equal(
    hits.length,
    2,
    `נרשם ב-${hits.length} מקומות במקום 2 - כניסה אחת תישאר בלי הסבר`
  );
});

test("גם 'אף אחד לא תפס' נרשם כסיבה", () => {
  /**
   * "נשאר אצלך" הוא החלטה בדיוק כמו "הלך לקונה", וגם היא
   * צריכה להיות כתובה - אחרת ליד שנשאר אצלך בטעות הוא
   * חידה באותה מידה.
   */
  assert.ok(
    intake.includes('"ללא התאמה - נשאר אצלך"'),
    "החלטה שלילית לא נרשמת"
  );
});

test("הסיבה מחושבת פעם אחת, לפני שתי הכניסות", () => {
  const defined = intake.indexOf("const matchedOn =");
  const first = intake.indexOf("\n            matchedOn,");
  const second = intake.indexOf("\n              matchedOn,");

  assert.ok(defined > -1, "הסיבה לא מחושבת בכלל");
  assert.ok(first > defined && second > defined, "הסיבה מחושבת אחרי השימוש");
});

console.log("\nההסבר לא ממציא מנגנון רביעי");

test("ההסבר קורא לאותן פונקציות שהקליטה קוראת להן", () => {
  for (const fn of [
    "channelForLead",
    "assignmentForForm",
    "channelForIncoming",
  ]) {
    assert.ok(
      trace.includes(fn),
      `ההסבר לא משתמש ב-${fn} - הוא מחשב לבד ולכן ישקר`
    );
    assert.ok(
      intake.includes(fn),
      `הקליטה לא משתמשת ב-${fn} - ההסבר מתאר מנגנון אחר`
    );
  }
});

test("ההסבר שומר על אותו סדר הכרעה", () => {
  const order = (src: string) =>
    ["channelForLead", "assignmentForForm", "channelForIncoming"]
      .map((f) => src.indexOf(f))
      .join(",");

  const traceOrder = ["channelForLead", "assignmentForForm", "channelForIncoming"]
    .map((f) => trace.indexOf(f))
    .sort((a, b) => a - b)
    .join(",");

  assert.equal(
    order(trace),
    traceOrder,
    "ההסבר מריץ את המנגנונים בסדר אחר מהקליטה"
  );
});

test("ההסבר לא כותב כלום למסד", () => {
  assert.ok(
    !/\.(create|update|updateMany|delete)\(/.test(trace),
    "כלי אבחון שמשנה נתונים הוא כלי מסוכן"
  );
});

console.log("\nהסיבה נראית במסך");

test("הסיבה מוצגת בכרטיס הליד", () => {
  assert.ok(
    card.includes("entry.matchedOn"),
    "הסיבה נשמרת אבל אף אחד לא רואה אותה"
  );
});

test("יש גילוי התנגשויות", () => {
  assert.ok(
    trace.includes("findCollisions"),
    "אין דרך לראות מפתח שרשום בשני מקומות"
  );
  assert.ok(
    trace.includes("owners.size > 1"),
    "ההתנגשות לא מזוהה לפי יותר מבעלים אחד"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
