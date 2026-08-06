/** בדיקות לקריאת דוח מכירות ולהצלבה לפי שם */
import { parseSheet, splitCsvLine } from "../lib/sheet-parse";
import { namesMatch, findMatch, normalizeName } from "../lib/name-match";

let passed = 0, failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++; console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}  התקבל ${JSON.stringify(actual)} ציפינו ${JSON.stringify(expected)}`);
  }
}

console.log("\nפיצול שורת CSV");
check("פשוט", splitCsvLine("א,ב,ג"), ["א", "ב", "ג"]);
check("עם מרכאות", splitCsvLine('"כהן, יוסי",0501234567'), ["כהן, יוסי", "0501234567"]);
check("מרכאות כפולות", splitCsvLine('"אמר ""שלום""",ב'), ['אמר "שלום"', "ב"]);
check("טאב", splitCsvLine("א\tב"), ["א", "ב"]);
check("נקודה פסיק", splitCsvLine("א;ב"), ["א", "ב"]);

console.log("\nזיהוי עמודות אוטומטי");
{
  const csv = `שם מלא,טלפון נייד,סטטוס עסקה
יוסי כהן,0501234567,דאבל יס
שרה לוי,0529876543,רק יס`;
  const parsed = parseSheet(csv);
  check("שתי שורות", parsed.rows.length, 2);
  check("עמודת שם זוהתה", parsed.detected.name, 0);
  check("עמודת טלפון זוהתה", parsed.detected.phone, 1);
  check("עמודת סטטוס זוהתה", parsed.detected.status, 2);
  check("השם נקרא", parsed.rows[0].name, "יוסי כהן");
  check("הסטטוס נקרא", parsed.rows[0].status, "דאבל יס");
}

console.log("\nכותרות באנגלית");
{
  const csv = `Customer Name,Phone,Deal
Yossi Cohen,0501234567,Double`;
  const parsed = parseSheet(csv);
  check("זוהה שם", parsed.detected.name, 0);
  check("זוהה טלפון", parsed.detected.phone, 1);
}

console.log("\nBOM של אקסל");
{
  const parsed = parseSheet("\uFEFFשם,טלפון\nיוסי,0501234567");
  check("BOM לא שובר", parsed.detected.name, 0);
}

console.log("\nהשוואת שמות");
check("זהה", namesMatch("יוסי כהן", "יוסי כהן"), true);
check("רווחים כפולים", namesMatch("יוסי  כהן", "יוסי כהן"), true);
check("סדר הפוך", namesMatch("כהן יוסי", "יוסי כהן"), true);
check("גרשיים", namesMatch('יוסי כהן', 'יוסי כהן"'), true);
check("שם משפחה שונה", namesMatch("יוסי כהן", "יוסי לוי"), false);
check("שם אחד בלבד", namesMatch("יוסי", "יוסי כהן"), false);
check("ריק", namesMatch("", "יוסי"), false);
check("ניקוד מוסר", normalizeName("יוֹסֵי"), "יוסי");

console.log("\nהצלבה - הכלל הקדוש: רק התאמה חד משמעית");
{
  const candidates = [
    { id: "1", phone: "+972501111111", fullName: "יוסי כהן", status: "חדש" },
    { id: "2", phone: "+972502222222", fullName: "יוסי כהן", status: "אין מענה" },
    { id: "3", phone: "+972503333333", fullName: "שרה לוי", status: "חדש" },
  ];

  check("שם ייחודי -> התאמה",
    findMatch({ name: "שרה לוי", candidates }).kind, "name");

  check("שם כפול -> לא נוגעים",
    findMatch({ name: "יוסי כהן", candidates }).kind, "ambiguous");

  check("טלפון גובר על שם כפול",
    findMatch({ name: "יוסי כהן", phone: "+972502222222", candidates }).kind, "phone");

  const byPhone = findMatch({ phone: "+972501111111", candidates });
  check("הליד הנכון", byPhone.kind === "phone" ? byPhone.lead.id : null, "1");

  check("לא נמצא", findMatch({ name: "דני אבידן", candidates }).kind, "none");
  check("בלי כלום", findMatch({ candidates }).kind, "none");
}

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
