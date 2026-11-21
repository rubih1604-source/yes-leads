/**
 * ============================================================
 *  זיהוי מספר שלא יכול להיות אמיתי
 * ============================================================
 *
 *  ליד עם מספר שגוי הוא ליד אבוד: מתקשרים ולא עונים,
 *  שולחים וואטסאפ ולא מגיע, ואין שום סימן שהבעיה היא
 *  במספר ולא בלקוח.
 *
 *  **הכלל המנחה בבדיקות האלה: ספק לטובת הלקוח.** ליד
 *  אמיתי שסומן בטעות גרוע יותר מליד שגוי שלא סומן, כי
 *  תווית שמופיעה על לקוחות טובים היא תווית שמפסיקים
 *  להסתכל עליה.
 */

import assert from "node:assert/strict";
import { checkPhone, isBadPhone } from "../lib/phone-valid";

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

/* ============================================================
 *  נייד - 10 ספרות
 * ========================================================= */
console.log("\nנייד");

test("כל קידומות הנייד מתקבלות עם 10 ספרות", () => {
  for (const p of ["050", "051", "052", "053", "054", "055", "058", "059"]) {
    const r = checkPhone(`${p}1234567`);
    assert.ok(r.valid, `${p} נדחה: ${r.reason}`);
    assert.equal(r.kind, "נייד");
  }
});

test("ספרה חסרה נתפסת, ואומרים כמה", () => {
  const r = checkPhone("054123456");
  assert.equal(r.valid, false);
  assert.ok(r.reason?.includes("חסרה") || r.reason?.includes("חסרות"));
});

test("ספרה עודפת נתפסת", () => {
  const r = checkPhone("05412345678");
  assert.equal(r.valid, false);
  assert.ok(r.reason?.includes("מיותר"));
});

test("אותו מספר בכל צורת כתיבה - תקין", () => {
  for (const p of [
    "0541234567",
    "054-123-4567",
    "054 123 4567",
    "+972541234567",
    "+972-54-123-4567",
    "972541234567",
    "00972541234567",
    "541234567",
  ]) {
    assert.ok(checkPhone(p).valid, `נדחה: ${p}`);
  }
});

/* ============================================================
 *  נייח - 9 ספרות
 * ========================================================= */
console.log("\nנייח");

test("כל אזורי החיוג מתקבלים עם 9 ספרות", () => {
  for (const p of ["02", "03", "04", "08", "09"]) {
    const r = checkPhone(`${p}1234567`);
    assert.ok(r.valid, `${p} נדחה: ${r.reason}`);
    assert.equal(r.kind, "נייח");
  }
});

test("נייח עם 10 ספרות נתפס כשגוי", () => {
  /** הטעות הנפוצה: מקלידים נייח באורך של נייד */
  assert.equal(checkPhone("0312345678").valid, false);
});

/* ============================================================
 *  קווי מבוסס אינטרנט - הוט, בזק, פרטנר
 * ========================================================= */
console.log("\nקווי אינטרנט");

test("072-079 מתקבלים עם 10 ספרות", () => {
  for (const p of ["071", "072", "073", "074", "076", "077", "078", "079"]) {
    const r = checkPhone(`${p}1234567`);
    assert.ok(r.valid, `${p} נדחה: ${r.reason}`);
    assert.equal(r.kind, "קווי אינטרנט");
  }
});

/* ============================================================
 *  מה שלא תקין
 * ========================================================= */
console.log("\nמה שבאמת שגוי");

test("קידומת שלא קיימת בישראל", () => {
  const r = checkPhone("0612345678");
  assert.equal(r.valid, false);
  assert.ok(r.reason?.includes("קידומת"));
});

test("מספר ריק או בלי ספרות", () => {
  assert.equal(checkPhone("").valid, false);
  assert.equal(checkPhone(null).valid, false);
  assert.equal(checkPhone(undefined).valid, false);
  assert.equal(checkPhone("אין מספר").valid, false);
});

test("מספר שירות אינו מספר של לקוח", () => {
  assert.equal(checkPhone("1800123456").valid, false);
  assert.equal(checkPhone("*6050").valid, false);
});

test("מספר קצר מדי", () => {
  assert.equal(checkPhone("0541").valid, false);
  assert.equal(checkPhone("12").valid, false);
});

/* ============================================================
 *  ספק לטובת הלקוח
 * ========================================================= */
console.log("\nלא מסמנים לקוחות אמיתיים");

test("**מספר מחו\\\"ל אינו 'לא תקין'**", () => {
  /**
   * לקוח עם מספר אמריקאי או אירופי הוא לקוח אמיתי.
   * תווית אדומה עליו היא רעש, ורעש גורם להתעלם
   * מהתוויות בכלל.
   */
  for (const p of ["+12125551234", "+447911123456", "+33612345678"]) {
    const r = checkPhone(p);
    assert.ok(r.valid, `מספר זר סומן כשגוי: ${p}`);
    assert.equal(r.kind, 'חו"ל');
  }
});

test("מספר ישראלי עם +972 לא מבולבל עם חו\\\"ל", () => {
  assert.equal(checkPhone("+972541234567").kind, "נייד");
});

test("isBadPhone הוא בדיוק ההיפך", () => {
  assert.equal(isBadPhone("0541234567"), false);
  assert.equal(isBadPhone("054123456"), true);
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
