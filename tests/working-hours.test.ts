/**
 * בדיקות לשעות הפעילות.
 * זה החלק שקובע שלקוח לא יקבל הודעה ב-3 לפנות בוקר או בשבת.
 */
import {
  isWithinWorkingHours,
  shiftToWorkingHours,
  israelParts,
} from "../lib/working-hours";

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

/** בונה תאריך מתוך שעה בשעון ישראל, לצורך הבדיקות בלבד */
function il(iso: string): Date {
  return new Date(iso);
}

/** מציג תאריך בשעון ישראל בפורמט קריא */
function show(d: Date): string {
  const p = israelParts(d);
  const hh = String(Math.floor(p.minutes / 60)).padStart(2, "0");
  const mm = String(p.minutes % 60).padStart(2, "0");
  const days = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  return `${days[p.weekday]} ${p.day}/${p.month} ${hh}:${mm}`;
}

// יולי 2026 - שעון קיץ, ישראל ב-UTC+3
console.log("\nזיהוי שעות פעילות");
check("רביעי 10:00 - בתוך", isWithinWorkingHours(il("2026-07-29T07:00:00Z")), true);
check("רביעי 07:00 - לפני הפתיחה", isWithinWorkingHours(il("2026-07-29T04:00:00Z")), false);
check("רביעי 19:00 - אחרי הסגירה", isWithinWorkingHours(il("2026-07-29T16:00:00Z")), false);
check("רביעי 18:29 - בתוך", isWithinWorkingHours(il("2026-07-29T15:29:00Z")), true);
check("רביעי 18:30 - סגור", isWithinWorkingHours(il("2026-07-29T15:30:00Z")), false);
check("שישי 10:00 - בתוך", isWithinWorkingHours(il("2026-07-31T07:00:00Z")), true);
check("שישי 08:00 - לפני הפתיחה", isWithinWorkingHours(il("2026-07-31T05:00:00Z")), false);
check("שישי 15:00 - אחרי הסגירה", isWithinWorkingHours(il("2026-07-31T12:00:00Z")), false);
check("שבת 10:00 - סגור", isWithinWorkingHours(il("2026-08-01T07:00:00Z")), false);

console.log("\nדחייה לחלון העבודה הבא");
check(
  "בתוך שעות - לא זז",
  show(shiftToWorkingHours(il("2026-07-29T07:00:00Z"))),
  "ד 29/7 10:00"
);
check(
  "לפנות בוקר רביעי -> אותו יום 08:00",
  show(shiftToWorkingHours(il("2026-07-29T00:00:00Z"))),
  "ד 29/7 08:00"
);
check(
  "רביעי בערב -> חמישי 08:00",
  show(shiftToWorkingHours(il("2026-07-29T18:00:00Z"))),
  "ה 30/7 08:00"
);
check(
  "שישי אחה\"צ -> ראשון 08:00",
  show(shiftToWorkingHours(il("2026-07-31T13:00:00Z"))),
  "א 2/8 08:00"
);
check(
  "שבת -> ראשון 08:00",
  show(shiftToWorkingHours(il("2026-08-01T09:00:00Z"))),
  "א 2/8 08:00"
);
check(
  "שישי מוקדם -> שישי 08:30",
  show(shiftToWorkingHours(il("2026-07-31T04:00:00Z"))),
  "ו 31/7 08:30"
);

console.log("\nשעון חורף (ינואר, ישראל ב-UTC+2)");
check(
  "חמישי בערב בחורף -> שישי 08:30",
  show(shiftToWorkingHours(il("2027-01-14T18:00:00Z"))),
  "ו 15/1 08:30"
);
check(
  "חמישי 10:00 בחורף - בתוך",
  isWithinWorkingHours(il("2027-01-14T08:00:00Z")),
  true
);

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
