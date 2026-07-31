/** בדיקות לזיהוי לקוח קיים לפי שאלת הספק */
import { looksLikeExistingCustomer, extractExtraFields } from "../lib/leadmanager-mapping";

let passed = 0, failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++; console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}  התקבל ${JSON.stringify(actual)} ציפינו ${JSON.stringify(expected)}`);
  }
}

console.log("\nזיהוי לקוח קיים לפי שאלת הספק");
check("yes", looksLikeExistingCustomer({ supplier_question: "yes" }), true);
check("סטינג", looksLikeExistingCustomer({ supplier_question: "סטינג" }), true);
check("sting", looksLikeExistingCustomer({ supplier_question: "sting" }), true);
check("יס", looksLikeExistingCustomer({ supplier_question: "יס" }), true);
check("yes\\sting", looksLikeExistingCustomer({ supplier_question: "yes\\sting" }), true);
check("yes/sting", looksLikeExistingCustomer({ supplier_question: "yes/sting" }), true);
check("אחר-yes", looksLikeExistingCustomer({ supplier_question: "אחר-yes" }), true);

console.log("\nספקים אחרים לא מזוהים בטעות");
check("הוט", looksLikeExistingCustomer({ supplier_question: "הוט" }), false);
check("סלקום", looksLikeExistingCustomer({ supplier_question: "סלקום" }), false);
check("פרטנר", looksLikeExistingCustomer({ supplier_question: "פרטנר" }), false);
check("ללא\\ספק", looksLikeExistingCustomer({ supplier_question: "אחר\\ללא_ספק" }), false);
check("שדה ריק", looksLikeExistingCustomer({}), false);

console.log("\nאיסוף שדות הקמפיין");
const extra = extractExtraFields({
  phone: "0501234567",
  full_name: "חיים",
  status: "חדש",
  token: "secret",
  supplier_question: "הוט",
  fb_campaign: "קמפיין לידים 15/7",
  fb_ad: "מודעה א",
  price: "",
  _method: "POST",
});
check("שדות ליבה מסוננים", extra.phone, undefined);
check("טוקן מסונן", extra.token, undefined);
check("שדות פנימיים מסוננים", extra._method, undefined);
check("שאלת ספק נשמרת", extra.supplier_question, "הוט");
check("קמפיין נשמר", extra.fb_campaign, "קמפיין לידים 15/7");
check("מודעה נשמרת", extra.fb_ad, "מודעה א");
check("ערך ריק לא נשמר", extra.price, undefined);

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");

// ---- קהל היעד של מבצע ----
import { readTargets, hasAnyTarget } from "../lib/offer-targets";

console.log("\nקהל היעד של מבצע");
{
  let p2 = 0, f2 = 0;
  const c = (label: string, a: unknown, e: unknown) => {
    if (JSON.stringify(a) === JSON.stringify(e)) { p2++; console.log(`  ✓ ${label}`); }
    else { f2++; console.log(`  ✗ ${label} התקבל ${JSON.stringify(a)} ציפינו ${JSON.stringify(e)}`); }
  };

  c("מבנה מסודר", readTargets({ statuses: ["אין מענה"], subStatuses: ["חשוב ללקוח ספורט"] }),
    { statuses: ["אין מענה"], subStatuses: ["חשוב ללקוח ספורט"] });

  c("מבנה ישן - מערך שטוח", readTargets(["חשוב ללקוח ספורט"]),
    { statuses: [], subStatuses: ["חשוב ללקוח ספורט"] });

  c("ריק", readTargets(null), { statuses: [], subStatuses: [] });
  c("ערכים לא תקינים מסוננים", readTargets({ statuses: [1, "", "אין מענה"] }),
    { statuses: ["אין מענה"], subStatuses: [] });

  c("יש יעד", hasAnyTarget({ statuses: ["אין מענה"], subStatuses: [] }), true);
  c("אין יעד", hasAnyTarget({ statuses: [], subStatuses: [] }), false);

  console.log(`  (${p2} עברו, ${f2} נכשלו)`);
}
