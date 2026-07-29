/** בדיקות לניסוח "מתי אני חוזר לעבוד" */
import { nextWorkingPhrase } from "../lib/working-hours";

let passed = 0, failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else {
    failed++;
    console.log(`  ✗ ${label}  התקבל "${actual}" ציפינו "${expected}"`);
  }
}

console.log("\nניסוח יום העבודה הבא (יולי 2026, שעון קיץ +3)");

// רביעי 29.7 בשעה 19:20 בישראל = 16:20 UTC
check("רביעי 19:20 -> מחר בבוקר", nextWorkingPhrase(new Date("2026-07-29T16:20:00Z")), "מחר בבוקר");

// חמישי 30.7 בשעה 20:00 בישראל
check("חמישי בערב -> מחר בבוקר", nextWorkingPhrase(new Date("2026-07-30T17:00:00Z")), "מחר בבוקר");

// שישי 31.7 בשעה 17:00 בישראל - שבת סגור, אז ראשון
check("שישי אחה\"צ -> ביום ראשון", nextWorkingPhrase(new Date("2026-07-31T14:00:00Z")), "ביום ראשון");

// שבת 1.8 בשעה 12:00 בישראל -> ראשון, שזה מחר
check("שבת -> מחר בבוקר", nextWorkingPhrase(new Date("2026-08-01T09:00:00Z")), "מחר בבוקר");

// רביעי 10:00 - בתוך שעות
check("בתוך שעות -> היום", nextWorkingPhrase(new Date("2026-07-29T07:00:00Z")), "היום");

// רביעי 03:00 לפנות בוקר - נפתח היום ב-8
check("לפנות בוקר -> היום", nextWorkingPhrase(new Date("2026-07-29T00:00:00Z")), "היום");

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
