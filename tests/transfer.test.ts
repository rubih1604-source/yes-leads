import assert from "node:assert/strict";
import { TRANSFER_SOURCE } from "../lib/transfer";

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
 *  ההגנה מפני מכירה כפולה
 * ============================================================
 *
 *  transferOnStatus נוגעת במסד ולכן לא נבדקת כאן ישירות.
 *  מה שכן נבדק הוא החוזה שעליו ההגנה נשענת: הסימון שמבדיל
 *  כניסה שנוצרה מהעברה ידנית מכל כניסה אחרת.
 *
 *  אם מישהו ישנה את הסימון הזה בצד אחד בלבד, הבדיקה הקיימת
 *  לא תמצא את הכניסה הקודמת - וליד שכבר הועבר יימכר לקונה
 *  פעם שנייה. זה כסף אמיתי, ולכן זה נעול בבדיקה.
 */

test("סימון ההעברה קיים ואינו ריק", () => {
  assert.equal(typeof TRANSFER_SOURCE, "string");
  assert.ok(TRANSFER_SOURCE.trim().length > 0);
});

test("הסימון נשמר כקבוע אחד, לא מוקלד בשני מקומות", () => {
  // הערך עצמו - אם הוא משתנה, השינוי נראה כאן ולא מתגלה בשטח
  assert.equal(TRANSFER_SOURCE, "העברה לפי סטטוס");
});

test("הסימון נבדל ממקורות קליטה רגילים", () => {
  /**
   * כניסה שנכנסה מקמפיין נושאת את המקור של הליד
   * (פייסבוק, ליד מנגר וכו'). הסימון חייב להיות שונה מהם,
   * אחרת ליד שנכנס רגיל ייחשב כליד שכבר הועבר - ולא יימכר
   * בכלל.
   */
  const intakeSources = [
    "פייסבוק",
    "facebook",
    "leadmanager",
    "ליד מנגר",
    "הודעה נכנסת",
    "ייבוא",
  ];

  for (const source of intakeSources) {
    assert.notEqual(source, TRANSFER_SOURCE);
  }
});

console.log(`✓ transfer: ${passed} בדיקות עברו`);
