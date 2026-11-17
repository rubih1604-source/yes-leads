/**
 * ============================================================
 *  עצירת העברות לקונה - לידים של שבת
 * ============================================================
 *
 *  שלוש הבטחות, וזו הבדיקה שנועלת אותן:
 *
 *   1. **כשהמתג כבוי - אפס הבדל.** זו ההבטחה החשובה
 *      ביותר: מנגנון חדש שמשנה משהו כשהוא כבוי הוא
 *      מנגנון שבור.
 *   2. **הליד נכנס כרגיל.** העצירה נוגעת בשליחה החוצה
 *      בלבד - לא בקליטה, לא בערוץ, לא בספירה.
 *   3. **רגע ההעברה הוא רגע השחרור**, לא רגע הקליטה.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HELD_STATE, STUCK_HOLD_HOURS } from "../lib/sale-hold";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error("     " + (err instanceof Error ? err.message : String(err)));
  }
}

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const hold = read("../lib/sale-hold.ts");
const delivery = read("../lib/delivery.ts");
const schema = read("../prisma/schema.prisma");
const runner = read("../lib/runner.ts");
const intake = read("../app/api/webhooks/leadmanager/route.ts");

/* ============================================================
 *  1. כבוי = אפס הבדל
 * ========================================================= */
console.log("\nכשהמתג כבוי, שום דבר לא משתנה");

test("ברירת המחדל במסד היא כבוי", () => {
  assert.ok(
    /holdSaleTransfers\s+Boolean\s+@default\(false\)/.test(schema),
    "העצירה נולדת דלוקה - כל ההעברות ייעצרו ברגע העדכון"
  );
});

test("המצב 'מוחזק' הוא מצב חדש ולא דריסה של קיים", () => {
  assert.equal(HELD_STATE, "held");
  for (const existing of ["pending", "sent", "failed"]) {
    assert.notEqual(HELD_STATE, existing, "המצב החדש דורס מצב קיים");
  }
});

