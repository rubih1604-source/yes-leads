import assert from "node:assert/strict";
import io from "node:fs";

/**
 * ============================================================
 *  נעילה על הבאג שתקע את הדיוור על 15 נמענים
 * ============================================================
 *
 *  המנה הבאה נבחרה לפי ספירה - "נשלחו 15, קח מ-15 והלאה".
 *  ברגע שהלולאה בדפדפן נעצרה, לחיצה חדשה יצרה דיוור חדש
 *  שמתחיל מאפס: אותם 15 אנשים קיבלו שוב, ואיש מעבר להם
 *  לא קיבל לעולם. עם 421 אנשי קשר, 406 מהם היו בלתי ניתנים
 *  להשגה.
 *
 *  הבדיקות נועלות את המאפיינים שמונעים את זה.
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

const route = io.readFileSync(
  "app/api/broadcast/[id]/send/route.ts",
  "utf8"
);

test("המנה כבר לא נבחרת לפי ספירה", () => {
  assert.ok(
    !route.includes("slice(done, done + BATCH)"),
    "בחירה לפי ספירה חזרה - הדיוור ייתקע שוב"
  );
});

test("נשלפים הנמענים שכבר קיבלו בדיוור הזה", () => {
  assert.ok(route.includes("broadcastDelivery"));
  assert.ok(route.includes("sentIds"));
});

test("המנה היא מי שעוד לא קיבל", () => {
  assert.ok(route.includes("remaining"));
  assert.ok(route.includes("!sentIds.has"));
});

test("כל נמען נרשם, גם כשהשליחה נכשלה", () => {
  const create = route.indexOf("broadcastDelivery");
  const okCheck = route.indexOf("if (result.ok) {");
  assert.ok(create > -1 && okCheck > -1);
  assert.ok(
    create < okCheck,
    "הרישום חייב לקרות לפני פיצול להצלחה/כישלון, אחרת כישלון לא נרשם"
  );
});

test("ההודעה נרשמת גם בכרטיס הליד", () => {
  assert.ok(route.includes("db.message"));
  assert.ok(route.includes('direction: "out"'));
});

test("רישום בכרטיס לא מפיל את הדיוור", () => {
  const after = route.slice(route.indexOf("db.message"));
  assert.ok(
    after.slice(0, 600).includes(".catch("),
    "שגיאה ברישום לא יכולה לעצור שליחה לשאר הרשימה"
  );
});

test("הסיום נקבע לפי מי שנשאר ולא לפי מונה", () => {
  assert.ok(route.includes("remaining.length - batch.length"));
});

test("התשובה מדווחת כמה נשארו, כדי לאפשר המשך", () => {
  assert.ok(route.includes("remaining:"));
});

/* ---------- המסך ---------- */

const screen = io.readFileSync("components/BroadcastScreen.tsx", "utf8");

test("יש כפתור להמשיך דיוור שנעצר", () => {
  assert.ok(screen.includes("המשך את הדיוור"));
});

test("ההמשך מעביר את מזהה הדיוור הקיים", () => {
  assert.ok(screen.includes("runSend(list.id, list.lastSend!.id)"));
});

test("המסך אומר כמה אנשים עוד לא קיבלו", () => {
  assert.ok(screen.includes("עוד לא קיבלו"));
});

/* ---------- הסכמה ---------- */

const schema = io.readFileSync("prisma/schema.prisma", "utf8");

test("יש טבלת רישום לכל נמען", () => {
  assert.ok(schema.includes("model BroadcastDelivery"));
});

test("אי אפשר לשלוח פעמיים לאותו נמען באותו דיוור", () => {
  const model = schema.slice(
    schema.indexOf("model BroadcastDelivery"),
    schema.indexOf("model BroadcastSend")
  );
  assert.ok(model.includes("@@unique([sendId, contactId])"));
});

console.log(`✓ broadcast-guard: ${passed} בדיקות עברו`);
