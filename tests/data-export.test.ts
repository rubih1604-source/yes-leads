import assert from "node:assert/strict";
import {
  inData,
  exportPhone,
  buildCsv,
  fileNameFor,
  EXPORT_FORMATS,
  type DataLead,
} from "../lib/data-export";

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

const lead = (over: Partial<DataLead> = {}): DataLead => ({
  phone: "+972521234567",
  firstName: "אבי",
  lastName: "רחמים",
  email: "a@b.com",
  status: "חדש",
  campaign: "קמפיין",
  createdAt: "2026-10-23",
  ...over,
});

/* ---------- מי נכנס לדאטה ---------- */

test("ליד רגיל נכנס", () => {
  eq(inData({ phone: "0521234567", status: "חדש" }, ["נסגר"]), true);
});

test("סטטוס מוחרג לא נכנס", () => {
  eq(inData({ phone: "0521234567", status: "נסגר" }, ["נסגר"]), false);
});

test("לקוח קיים מוחרג כשבחרת בו", () => {
  eq(
    inData({ phone: "0521234567", status: "לקוח קיים" }, ["נסגר", "לקוח קיים"]),
    false
  );
});

test("בלי טלפון לא נכנס - הוא רק מוריד את אחוז ההתאמה", () => {
  eq(inData({ phone: "", status: "חדש" }, []), false);
  eq(inData({ phone: "   ", status: "חדש" }, []), false);
});

test("רשימת החרגה ריקה מכניסה הכל", () => {
  eq(inData({ phone: "0521234567", status: "נסגר" }, []), true);
});

test("רווחים בסטטוס לא שוברים את ההחרגה", () => {
  eq(inData({ phone: "0521234567", status: " נסגר " }, [" נסגר "]), false);
});

/* ---------- הטלפון ---------- */

test("מספר ישראלי הופך לפורמט בינלאומי", () => {
  eq(exportPhone("0521234567"), "972521234567");
});

test("מספר שכבר בינלאומי נשאר", () => {
  eq(exportPhone("+972-52-123-4567"), "972521234567");
});

test("טלפון ריק מחזיר ריק", () => {
  eq(exportPhone(""), "");
});

/* ---------- הקבצים ---------- */

test("לוק-אלייק: הכותרות שפייסבוק מזהה", () => {
  const { csv } = buildCsv([lead()], "lookalike");
  eq(csv.split("\n")[0], "email,phone,fn,ln,country");
});

test("לוק-אלייק: מדינה IL בכל שורה", () => {
  const { csv } = buildCsv([lead()], "lookalike");
  ok(csv.split("\n")[1].endsWith(",IL"));
});

test("לוק-אלייק: הטלפון בפורמט בינלאומי", () => {
  const { csv } = buildCsv([lead({ phone: "0521234567" })], "lookalike");
  ok(csv.includes("972521234567"));
});

test("שורה בלי טלפון לא נכנסת לקובץ", () => {
  const { csv, rows } = buildCsv([lead(), lead({ phone: "" })], "lookalike");
  eq(rows, 1);
  eq(csv.split("\n").length, 2); // כותרת + שורה אחת
});

test("טלפונים בלבד: עמודה אחת", () => {
  const { csv } = buildCsv([lead()], "phones");
  eq(csv.split("\n")[0], "phone");
  eq(csv.split("\n")[1], "972521234567");
});

test("קובץ מלא: כולל סטטוס וקמפיין", () => {
  const { csv } = buildCsv([lead()], "full");
  ok(csv.includes("חדש"));
  ok(csv.includes("קמפיין"));
});

test("פסיק בשם לא שובר את הקובץ", () => {
  const { csv } = buildCsv([lead({ firstName: "אבי, בן" })], "full");
  ok(csv.includes('"אבי, בן"'));
});

test("מרכאות בשם מוברחות", () => {
  const { csv } = buildCsv([lead({ lastName: 'כהן "קובי"' })], "full");
  ok(csv.includes('""קובי""'));
});

test("רשימה ריקה מחזירה כותרת בלבד", () => {
  const { csv, rows } = buildCsv([], "lookalike");
  eq(rows, 0);
  eq(csv.split("\n").length, 1);
});

/* ---------- שם הקובץ ---------- */

test("שם הקובץ נגזר מהפורמט ומהתקופה", () => {
  ok(fileNameFor("lookalike", "החודש").startsWith("lookalike-"));
  ok(fileNameFor("phones", "החודש").startsWith("phones-"));
  ok(fileNameFor("full", "החודש").endsWith(".csv"));
});

test("תווים בעייתיים בשם התקופה לא נכנסים לשם הקובץ", () => {
  const name = fileNameFor("full", "1/10 - 31/10");
  ok(!name.includes("/"));
});

test("שלושה פורמטים, לכל אחד תווית והסבר", () => {
  eq(EXPORT_FORMATS.length, 3);
  for (const f of EXPORT_FORMATS) {
    ok(f.label.trim().length > 0);
    ok(f.note.trim().length > 0);
  }
});

console.log(`✓ data-export: ${passed} בדיקות עברו`);