test("תקלה בקריאת ההגדרות לא עוצרת ליד", () => {
  /**
   * ברירת המחדל בספק חייבת להיות "לשלוח". עדיף ליד
   * שיצא מאשר ליד שנתקע בלי שאף אחד ידע.
   */
  assert.ok(
    /async function waitForRelease[\s\S]{0,400}catch \{\s*return false;/.test(
      delivery
    ),
    "כישלון בקריאת המתג עוצר העברות"
  );
});

/* ============================================================
 *  2. הקליטה לא נגעה
 * ========================================================= */
console.log("\nהליד נכנס בדיוק כמו תמיד");

test("**העצירה קובעת לאן הליד נכנס, ולא האם הוא נכנס**", () => {
  /**
   * ============================================================
   *  הבדיקה הזו התהפכה יחד עם המנגנון, ובכוונה
   * ============================================================
   *
   *  **מה שהיה.** העצירה נגעה רק בשליחה החוצה: הליד נכנס
   *  אצל הקונה, והשליחה אליו חיכתה. לכן הכלל היה "הקליטה
   *  לא יודעת על העצירה בכלל".
   *
   *  **מה שהתבקש.** שליד מקמפיין של הקונה ייכנס לרשימה
   *  **שלך** כשהמתג כבוי. זו החלטה על הבעלות, והבעלות
   *  נקבעת בקליטה - לכן הקליטה חייבת לשאול.
   *
   *  **הגבול שנשאר, וזה העיקר:** העצירה יכולה לשנות
   *  **לאן** הליד נכנס, ולעולם לא **האם** הוא נכנס. אין
   *  בקליטה שום מסלול שבו עצירה מונעת יצירת ליד.
   */
  assert.ok(
    intake.includes("const stopped = channel.isSale ? await holdingNow()"),
    "הקליטה לא שואלת על העצירה - ליד של הקונה ייכנס אצלו גם כשעצרת"
  );

  /** העצירה משנה ערוץ בלבד - אין שום יציאה מוקדמת בגללה */
  for (const forbidden of [
    "if (stopped) return",
    "if (stopped) {\n      return",
    "stopped && return",
  ]) {
    assert.ok(
      !intake.includes(forbidden),
      "העצירה מונעת כניסת ליד - זה אסור בכל מצב"
    );
  }

  /** והערוץ באמת נגזר ממנה */
  assert.ok(
    intake.includes("const goesToSale = channel.isSale && !stopped;"),
    "הערוץ לא נגזר מהעצירה"
  );
});

test("ליד שנכנס בזמן עצירה מסומן, כדי שאפשר יהיה להסביר אותו", () => {
  assert.ok(
    intake.includes("heldFromSale: stopped"),
    "אין סימון - ליד מקמפיין של הקונה יישב אצלך בלי שום הסבר"
  );
  assert.ok(
    schema.includes("heldFromSale Boolean @default(false)"),
    "אין שדה לסימון"
  );
});

test("הלידים האלה נשארים שלך - ההדלקה לא מזיזה אותם", () => {
  /**
   * `releaseHeld` נוגעת ב-LeadDelivery בלבד. אם היא הייתה
   * נוגעת בלידים עצמם, הדלקה במוצאי שבת הייתה שולפת לך
   * מהרשימה לידים שכבר התחלת לעבוד עליהם.
   */
  const fn = hold.slice(hold.indexOf("export async function releaseHeld"));
  assert.ok(
    !/db\.lead\.(update|updateMany|delete)/.test(fn),
    "ההדלקה מזיזה לידים - הם אמורים להישאר שלך"
  );
});

test("העצירה נוגעת רק בשליחה החוצה", () => {
  assert.ok(
    delivery.includes("state: hold ? HELD_STATE"),
    "השליחה לא מוחזקת בכלל"
  );
  assert.ok(
    !/lead\.update|lead\.create/.test(hold),
    "קובץ העצירה נוגע בלידים עצמם - הוא אמור לגעת בשליחות בלבד"
  );
});

test("רק ערוץ מכירה נעצר, לא ערוץ שלך", () => {
  assert.ok(
    delivery.includes("channel.isSale ? await waitForRelease()"),
    "גם שליחות לערוצים שלך נעצרות"
  );
});

test("ההגנה מפני שליחה כפולה נשארה לפני העצירה", () => {
  /**
   * אם העצירה הייתה רצה לפני בדיקת הכפילות, שחרור היה
   * יכול להוציא את אותו ליד פעמיים.
   */
  const dup = delivery.indexOf("if (queued) return true;");
  const held = delivery.indexOf("channel.isSale ? await waitForRelease()");

  assert.ok(dup > -1 && held > -1);
  assert.ok(dup < held, "בדיקת הכפילות עברה אחרי העצירה");
});

/* ============================================================
 *  3. רגע ההעברה
 * ========================================================= */
console.log("\nרגע ההעברה הוא רגע השחרור");

test("המטען נושא את createdAt של השליחה", () => {
  assert.ok(
    delivery.includes("buildPayload(delivery.lead, delivery.createdAt)"),
    "התאריך שנשלח לקונה כבר לא נלקח מהשליחה"
  );
});

test("השחרור דורך את createdAt לעכשיו", () => {
  assert.ok(
    /state: "pending",\s*createdAt: now,/.test(hold),
    "הקונה יקבל את תאריך הקליטה ולא את תאריך ההעברה"
  );
});

test("השחרור שומר גם את הסיפור המלא", () => {
  assert.ok(schema.includes("heldAt"), "אין תיעוד מתי הוחזק");
  assert.ok(schema.includes("releasedAt"), "אין תיעוד מתי שוחרר");
  assert.ok(hold.includes("releasedAt: now"));
});

test("השחרור מאפס ניסיונות - המתנה אינה כישלון", () => {
  assert.ok(hold.includes("attempts: 0"));
});

test("המנוע לוקח רק pending, ולכן 'מוחזק' באמת מחכה", () => {
  assert.ok(
    /state: "pending",\s*OR: \[\{ nextTryAt: null \}/.test(delivery),
    "המנוע עלול לשלוח שליחה מוחזקת"
  );
});

/* ============================================================
 *  4. לא נתקע בלי שאף אחד ידע
 * ========================================================= */
console.log("\nעצירה שנשכחה מתריעה על עצמה");

test("יש התרעה אחרי יותר משבת שלמה", () => {
  assert.ok(STUCK_HOLD_HOURS > 24, "ההתרעה תקפוץ כבר במהלך שבת");
  assert.ok(STUCK_HOLD_HOURS < 48, "ההתרעה מאוחרת מדי");
});

test("ההתרעה רצה מהמנוע", () => {
  assert.ok(runner.includes("warnIfStuck()"), "אף אחד לא בודק את זה");
});

test("ההתרעה לא מציפה את הפעמון", () => {
  assert.ok(
    hold.includes("20 * 60 * 60 * 1000"),
    "ההתרעה תיכנס בכל סבב של המנוע"
  );
});

test("כיבוי ושחרור הם פעולה אחת", () => {
  /**
   * מתג שמכבה בלי לשחרר משאיר לידים תקועים בלי שום
   * סימן - וזו תקלה שאי אפשר לגלות.
   */
  const off = hold.indexOf("holdSaleTransfers: false");
  const release = hold.indexOf('state: "pending",');

  assert.ok(off > -1 && release > -1);
  assert.ok(
    off < release,
    "הכיבוי והשחרור התפצלו לשתי פעולות נפרדות"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
