/** בדיקות לקביעת שעת חזרה מתוך הודעת לקוח */
import { resolveCallbackTime } from "../lib/callback-time";
import { israelParts } from "../lib/working-hours";

let passed = 0, failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}  התקבל ${actual} ציפינו ${expected}`); }
}

function hhmm(d: Date): string {
  const p = israelParts(d);
  return `${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(
    p.minutes % 60
  ).padStart(2, "0")}`;
}
function dayOf(d: Date): string {
  const p = israelParts(d);
  return `${p.day}/${p.month}`;
}

// רביעי 29.7.26 בשעה 11:00 בישראל (08:00 UTC)
const now = new Date("2026-07-29T08:00:00Z");

console.log("\nשעה מדויקת");
{
  const r = resolveCallbackTime({
    isoDateTime: "2026-08-03T10:00:00+03:00",
    confident: true,
    now,
  });
  check("יום שני ב-10:00", r ? hhmm(r.at) : null, "10:00");
  check("התאריך הנכון", r ? dayOf(r.at) : null, "3/8");
  check("מסומן כמדויק", r?.precise, true);
}

console.log("\nיום + חלק יום");
{
  const morning = resolveCallbackTime({ date: "2026-08-03", dayPart: "morning", now });
  check("יום שני בבוקר -> 09:30", morning ? hhmm(morning.at) : null, "09:30");
  check("בין 9 ל-10", morning ? hhmm(morning.at) >= "09:00" && hhmm(morning.at) <= "10:00" : false, true);

  const noon = resolveCallbackTime({ date: "2026-08-03", dayPart: "noon", now });
  check("צהריים -> 12:30", noon ? hhmm(noon.at) : null, "12:30");

  const aft = resolveCallbackTime({ date: "2026-08-03", dayPart: "afternoon", now });
  check("אחה\"צ -> 17:00", aft ? hhmm(aft.at) : null, "17:00");
  check("בין 16:30 ל-17:30", aft ? hhmm(aft.at) >= "16:30" && hhmm(aft.at) <= "17:30" : false, true);

  check("לא מסומן כמדויק", aft?.precise, false);
}

console.log("\nיום בלי חלק יום");
{
  const r = resolveCallbackTime({ date: "2026-08-03", dayPart: null, now });
  check("ברירת מחדל בוקר", r ? hhmm(r.at) : null, "09:30");
}

console.log("\nיום שישי - אין אחר צהריים");
{
  // שישי 31.7.26
  const r = resolveCallbackTime({ date: "2026-07-31", dayPart: "afternoon", now });
  check("שישי אחה\"צ -> 12:30", r ? hhmm(r.at) : null, "12:30");
  check("נשאר בשישי", r ? dayOf(r.at) : null, "31/7");
}

console.log("\nחלק יום בלי תאריך");
{
  // עכשיו 11:00 - "אחרי הצהריים" זה היום
  const aft = resolveCallbackTime({ dayPart: "afternoon", now });
  check("אחה\"צ היום", aft ? dayOf(aft.at) : null, "29/7");
  check("בשעה 17:00", aft ? hhmm(aft.at) : null, "17:00");

  // "בוקר" כבר עבר -> מחר
  const morning = resolveCallbackTime({ dayPart: "morning", now });
  check("בוקר שעבר -> מחר", morning ? dayOf(morning.at) : null, "30/7");
}

console.log("\nשעה שעברה לא נקבעת");
{
  const r = resolveCallbackTime({
    isoDateTime: "2026-07-28T10:00:00+03:00",
    confident: true,
    now,
  });
  check("אתמול -> null", r, null);
}

console.log("\nבלי שום רמז לזמן");
check("הכל ריק -> null", resolveCallbackTime({ now }), null);

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
