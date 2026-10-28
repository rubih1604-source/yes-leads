import assert from "node:assert/strict";
import {
  splitName,
  joinName,
  hasRepeatedSurname,
} from "../lib/person-name";
import { mapLeadManagerPayload } from "../lib/leadmanager-mapping";
import { withCanonicalFields } from "../lib/field-aliases";

/**
 * ============================================================
 *  נעילה על "יאיר סרוסי סרוסי"
 * ============================================================
 *
 *  הטופס שולח שם מלא ושם משפחה, והמיפוי לקח את השם המלא
 *  כשם פרטי. התצוגה חיברה אותם, ושם המשפחה הופיע פעמיים -
 *  גם ברשימת הלידים, גם בכרטיס, וגם אצל הקונה.
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

/* ---------- הבאג עצמו ---------- */

test("שם מלא + שם משפחה לא מכפילים את שם המשפחה", () => {
  const n = splitName({ full: "יאיר סרוסי", last: "סרוסי" });
  assert.equal(joinName(n.firstName, n.lastName), "יאיר סרוסי");
});

test("גם כשהשם המלא הגיע כשם פרטי", () => {
  const n = splitName({ first: "אורנה לוי", last: "לוי" });
  assert.equal(n.firstName, "אורנה");
  assert.equal(n.lastName, "לוי");
  assert.equal(joinName(n.firstName, n.lastName), "אורנה לוי");
});

test("שם משפחה משתי מילים לא מוכפל", () => {
  const n = splitName({ first: "משה בן דוד", last: "בן דוד" });
  assert.equal(joinName(n.firstName, n.lastName), "משה בן דוד");
});

test("שם שכבר נשמר שבור פעמיים מתנקה עד הסוף", () => {
  const n = splitName({ first: "יאיר סרוסי סרוסי", last: "סרוסי" });
  assert.equal(joinName(n.firstName, n.lastName), "יאיר סרוסי");
});

/* ---------- מה שאסור שישבר ---------- */

test("שם פרטי ומשפחה תקינים לא נוגעים בהם", () => {
  const n = splitName({ first: "דנה", last: "כהן" });
  assert.equal(n.firstName, "דנה");
  assert.equal(n.lastName, "כהן");
});

test("שם פרטי שזהה לשם המשפחה נשאר - זה פשוט השם", () => {
  const n = splitName({ first: "לוי", last: "לוי" });
  assert.equal(joinName(n.firstName, n.lastName), "לוי לוי");
});

test("ההסרה על גבול מילה בלבד", () => {
  const n = splitName({ first: "אבי רוזן", last: "רוזנברג" });
  assert.equal(n.firstName, "אבי רוזן");
  assert.equal(n.lastName, "רוזנברג");
});

test("שם משפחה שהוא סיומת של מילה אחת לא נחתך", () => {
  const n = splitName({ first: "דני", last: "ני" });
  assert.equal(n.firstName, "דני");
});

test("שם מלא לבד מפוצל כמו תמיד", () => {
  const n = splitName({ full: "שרה פרידמן" });
  assert.equal(n.firstName, "שרה");
  assert.equal(n.lastName, "פרידמן");
});

test("שם מלא משלוש מילים - השאר הוא שם המשפחה", () => {
  const n = splitName({ full: "משה בן דוד" });
  assert.equal(n.firstName, "משה");
  assert.equal(n.lastName, "בן דוד");
});

test("שם פרטי מפורש גובר על השם המלא", () => {
  const n = splitName({ full: "יאיר סרוסי", first: "יאיר" });
  assert.equal(n.firstName, "יאיר");
});

test("מילה אחת בלבד - אין שם משפחה מומצא", () => {
  const n = splitName({ full: "מאיר" });
  assert.equal(n.firstName, "מאיר");
  assert.equal(n.lastName, null);
});

test("ריק נשאר ריק ולא הופך למחרוזת ריקה", () => {
  const n = splitName({});
  assert.equal(n.firstName, null);
  assert.equal(n.lastName, null);
});

test("רווחים כפולים מתנקים", () => {
  const n = splitName({ full: "  שרה   פרידמן  " });
  assert.equal(n.firstName, "שרה");
  assert.equal(n.lastName, "פרידמן");
});

/* ---------- דרך המיפוי האמיתי של ליד מנגר ---------- */

test("המטען שיצר את הבאג נכנס נכון", () => {
  const m = mapLeadManagerPayload({
    phone: "0521234567",
    full_name: "יאיר סרוסי",
    last_name: "סרוסי",
  });

  assert.equal(joinName(m.firstName, m.lastName), "יאיר סרוסי");
});

test("שדה name נחשב שם מלא ולא שם פרטי", () => {
  const m = mapLeadManagerPayload({ phone: "0521234567", name: "אורנה לוי" });
  assert.equal(m.firstName, "אורנה");
  assert.equal(m.lastName, "לוי");
});

test("first_name מפורש עדיין גובר", () => {
  const m = mapLeadManagerPayload({
    phone: "0521234567",
    first_name: "דנה",
    last_name: "כהן",
    full_name: "דנה כהן",
  });

  assert.equal(m.firstName, "דנה");
  assert.equal(m.lastName, "כהן");
});

test("הטלפון והסטטוס לא נפגעו", () => {
  const m = mapLeadManagerPayload({
    phone: "0521234567",
    status: "חדש",
    name: "דנה כהן",
  });

  assert.equal(m.phone, "0521234567");
  assert.equal(m.status, "חדש");
});

/* ---------- דרך זיהוי השדות בעברית ---------- */

test("טופס עברי עם שם מלא ושם משפחה", () => {
  const out = withCanonicalFields({
    "שם_מלא": "יאיר סרוסי",
    "שם_משפחה": "סרוסי",
  });

  assert.equal(joinName(out.first_name, out.last_name), "יאיר סרוסי");
});

test("טופס עברי עם שם מלא בלבד מתפצל כמו קודם", () => {
  const out = withCanonicalFields({ "שם_מלא": "שרה פרידמן" });
  assert.equal(out.first_name, "שרה");
  assert.equal(out.last_name, "פרידמן");
});

test("השדה המקורי בעברית נשמר ולא נמחק", () => {
  const out = withCanonicalFields({ "שם_מלא": "שרה פרידמן" });
  assert.equal(out["שם_מלא"], "שרה פרידמן");
});

/* ---------- הזיהוי של שם שבור ---------- */

test("מזהה שם שבור", () => {
  assert.equal(hasRepeatedSurname("יאיר סרוסי", "סרוסי"), true);
  assert.equal(hasRepeatedSurname("אורנה לוי", "לוי"), true);
});

test("לא מסמן שם תקין כשבור", () => {
  assert.equal(hasRepeatedSurname("יאיר", "סרוסי"), false);
  assert.equal(hasRepeatedSurname("לוי", "לוי"), false);
  assert.equal(hasRepeatedSurname("אבי רוזן", "רוזנברג"), false);
  assert.equal(hasRepeatedSurname(null, "כהן"), false);
  assert.equal(hasRepeatedSurname("דנה", null), false);
});

console.log(`✓ person-name: ${passed} בדיקות עברו`);
