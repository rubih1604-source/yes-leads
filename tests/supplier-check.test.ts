import assert from "node:assert/strict";
import io from "node:fs";
import {
  readSupplierAnswer,
  statesExistingCustomer,
  replyForAnswer,
  SUPPLIER_QUESTION,
  REPLY_IF_CUSTOMER,
  REPLY_IF_NOT_CUSTOMER,
} from "../lib/supplier-check";

/**
 * ============================================================
 *  נעילה על שאלת הסינון
 * ============================================================
 *
 *  קריאה שגויה של התשובה מסמנת לקוח אמיתי כ"לקוח קיים",
 *  שולחת לו *2080 במקום הצעה, ומוציאה אותו מהרשימה החמה.
 *  זה ליד שנזרק בלי שתדע.
 *
 *  לכן ברירת המחדל היא **לא להכריע**: בספק, הליד נשאר לך.
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

/* ---------- כן ---------- */

for (const text of [
  "כן",
  "כן בטח",
  "כן אני לקוח שלכם",
  "בטח",
  "yes",
  "אני ביס",
  "סטינג",
  "יש לי yes",
]) {
  test(`"${text}" נקרא כלקוח קיים`, () => {
    assert.equal(readSupplierAnswer(text), "yes", text);
  });
}

/* ---------- לא ---------- */

for (const text of [
  "לא",
  "לא לקוח",
  "אני לא",
  "לא, אני בהוט",
  "הוט",
  "פרטנר",
  "סלקום",
  "no",
  "free tv",
  "בזק",
]) {
  test(`"${text}" נקרא כלא לקוח`, () => {
    assert.equal(readSupplierAnswer(text), "no", text);
  });
}

/* ---------- שלילה גוברת ---------- */

test("'לא yes' נקרא כשלילה ולא כחיוב", () => {
  assert.equal(readSupplierAnswer("לא yes"), "no");
});

test("'לא yes אלא הוט' נקרא כשלילה", () => {
  assert.equal(readSupplierAnswer("לא yes אלא הוט"), "no");
});

/* ---------- מה שאסור להכריע ---------- */

for (const text of [
  "",
  "   ",
  "מה המחיר",
  "תתקשר אליי מחר",
  "👍",
  "אני צריך לבדוק",
  "תשלח לי פרטים",
]) {
  test(`"${text || "(ריק)"}" לא מוכרע - הליד נשאר לך`, () => {
    assert.equal(readSupplierAnswer(text), null, text);
  });
}

test("מילה בתוך מילה לא נספרת", () => {
  // "פיסיקה" מכיל יס, "אלא" מכיל לא
  assert.equal(readSupplierAnswer("פיסיקה"), null);
  assert.equal(readSupplierAnswer("אלא"), null);
});

/* ---------- התשובות ---------- */

test("לקוח קיים מקבל את מספר השירות", () => {
  assert.equal(replyForAnswer("yes"), REPLY_IF_CUSTOMER);
  assert.ok(REPLY_IF_CUSTOMER.includes("2080"));
});

test("מי שלא לקוח מקבל שחוזרים אליו", () => {
  assert.equal(replyForAnswer("no"), REPLY_IF_NOT_CUSTOMER);
});

test("בלי תשובה ברורה - לא נשלח כלום", () => {
  assert.equal(replyForAnswer(null), null);
});

test("השאלה היא בדיוק מה שביקשת", () => {
  assert.equal(
    SUPPLIER_QUESTION,
    "רגע לפני שאני יוצר איתכם קשר, האם אתם כיום לקוחות של yes/sting?"
  );
});


/* ============================================================
   הצהרה מפורשת מול תשובה לשאלה
   ============================================================

   לקוח קיבל דיוור שנגמר ב"אם אתם מעוניינים תרשמו לי" וכתב
   "כן". הבוט קרא את זה כתשובה לשאלת הסינון - שאלה שלא
   נשאלה - וענה "פנו ל*2080". ליד שרצה לקנות נשלח לשירות.

   מאז: רק שם של ספק מדלג על השאלה. "כן" תמיד מקבל אותה.
*/

const MUST_NOT_SKIP = [
  "כן",
  "כן מעוניין",
  "בטח",
  "אשמח",
  "לא",
  "מה המחיר",
  "יש לי הוט",
  "אני לא ביס",
  "אני לא לקוח של סטינג",
  "",
];

for (const t of MUST_NOT_SKIP) {
  test(`"${t || "(ריק)"}" לא מדלג על השאלה`, () => {
    assert.equal(statesExistingCustomer(t), false);
  });
}

const MUST_SKIP = [
  "יש לי כבר יס",
  "אני לקוח של יס",
  "אני בסטינג",
  "יש לי yes",
  "כבר יש לי סטינג",
];

for (const t of MUST_SKIP) {
  test(`"${t}" מדלג על השאלה`, () => {
    assert.equal(statesExistingCustomer(t), true);
  });
}

const botSource = io.readFileSync("lib/bot.ts", "utf8");

test("הבוט מדלג רק על הצהרה מפורשת", () => {
  assert.ok(botSource.includes("statesExistingCustomer(params.text)"));
});

test("הבוט כבר לא מדלג על סמך תשובה רחבה", () => {
  assert.ok(
    !/volunteered\s*=\s*decision\.askSupplier[\s\S]{0,60}readSupplierAnswer/.test(
      botSource
    ),
    '"כן" חזר לדלג על השאלה - לקוח מעוניין יישלח לשירות'
  );
});

console.log(`✓ supplier-check: ${passed} בדיקות עברו`);
