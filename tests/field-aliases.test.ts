import assert from "node:assert/strict";
import {
  normalizeFieldName,
  canonicalFieldOf,
  withCanonicalFields,
} from "../lib/field-aliases";

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

const eq = assert.equal;
const ok = (v: unknown) => assert.ok(v);

/* ---------- התרחיש האמיתי שנפל ---------- */

test("הליד של שרה פרידמן נקלט במלואו", () => {
  const raw = {
    _source: "facebook",
    fb_form: "1743218057232469",
    fb_leadid: "2143371133236798",
    'דוא"ל': "sorele1916@gmail.com",
    fb_platform: "fb",
    שם_מלא: "שרה פרידמן",
    phone_number: "+972584011330",
  };

  const out = withCanonicalFields(raw);

  eq(out.full_name, "שרה פרידמן");
  eq(out.first_name, "שרה");
  eq(out.last_name, "פרידמן");
  eq(out.email, "sorele1916@gmail.com");
  eq(out.phone, "+972584011330");
});

test("השדות המקוריים לא נמחקים", () => {
  const out = withCanonicalFields({ שם_מלא: "שרה פרידמן" });
  eq(out["שם_מלא"], "שרה פרידמן");
});

/* ---------- נרמול ---------- */

test("קו תחתון, רווח ומקף נחשבים זהים", () => {
  const a = normalizeFieldName("שם_מלא");
  eq(normalizeFieldName("שם מלא"), a);
  eq(normalizeFieldName("שם-מלא"), a);
});

test("מרכאות וסימן שאלה לא מפריעים", () => {
  eq(canonicalFieldOf('דוא"ל'), "email");
  eq(canonicalFieldOf("מה השם שלך?"), "full_name");
});

test("רישיות לא משנה", () => {
  eq(canonicalFieldOf("Email"), "email");
  eq(canonicalFieldOf("FULL_NAME"), "full_name");
});

/* ---------- זיהוי ---------- */

test("שמות עבריים מזוהים", () => {
  eq(canonicalFieldOf("שם_מלא"), "full_name");
  eq(canonicalFieldOf("אימייל"), "email");
  eq(canonicalFieldOf("מספר טלפון"), "phone");
  eq(canonicalFieldOf("שם משפחה"), "last_name");
});

test("שמות אנגליים ממשיכים לעבוד", () => {
  eq(canonicalFieldOf("full_name"), "full_name");
  eq(canonicalFieldOf("phone_number"), "phone");
  eq(canonicalFieldOf("email"), "email");
});

test("שאלת ספק מזוהה גם בניסוח חופשי", () => {
  eq(canonicalFieldOf("מי ספק התקשורת שלכם היום?"), "supplier_question");
  eq(canonicalFieldOf("איזה ספק יש לכם"), "supplier_question");
});

test("שדה לא מוכר מוחזר null ולא מנוחש", () => {
  eq(canonicalFieldOf("האם יש לכם כיום מנוי טלוויזיה"), null);
  eq(canonicalFieldOf("hobby"), null);
});

test("שם החברה לא נקלט כשם הלקוח", () => {
  eq(canonicalFieldOf("שם החברה"), null);
  const out = withCanonicalFields({ "שם החברה": "בזק" });
  eq(out.full_name, undefined);
});

/* ---------- פיצול שם ---------- */

test("שם מלא מפוצל לפרטי ומשפחה", () => {
  const out = withCanonicalFields({ full_name: "שרה פרידמן" });
  eq(out.first_name, "שרה");
  eq(out.last_name, "פרידמן");
});

test("שם משולש - כל השאר הוא שם משפחה", () => {
  const out = withCanonicalFields({ full_name: "ראובן שלמה חגג" });
  eq(out.first_name, "ראובן");
  eq(out.last_name, "שלמה חגג");
});

test("שם אחד בלבד לא ממציא שם משפחה", () => {
  const out = withCanonicalFields({ full_name: "שרה" });
  eq(out.first_name, "שרה");
  eq(out.last_name, undefined);
});

test("שם פרטי שהגיע במפורש לא נדרס", () => {
  const out = withCanonicalFields({
    full_name: "שרה פרידמן",
    first_name: "שרי",
  });
  eq(out.first_name, "שרי");
});

/* ---------- בטיחות ---------- */

test("ערך ריק לא נכנס", () => {
  const out = withCanonicalFields({ שם_מלא: "   " });
  eq(out.full_name, undefined);
});

test("רשומה ריקה לא מפילה", () => {
  eq(Object.keys(withCanonicalFields({})).length, 0);
});

test("ערך מפורש גובר על ערך שנגזר", () => {
  const out = withCanonicalFields({ email: "real@x.com", אימייל: "other@x.com" });
  eq(out.email, "real@x.com");
});

console.log(`✓ field-aliases: ${passed} בדיקות עברו`);
