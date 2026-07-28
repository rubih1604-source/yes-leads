/**
 * בדיקות ללוגיקה הקריטית שרצה על כל ליד שנכנס.
 * הרצה:  npx tsx tests/logic.test.ts
 */
import { normalizePhone, displayPhone } from "../lib/phone";
import { mapLeadManagerPayload } from "../lib/leadmanager-mapping";

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

console.log("\nנרמול מספרי טלפון");
check("מספר ישראלי רגיל", normalizePhone("0521234567"), "+972521234567");
check("עם מקפים", normalizePhone("052-123-4567"), "+972521234567");
check("עם רווחים", normalizePhone("052 123 4567"), "+972521234567");
check("כבר בינלאומי", normalizePhone("+972521234567"), "+972521234567");
check("בינלאומי בלי פלוס", normalizePhone("972521234567"), "+972521234567");
check("עם 00 בהתחלה", normalizePhone("00972521234567"), "+972521234567");
check("בלי אפס מוביל", normalizePhone("521234567"), "+972521234567");
check("קו נייח", normalizePhone("03-1234567"), "+97231234567");
check("ריק מחזיר null", normalizePhone(""), null);
check("null מחזיר null", normalizePhone(null), null);
check("זבל מחזיר null", normalizePhone("abc"), null);
check("קצר מדי מחזיר null", normalizePhone("0521"), null);

console.log("\nכל הווריאציות מגיעות לאותו מספר");
const variants = ["0521234567", "052-123-4567", "+972521234567", "972521234567", "00972-52-1234567"];
const results = variants.map((v) => normalizePhone(v));
check("חמש כתיבות שונות = מספר אחד", new Set(results).size, 1);

console.log("\nתצוגת טלפון");
check("מוצג בפורמט ישראלי", displayPhone("+972521234567"), "052-123-4567");

console.log("\nקריאת webhook מליד מנגר");
check(
  "שדות באנגלית",
  mapLeadManagerPayload({ phone: "0521234567", first_name: "חיים", status: "אין מענה" }),
  { phone: "0521234567", firstName: "חיים", lastName: null, status: "אין מענה", source: null }
);
check(
  "שדות בעברית",
  mapLeadManagerPayload({ "טלפון": "0521234567", "שם": "חיים", "סטטוס": "אין מענה" }),
  { phone: "0521234567", firstName: "חיים", lastName: null, status: "אין מענה", source: null }
);
check(
  "שדות מקוננים בתוך אובייקט",
  mapLeadManagerPayload({ event: "status_change", lead: { mobile: "0521234567", name: "חיים" }, status: "אין מענה" }),
  { phone: "0521234567", firstName: "חיים", lastName: null, status: "אין מענה", source: null }
);
check(
  "payload שלא מכירים לא מפיל את המערכת",
  mapLeadManagerPayload({ something: "else" }),
  { phone: null, firstName: null, lastName: null, status: null, source: null }
);
check("null לא מפיל", mapLeadManagerPayload(null), {
  phone: null, firstName: null, lastName: null, status: null, source: null,
});

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");

if (failed > 0) process.exit(1);
