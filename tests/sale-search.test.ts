/**
 * בדיקות לחיפוש במסך המכירה.
 * הרצה:  npx tsx tests/sale-search.test.ts
 */

import { matchesQuery } from "../lib/sale-search";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`      ציפינו: ${JSON.stringify(expected)}`);
    console.log(`      קיבלנו: ${JSON.stringify(actual)}`);
  }
}

const entry = { campaign: "גאוגרפי דרום" };
const lead = {
  phone: "+972521234567",
  firstName: "דנה",
  lastName: "כהן",
  status: "נשלחה הצעת מחיר",
  extra: { email: "dana.cohen@gmail.com", address: "הרצל 5 תל אביב" },
};

const m = (q: string) => matchesQuery(entry, lead, q);

console.log("\nחיפוש לפי שם");
{
  check("שם פרטי", m("דנה"), true);
  check("שם משפחה", m("כהן"), true);
  check("שם מלא", m("דנה כהן"), true);
  check("חלק משם", m("כה"), true);
  check("שם אחר", m("רינת"), false);
}

console.log("\nחיפוש לפי טלפון — בכל כתיב");
{
  check("איך שהוא שמור", m("+972521234567"), true);
  check("איך שאתה מקליד", m("0521234567"), true);
  check("עם מקפים", m("052-123-4567"), true);
  check("סוף המספר", m("1234567"), true);
  check("מספר אחר", m("0529999999"), false);
}

console.log("\nחיפוש לפי מייל וקמפיין");
{
  check("מייל מלא", m("dana.cohen@gmail.com"), true);
  check("חלק מהמייל", m("dana.cohen"), true);
  check("לא תלוי אותיות גדולות", m("DANA.COHEN@GMAIL.COM"), true);
  check("קמפיין", m("גאוגרפי"), true);
  check("סטטוס", m("הצעת מחיר"), true);
  check("כתובת", m("הרצל"), true);
}

console.log("\nכמה מילים = וגם");
{
  check("שם + קמפיין", m("דנה גאוגרפי"), true);
  check("שם + קמפיין לא נכון", m("דנה צפון"), false);
  check("שם + טלפון", m("דנה 0521234567"), true);
  check("רווחים מיותרים", m("  דנה   כהן  "), true);
}

console.log("\nמקרי קצה");
{
  const empty = {
    phone: "+972500000000",
    firstName: null,
    lastName: null,
    status: "חדש",
    extra: null,
  };
  check(
    "ליד בלי שם ובלי מייל לא מפיל כלום",
    matchesQuery({ campaign: null }, empty, "דנה"),
    false
  );
  check(
    "ליד בלי שם נמצא לפי טלפון",
    matchesQuery({ campaign: null }, empty, "0500000000"),
    true
  );
  check("חיפוש ריק מחזיר הכל", m(""), true);
}

console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
