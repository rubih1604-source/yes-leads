/**
 * בדיקות ללוגיקה של חיבור טקסטר.
 * הרצה:  npx tsx tests/texter.test.ts
 */
import { toTexterPhone, parseTemplates } from "../lib/texter";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      התקבל:  ${JSON.stringify(actual)}`);
    console.log(`      ציפינו: ${JSON.stringify(expected)}`);
  }
}

console.log("\nהמרת מספר לפורמט של טקסטר (בלי פלוס)");
check("מסיר את הפלוס", toTexterPhone("+972521234567"), "972521234567");
check("בלי פלוס נשאר כמו שהוא", toTexterPhone("972521234567"), "972521234567");
check("מסיר מקפים", toTexterPhone("+972-52-123-4567"), "972521234567");
check("מסיר רווחים", toTexterPhone("+972 52 123 4567"), "972521234567");

console.log("\nקריאת רשימת תבניות מטקסטר");

const flatArray = [
  { name: "inbox_marketing_1", body: "היי {{1}}, מדבר רובי" },
  { name: "inbox_marketing_5", body: "היי {{1}}, זה רובי" },
];
check("מערך פשוט", parseTemplates(flatArray).map((t) => t.name), [
  "inbox_marketing_1",
  "inbox_marketing_5",
]);
check("סופר משתנה אחד", parseTemplates(flatArray)[0].variableCount, 1);

check(
  "עטוף ב-data",
  parseTemplates({ data: flatArray }).map((t) => t.name),
  ["inbox_marketing_1", "inbox_marketing_5"]
);
check(
  "עטוף ב-templates",
  parseTemplates({ templates: flatArray }).map((t) => t.name),
  ["inbox_marketing_1", "inbox_marketing_5"]
);

check(
  "שם בשדה templateName",
  parseTemplates([{ templateName: "abc", text: "שלום" }]).map((t) => t.name),
  ["abc"]
);

const nested = [
  {
    name: "inbox_marketing_15",
    provider_template: {
      localizations: [{ body: "היי {{1}}, מה שלומך? {{2}}" }],
    },
  },
];
check("טקסט בתוך localizations", parseTemplates(nested)[0].bodyText, "היי {{1}}, מה שלומך? {{2}}");
check("סופר שני משתנים", parseTemplates(nested)[0].variableCount, 2);

check("בלי משתנים = 0", parseTemplates([{ name: "x", body: "טקסט קבוע" }])[0].variableCount, 0);
check("פריט בלי שם מסונן", parseTemplates([{ body: "אין שם" }]).length, 0);
check("תשובה לא מוכרת לא מפילה", parseTemplates({ weird: true }), []);
check("null לא מפיל", parseTemplates(null), []);

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
