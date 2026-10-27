import assert from "node:assert/strict";
import io from "node:fs";
import {
  sentFieldsOf,
  renderTemplate,
  buildPayload,
} from "../lib/delivery-payload";

/**
 * ============================================================
 *  נעילה על "מה בדיוק נשלח"
 * ============================================================
 *
 *  היומן רשם את המטען *לפני* התבנית. לכן ערוץ עם תבנית
 *  של 3 שדות הציג 12 שדות, ועם ערכים שהקונה מעולם לא
 *  קיבל.
 *
 *  מסך שנועד לענות על "מה בדיוק קיבל הקונה" ענה על משהו
 *  אחר, ואי אפשר היה לדעת את זה בלי לשאול את הקונה.
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

const at = new Date("2026-10-26T21:10:01.620Z");

const lead = {
  firstName: "אורנה לוי",
  lastName: "לוי",
  phone: "+972529426318",
  status: "חדש",
  extra: {
    email: "levorna@gmail.com",
    fb_campaign: "קמפיין ממירים- 25.10.26",
    fb_ad: "קמפיין ממירים- 25.10.26",
    fb_leadid: "2274620683393506",
    supplier_question: "פרטנר",
  },
};

/** בדיוק התבנית של הערוץ "אלעד בלי שדה מודעה" */
const template =
  '{"name":"{full_name}","phone":"{phone}","email":"{email}"}';

/* ---------- הבאג עצמו ---------- */

test("תבנית של 3 שדות נרשמת כ-3 שדות, לא כ-12", () => {
  const payload = buildPayload(lead, at);
  const body = renderTemplate(template, payload);
  const logged = sentFieldsOf(body, false);

  assert.equal(
    Object.keys(logged).length,
    3,
    `נרשמו ${Object.keys(logged).length} שדות במקום 3`
  );
});

test("היומן מראה את שמות השדות של הקונה, לא של המערכת", () => {
  const body = renderTemplate(template, buildPayload(lead, at));
  const logged = sentFieldsOf(body, false);

  assert.deepEqual(Object.keys(logged).sort(), ["email", "name", "phone"]);
  assert.equal(logged.full_name, undefined);
  assert.equal(logged.fb_leadid, undefined);
});

test("הערכים ביומן הם מה שהקונה קיבל", () => {
  const logged = sentFieldsOf(
    renderTemplate(template, buildPayload(lead, at)),
    false
  );

  assert.equal(logged.name, "אורנה לוי לוי");
  assert.equal(logged.phone, "0529426318");
  assert.equal(logged.email, "levorna@gmail.com");
});

test("שדה קבוע בתבנית נרשם גם הוא", () => {
  const withConst =
    '{"name":"{full_name}","phone":"{phone}","engagement_score":"90","notes":"leadmanager"}';

  const logged = sentFieldsOf(
    renderTemplate(withConst, buildPayload(lead, at)),
    false
  );

  assert.equal(logged.engagement_score, "90");
  assert.equal(logged.notes, "leadmanager");
});

/* ---------- בלי תבנית ---------- */

test("בלי תבנית נרשם כל המטען, כמו שנשלח", () => {
  const payload = buildPayload(lead, at);
  const logged = sentFieldsOf(JSON.stringify(payload), false);

  assert.equal(Object.keys(logged).length, Object.keys(payload).length);
  assert.equal(logged.phone, "0529426318");
});

test("גוף form-encoded נרשם כשדות ולא כמחרוזת", () => {
  const logged = sentFieldsOf("name=%D7%93%D7%A0%D7%94&phone=0521234567", true);

  assert.equal(logged.phone, "0521234567");
  assert.equal(logged.name, "דנה");
});

/* ---------- הסוד לא נרשם ---------- */

test("token לא נרשם ביומן בערך האמיתי שלו", () => {
  const logged = sentFieldsOf(
    JSON.stringify({ phone: "0521234567", token: "sk-live-abc123" }),
    false
  );

  assert.equal(logged.token, "•••");
  assert.ok(!JSON.stringify(logged).includes("sk-live-abc123"));
});

test("גם api_key ו-secret מוסתרים", () => {
  const logged = sentFieldsOf(
    JSON.stringify({ api_key: "k1", "API-Key": "k2", secret: "s", password: "p" }),
    false
  );

  for (const key of Object.keys(logged)) {
    assert.equal(logged[key], "•••", `${key} לא הוסתר`);
  }
});

test("הסתרה גם בגוף form-encoded", () => {
  const logged = sentFieldsOf("phone=0521234567&token=abc", true);
  assert.equal(logged.token, "•••");
  assert.equal(logged.phone, "0521234567");
});

/* ---------- לא נופל על קלט מוזר ---------- */

test("גוף שאינו JSON נרשם כמו שהוא ולא נעלם", () => {
  const logged = sentFieldsOf("<xml>hello</xml>", false);
  assert.equal(logged.body, "<xml>hello</xml>");
});

test("גוף ריק לא מפיל", () => {
  assert.equal(typeof sentFieldsOf("", false), "object");
});

test("מערך לא מתפרש כשדות", () => {
  const logged = sentFieldsOf("[1,2,3]", false);
  assert.equal(logged.body, "[1,2,3]");
});

test("ערך מקונן נרשם כטקסט ולא כ-[object Object]", () => {
  const logged = sentFieldsOf(JSON.stringify({ meta: { a: 1 } }), false);
  assert.equal(logged.meta, '{"a":1}');
});

test("null נרשם כריק ולא נעלם מהרשימה", () => {
  const logged = sentFieldsOf(JSON.stringify({ address: null }), false);
  assert.ok("address" in logged);
  assert.equal(logged.address, "");
});

/* ---------- שהקוד באמת רושם את זה ---------- */

const delivery = io.readFileSync("lib/delivery.ts", "utf8");

test("השליחה רושמת ביומן את מה שיצא ולא את המטען הגולמי", () => {
  assert.ok(
    !delivery.includes("payload: payload as never"),
    "היומן חזר לרשום את המטען שלפני התבנית"
  );
  assert.ok(delivery.includes("payload: sentFields as never"));
});

test("הרישום קורה גם בהצלחה וגם בכישלון", () => {
  const hits = delivery.match(/payload: sentFields as never/g) ?? [];
  assert.equal(hits.length, 2, "חסר רישום באחד משני המסלולים");
});

test("גוף הבקשה נבנה לפני ה-try, כדי שגם כישלון יירשם", () => {
  const bodyAt = delivery.indexOf("const body = template");
  const tryAt = delivery.indexOf("  try {");
  assert.ok(bodyAt > -1 && tryAt > -1);
  assert.ok(bodyAt < tryAt, "הגוף נבנה בתוך ה-try ולא יהיה זמין לרישום");
});

console.log(`✓ sent-log: ${passed} בדיקות עברו`);
