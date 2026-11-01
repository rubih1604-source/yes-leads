import assert from "node:assert/strict";
import io from "node:fs";

/**
 * ============================================================
 *  נעילה על "עיכוב 0 פירושו עכשיו"
 * ============================================================
 *
 *  המשימה נוצרה עם זמן של עכשיו, אבל מי שמריץ אותה הוא
 *  טיימר שמתעורר כל דקה - ואחרי פריסה או התעוררות של השרת
 *  גם הסבב הראשון מתעכב. התוצאה: "מיידי" שהגיע אחרי שלוש
 *  דקות, בזמן שהסוכן כבר מדבר עם הלקוח בטלפון.
 */

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

const rules = io.readFileSync("lib/rules.ts", "utf8");
const runner = io.readFileSync("lib/runner.ts", "utf8");

test("משימה שזמנה עכשיו מריצה את המנוע מיד", () => {
  assert.ok(rules.includes("dueNow"));
  assert.ok(rules.includes("runDueJobs"));
});

test("ההרצה המיידית היא אותו מנוע ולא מנגנון שני", () => {
  assert.ok(
    rules.includes('await import("./runner")'),
    "נוצרה שליחה עוקפת במקום להריץ את המנוע הקיים"
  );
  assert.ok(
    !rules.includes("sendTemplate("),
    "rules שולח הודעות בעצמו ועוקף את המנוע, היומן והביטולים"
  );
});

test("רק משימה שזמנה הגיע מפעילה הרצה מיידית", () => {
  assert.ok(rules.includes("runAt.getTime() <= now"));
});

test("כישלון בהרצה המיידית לא שובר את שינוי הסטטוס", () => {
  const at = rules.indexOf("if (dueNow)");
  const block = rules.slice(at, at + 400);
  assert.ok(block.includes("try"), "הרצה שנכשלת תפיל את שינוי הסטטוס");
  assert.ok(block.includes("catch"));
});

/* ---------- השומר מפני לולאה ---------- */

test("המנוע לא יכול לרוץ פעמיים במקביל", () => {
  assert.ok(
    runner.includes("engineRunning"),
    "משימה שמשנה סטטוס תפעיל את המנוע שוב - לולאה אינסופית"
  );
});

test("השומר משתחרר גם כשההרצה נכשלת", () => {
  const at = runner.indexOf("engineRunning = true");
  const block = runner.slice(at, at + 300);
  assert.ok(
    block.includes("finally"),
    "שגיאה אחת תנעל את המנוע לתמיד ושום אוטומציה לא תרוץ"
  );
  assert.ok(block.includes("engineRunning = false"));
});

test("קריאה שדילגה לא מדווחת על שליחות שלא קרו", () => {
  const at = runner.indexOf("if (engineRunning)");
  const block = runner.slice(at, at + 400);
  assert.ok(block.includes("sent: 0"));
  assert.ok(block.includes("picked: 0"));
});

test("הטיימר והקריאה המיידית עוברים דרך אותה דלת", () => {
  const instrumentation = io.readFileSync("instrumentation.ts", "utf8");
  assert.ok(instrumentation.includes("runDueJobs"));
  assert.ok(
    runner.includes("async function runDueJobsInner"),
    "הפיצול בין השומר לגוף ההרצה נעלם"
  );
});

console.log(`✓ immediate-send: ${passed} בדיקות עברו`);
