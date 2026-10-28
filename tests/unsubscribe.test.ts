import assert from "node:assert/strict";
import {
  detectUnsubscribe,
  intentBlacklists,
  normalizeText,
  patternSources,
} from "../lib/unsubscribe";

/**
 * ============================================================
 *  נעילה על הרשימה השחורה
 * ============================================================
 *
 *  שתי טעויות אפשריות כאן, ושתיהן יקרות:
 *
 *  **החמצה** - אדם שביקש להסיר ממשיך לקבל דיוור. זו חשיפה
 *  משפטית ולא רק מבוכה.
 *
 *  **זיהוי שגוי** - לקוח מתעניין נכנס לרשימה השחורה ואי
 *  אפשר לפנות אליו יותר. ליד שאבד בשקט.
 *
 *  לכן יש כאן בדיקות לשני הכיוונים.
 */

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

const blacklisted = (text: string) => detectUnsubscribe(text).blacklist;

/* ---------- מה שחייב להיתפס ---------- */

const MUST_CATCH = [
  "הסר",
  "הסר אותי",
  "הסירו אותי מהרשימה",
  "תסירו אותי בבקשה",
  "אנא להסיר אותי",
  "תפסיקו לשלוח לי הודעות",
  "אל תשלחו לי יותר",
  "לא לשלוח לי הודעות",
  "ביקשתי שימחקו את המספר שלי",
  "תמחקו את המספר שלי",
  "תמחקו אותי",
  "למחוק אותי מהרשימה",
  "תורידו אותי מהרשימה",
  "אל תפנו אליי יותר",
  "לא לפנות אליי יותר",
  "לא להתקשר אליי",
  "STOP",
  "unsubscribe",
  "לא מעוניין",
  "לא מעוניינת",
  "לא מעונין תודה",
  "לא רלוונטי",
];

for (const text of MUST_CATCH) {
  test(`נתפס: "${text}"`, () => {
    assert.equal(blacklisted(text), true, `לא זוהה: ${text}`);
  });
}

test("ניקוד וסימני פיסוק לא מפספסים", () => {
  assert.equal(blacklisted("הסר!!!"), true);
  assert.equal(blacklisted("  הסר.  "), true);
  assert.equal(blacklisted("הסר אותי, תודה"), true);
});

test("כתיב עם יוד כפולה או בודדת - אותו דבר", () => {
  assert.equal(blacklisted("אל תפנו אלי"), true);
  assert.equal(blacklisted("אל תפנו אליי"), true);
});

test("הסרה מפורשת נתפסת גם עם מילת ניגוד", () => {
  assert.equal(blacklisted("תסירו אותי אבל תודה על ההצעה"), true);
});

/* ---------- מה שאסור להיתפס ---------- */

const MUST_NOT_CATCH = [
  "מעוניין",
  "כן בבקשה תתקשר אליי",
  "כמה זה עולה",
  "מה כלול בחבילה",
  "תתקשר אליי מחר בבוקר",
  "אני כבר לקוח של yes",
  "לא הבנתי את ההצעה",
  "לא קיבלתי את ההודעה הקודמת",
  "לא עכשיו תתקשר בשבוע הבא",
  "תודה",
  "👍",
  "",
  "   ",
];

for (const text of MUST_NOT_CATCH) {
  test(`לא נתפס בטעות: "${text || "(ריק)"}"`, () => {
    assert.equal(blacklisted(text), false, `זוהה בטעות: ${text}`);
  });
}

test("חוסר עניין עם ניגוד נשאר לסיווג החכם", () => {
  assert.equal(blacklisted("לא מעוניין בטלוויזיה אבל כן באינטרנט"), false);
  assert.equal(blacklisted("לא מעוניין חוץ מאם יש מבצע"), false);
});

test("'לא צריך' לבד לא מספיק - זה לא ניסוח הסרה", () => {
  assert.equal(blacklisted("לא צריך"), false);
});

/* ---------- הסיבה שנרשמת ---------- */

test("הסרה מפורשת נרשמת כבקשת הסרה", () => {
  assert.equal(detectUnsubscribe("הסר אותי").reason, "ביקש להסיר");
});

test("חוסר עניין נרשם בנפרד", () => {
  assert.equal(detectUnsubscribe("לא מעוניין").reason, "אמר שלא מעוניין");
});

test("בלי התאמה אין סיבה", () => {
  assert.equal(detectUnsubscribe("כמה זה עולה").reason, null);
});

/* ---------- הדלת של הסיווג החכם ---------- */

test("remove בביטחון גבוה נכנס לרשימה", () => {
  assert.equal(intentBlacklists("remove", 0.9).blacklist, true);
});

test("not_interested בביטחון גבוה נכנס לרשימה", () => {
  assert.equal(intentBlacklists("not_interested", 0.9).blacklist, true);
});

test("ביטחון נמוך לא נכנס - רובי יחליט", () => {
  assert.equal(intentBlacklists("remove", 0.5).blacklist, false);
  assert.equal(intentBlacklists("not_interested", 0.84).blacklist, false);
});

test("כוונה אחרת לא נכנסת", () => {
  assert.equal(intentBlacklists("interested", 0.99).blacklist, false);
  assert.equal(intentBlacklists("question", 0.99).blacklist, false);
  assert.equal(intentBlacklists("existing_customer", 0.99).blacklist, false);
});

test("שתי הדלתות מחזירות את אותן סיבות", () => {
  assert.equal(
    intentBlacklists("remove", 0.9).reason,
    detectUnsubscribe("הסר").reason
  );
  assert.equal(
    intentBlacklists("not_interested", 0.9).reason,
    detectUnsubscribe("לא מעוניין").reason
  );
});

/* ---------- שער על אותיות סופיות ---------- */

test("אין אות סופית באף תבנית - אחרת היא לא תתאים לעולם", () => {
  for (const source of patternSources()) {
    const bad = source.match(/[םןךףץ]/g);
    assert.equal(
      bad,
      null,
      `התבנית מכילה אות סופית (${bad?.join(", ")}): ${source}`
    );
  }
});

/* ---------- נרמול ---------- */

test("הנרמול לא מפיל קלט מוזר", () => {
  assert.equal(typeof normalizeText(""), "string");
  assert.equal(normalizeText("  א   ב  "), "א ב");
});

console.log(`✓ unsubscribe: ${passed} בדיקות עברו`);
