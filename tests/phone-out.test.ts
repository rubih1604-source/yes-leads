import assert from "node:assert/strict";
import { buildPayload } from "../lib/delivery-payload";
import { hookBody } from "../lib/hook-payload";

/**
 * ============================================================
 *  נעילה על פורמט הטלפון שיוצא לקונה
 * ============================================================
 *
 *  במסד המספר נשמר כ-+972521234567, כי זה מפתח הזיהוי
 *  הייחודי של הליד. אלעד קיבל אותו בדיוק כך, וזה מספר
 *  שצריך לתקן ביד לפני חיוג.
 *
 *  מכאן והלאה יוצא הפורמט המקומי - 0521234567 - בשני
 *  המסלולים: גם בשליחה לערוץ וגם בהעברת סטטוס.
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

const at = new Date("2026-10-26T09:00:00Z");

const lead = (phone: string) => ({
  firstName: "דנה",
  lastName: "כהן",
  phone,
  status: "חדש",
  extra: { email: "dana@gmail.com" },
});

/* ---------- המסלול של השליחה לערוץ ---------- */

test("מספר נייד יוצא בפורמט מקומי", () => {
  assert.equal(buildPayload(lead("+972521234567"), at).phone, "0521234567");
});

test("מספר קווי יוצא בפורמט מקומי", () => {
  assert.equal(buildPayload(lead("+97237654321"), at).phone, "037654321");
});

test("מספר שנשמר בלי פלוס גם מתוקן", () => {
  assert.equal(buildPayload(lead("972521234567"), at).phone, "0521234567");
});

test("מספר שכבר מקומי נשאר כמו שהוא", () => {
  assert.equal(buildPayload(lead("0521234567"), at).phone, "0521234567");
});

test("אין מקפים במה שיוצא - הקונה מזין את זה למערכת שלו", () => {
  const out = buildPayload(lead("+972521234567"), at).phone;
  assert.ok(!out.includes("-"), `יצאו מקפים: ${out}`);
  assert.ok(!out.includes(" "), `יצאו רווחים: ${out}`);
});

test("אין קידומת במה שיוצא", () => {
  const out = buildPayload(lead("+972521234567"), at).phone;
  assert.ok(!out.includes("+"), `יצא פלוס: ${out}`);
  assert.ok(!out.startsWith("972"), `יצאה קידומת: ${out}`);
});

/* ---------- המסלול של העברת סטטוס ---------- */

test("העברת סטטוס שולחת את הפורמט המקומי", () => {
  const body = JSON.parse(
    hookBody({ lead: lead("+972521234567"), at, statusName: "הועבר לאלעד" })
  );
  assert.equal(body.phone, "0521234567");
});

test("תבנית אלעד - {phone} מתמלא בפורמט המקומי", () => {
  /** בדיוק המבנה שמוגדר בערוץ שלו */
  const template =
    '{"name":"{full_name}","phone":"{phone}","email":"{email}","engagement_score":"90","notes":"{ad}"}';

  const body = JSON.parse(
    hookBody({
      lead: lead("+972521234567"),
      at,
      statusName: "הועבר לאלעד",
      template,
    })
  );

  assert.equal(body.phone, "0521234567");
  assert.equal(body.name, "דנה כהן");
  assert.equal(body.engagement_score, "90");
});

/* ---------- מה שלא נגעו בו ---------- */

test("שאר השדות לא נפגעו", () => {
  const p = buildPayload(lead("+972521234567"), at);
  assert.equal(p.full_name, "דנה כהן");
  assert.equal(p.email, "dana@gmail.com");
  assert.equal(p.created_at, "2026-10-26T09:00:00.000Z");
});

test("מספר ריק לא מפיל את הבנייה", () => {
  const p = buildPayload({ ...lead(""), phone: "" }, at);
  assert.equal(typeof p.phone, "string");
});

console.log(`✓ phone-out: ${passed} בדיקות עברו`);
