import assert from "node:assert/strict";
import io from "node:fs";
import { isStatusUpdate, hasSubmissionContent } from "../lib/channel";

/**
 * ============================================================
 *  נעילה על "ליד שנכנס שוב חוזר לראש הרשימה"
 * ============================================================
 *
 *  **הבאג שעלה בלידים חודשים.**
 *
 *  יוני נכנס ב-28.10 בשעה 14:30. ב-1.11 בשעה 08:40 הוא
 *  השאיר פרטים שוב. ההגעה השנייה נבלעה: לא נרשמה כניסה,
 *  התאריך לא התעדכן, והליד נשאר עמוק ברשימה עם התאריך
 *  הישן - בזמן שביומן הקליטה הוא כן הופיע.
 *
 *  הסיבה: ההכרעה "הגעה או עדכון סטטוס" נשענה על **ערך
 *  הסטטוס**. ליד מנגר שולח סטטוס גם כשהוא משדר הגעה
 *  חדשה, ולכן הגעה אמיתית עם סטטוס "אין מענה" נקראה
 *  כעדכון.
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

/** הגשה אמיתית מליד מנגר - שדות טופס מלאים */
const submission = {
  full_name: "יוני כהן",
  email: "yoni@gmail.com",
  fb_campaign: "לוק אלייק 26.10.26",
  fb_ad: "מבצע סטינג 149",
  supplier_question: "hot",
};

/** עדכון סטטוס - טלפון וסטטוס בלבד */
const statusOnly = { phone: "0521234567", status: "אין מענה" };

/* ---------- התרחיש שלו ---------- */

test("יוני נכנס שוב בזמן שהסטטוס שלו 'אין מענה' - זו הגעה", () => {
  assert.equal(
    isStatusUpdate({
      incomingStatus: "אין מענה",
      hasSubmissionId: false,
      leadExists: true,
      extra: submission,
    }),
    false,
    "ההגעה נבלעה - הליד לא יחזור לראש הרשימה"
  );
});

test("וגם עם כל סטטוס מתקדם אחר", () => {
  for (const status of [
    "בטיפול",
    "נשלחה הצעת מחיר",
    "שיחת המשך",
    "לא מעוניין",
    "נסגר",
  ]) {
    assert.equal(
      isStatusUpdate({
        incomingStatus: status,
        hasSubmissionId: false,
        leadExists: true,
        extra: submission,
      }),
      false,
      `הגעה עם סטטוס "${status}" נבלעה`
    );
  }
});

/* ---------- ומה שאסור שישבר ---------- */

test("עדכון סטטוס אמיתי עדיין לא נחשב הגעה", () => {
  assert.equal(
    isStatusUpdate({
      incomingStatus: "אין מענה",
      hasSubmissionId: false,
      leadExists: true,
      extra: statusOnly,
    }),
    true,
    "כל שינוי סטטוס יקפיץ את הליד ויסמן אותו כפול"
  );
});

test("ליד חדש הוא תמיד הגעה", () => {
  assert.equal(
    isStatusUpdate({
      incomingStatus: "אין מענה",
      hasSubmissionId: false,
      leadExists: false,
      extra: statusOnly,
    }),
    false
  );
});

test("מזהה הגשה מפייסבוק גובר על הכל", () => {
  assert.equal(
    isStatusUpdate({
      incomingStatus: "נסגר",
      hasSubmissionId: true,
      leadExists: true,
      extra: statusOnly,
    }),
    false
  );
});

test("עדכון עם סטטוס התחלתי אינו עדכון", () => {
  assert.equal(
    isStatusUpdate({
      incomingStatus: "חדש",
      hasSubmissionId: false,
      leadExists: true,
      extra: statusOnly,
    }),
    false
  );
});

/* ---------- זיהוי תוכן הטופס ---------- */

test("שני שדות טופס מספיקים", () => {
  assert.equal(
    hasSubmissionContent({ full_name: "יוני", email: "a@b.com" }),
    true
  );
});

test("שדה אחד אינו מספיק", () => {
  assert.equal(hasSubmissionContent({ full_name: "יוני" }), false);
});

test("שדות ריקים לא נספרים", () => {
  assert.equal(
    hasSubmissionContent({
      full_name: "",
      email: "   ",
      fb_campaign: "",
      address: "",
    }),
    false,
    "עמודות ריקות מליד מנגר נספרו כתוכן טופס"
  );
});

test("טלפון וסטטוס בלבד אינם תוכן טופס", () => {
  assert.equal(hasSubmissionContent(statusOnly), false);
});

test("ריק לא מפיל", () => {
  assert.equal(hasSubmissionContent(null), false);
  assert.equal(hasSubmissionContent(undefined), false);
  assert.equal(hasSubmissionContent({}), false);
});

/* ---------- החיווט בפועל ---------- */

const hook = io.readFileSync("app/api/webhooks/leadmanager/route.ts", "utf8");

test("הקליטה מעבירה את השדות להכרעה", () => {
  const at = hook.indexOf("isStatusUpdate({");
  const block = hook.slice(at, at + 600);
  assert.ok(
    block.includes("extra,"),
    "ההכרעה רצה בלי לראות את השדות, ולכן עדיין נשענת על הסטטוס"
  );
});

test("הגעה שאינה עדכון מעדכנת את תאריך הכניסה", () => {
  assert.ok(
    hook.includes("intakeAt: sameSubmission || isSaleNow ? undefined : new Date()"),
    "הליד לא יצוף לראש הרשימה"
  );
});

test("הגעה שאינה עדכון יוצרת כניסה", () => {
  const at = hook.indexOf("if (!sameSubmission) {");
  assert.ok(at > -1, "לא נרשמת כניסה, ולכן אין תווית 'כפול' ואין פירוט");
  assert.ok(hook.slice(at, at + 400).includes("db.leadEntry"));
});

/* ---------- הרשימה ---------- */

const page = io.readFileSync("app/page.tsx", "utf8");

test("הרשימה מציגה את אותו תאריך שהיא ממיינת לפיו", () => {
  assert.ok(
    page.includes("const mineAt = l.intakeAt;"),
    "התצוגה והמיון נשענים על שדות שונים - ליד יציג תאריך חדש וישב למטה"
  );
  assert.ok(page.includes('orderBy: [{ intakeAt: "desc" }'));
});

console.log(`✓ repeat-arrival: ${passed} בדיקות עברו`);
