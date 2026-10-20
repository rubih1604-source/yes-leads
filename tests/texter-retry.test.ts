import assert from "node:assert/strict";
import { shouldRetrySend } from "../lib/texter";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

/**
 * ============================================================
 *  ניסיון שני לא ישלח ללקוח הודעה פעמיים
 * ============================================================
 *
 *  המקרה האמיתי: טקסטר החזירה 504 Gateway Time-out. השרת
 *  שלהם לא ענה בזמן - אבל ההודעה יכולה הייתה להישלח בפועל.
 *  ניסיון שני במצב כזה מגיע ללקוח כהודעה כפולה.
 */

test("504 — פסק זמן, לא מנסים שוב", () => {
  assert.equal(shouldRetrySend(504), false);
});

test("408 — פסק זמן, לא מנסים שוב", () => {
  assert.equal(shouldRetrySend(408), false);
});

test("500 ו-502 — תקלה אצלהם, מצב ההודעה לא ידוע", () => {
  assert.equal(shouldRetrySend(500), false);
  assert.equal(shouldRetrySend(502), false);
  assert.equal(shouldRetrySend(503), false);
});

test("0 — הבקשה לא הגיעה או שהתשובה נקטעה", () => {
  assert.equal(shouldRetrySend(0), false);
});

test("400 — בקשה פסולה, ההודעה בוודאות לא יצאה, מנסים שוב", () => {
  // זה המקרה היחיד שהניסיון השני נבנה בשבילו: פרמטר חסר בתבנית
  assert.equal(shouldRetrySend(400), true);
});

test("401 ו-403 — בעיית הרשאה, ניסיון שני לא יעזור", () => {
  assert.equal(shouldRetrySend(401), false);
  assert.equal(shouldRetrySend(403), false);
});

test("429 — חסימת קצב, ניסיון מיידי רק יחמיר", () => {
  assert.equal(shouldRetrySend(429), false);
});

test("404 — נתיב או תבנית שלא קיימים", () => {
  assert.equal(shouldRetrySend(404), false);
});

console.log(`✓ texter-retry: ${passed} בדיקות עברו`);
