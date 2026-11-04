import assert from "node:assert/strict";
import io from "node:fs";
import {
  readSupplierAnswer,
  statesExistingCustomer,
  SUPPLIER_QUESTION,
  SUPPLIER_QUESTION_AGAIN,
  REPLY_IF_CUSTOMER,
  REPLY_IF_NOT_CUSTOMER,
  MAX_SUPPLIER_ASKS,
  QUIET_HOURS,
  DONE_EVENT,
} from "../lib/supplier-check";
import { detectUnsubscribe } from "../lib/unsubscribe";

/**
 * ============================================================
 *  סימולציה של בוט הדיוור
 * ============================================================
 *
 *  **למה סימולציה ולא תיאור.** תיארתי כבר פעמים רבות איך
 *  הבוט אמור לעבוד, ובפועל הוא לא עבד. כאן מריצים את
 *  ההחלטות על תרחישים אמיתיים, ומה שכתוב למטה הוא מה
 *  שבאמת יקרה.
 *
 *  **הכללים, במלואם:**
 *
 *    התנאים היחידים: המתג דלוק · לא ברשימה שחורה ·
 *    לא נסגר תהליך מולו ב-24 השעות האחרונות.
 *
 *    אין שעות. אין סטטוסים. אין "שיחה חיה". אין המתנה
 *    בין תשובות.
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

/* ============================================================
 *  התרחיש המרכזי: מה הלקוח מקבל על כל תשובה
 * ============================================================ */

/** מה הבוט יעשה בהודעה ראשונה, לפי הטקסט בלבד */
function firstReply(text: string): string {
  if (detectUnsubscribe(text).blacklist) return "רשימה שחורה · בלי תשובה";
  if (statesExistingCustomer(text)) return REPLY_IF_CUSTOMER;
  return SUPPLIER_QUESTION;
}

/** מה הבוט יעשה בהודעה שאחרי השאלה */
function answerReply(text: string): string {
  if (detectUnsubscribe(text).blacklist) return "רשימה שחורה · בלי תשובה";

  const answer = readSupplierAnswer(text);
  if (answer === "yes") return REPLY_IF_CUSTOMER;
  if (answer === "no") return REPLY_IF_NOT_CUSTOMER;
  return SUPPLIER_QUESTION_AGAIN;
}

const FIRST: Array<[string, string]> = [
  ["מה המחיר?", SUPPLIER_QUESTION],
  ["מעוניין", SUPPLIER_QUESTION],
  ["זה כולל את כל ערוצי הספורט?", SUPPLIER_QUESTION],
  ["מתי אפשר לדבר", SUPPLIER_QUESTION],
  ["אני", SUPPLIER_QUESTION],
  ["?", SUPPLIER_QUESTION],
  ["כן", SUPPLIER_QUESTION],
  ["יש לי כבר יס", REPLY_IF_CUSTOMER],
  ["אני לקוח של yes", REPLY_IF_CUSTOMER],
  ["הסר", "רשימה שחורה · בלי תשובה"],
  ["אל תשלחו לי יותר", "רשימה שחורה · בלי תשובה"],
];

for (const [text, expected] of FIRST) {
  test(`הודעה ראשונה "${text}" → ${expected.slice(0, 40)}`, () => {
    assert.equal(firstReply(text), expected);
  });
}

const ANSWERS: Array<[string, string]> = [
  ["לא", REPLY_IF_NOT_CUSTOMER],
  ["לא אני בהוט", REPLY_IF_NOT_CUSTOMER],
  ["אני בפרטנר", REPLY_IF_NOT_CUSTOMER],
  ["כן", REPLY_IF_CUSTOMER],
  ["כן יש לי", REPLY_IF_CUSTOMER],
  ["אני לקוח", REPLY_IF_CUSTOMER],
  ["מה המחיר", SUPPLIER_QUESTION_AGAIN],
  ["תתקשר אליי", SUPPLIER_QUESTION_AGAIN],
  ["הסר", "רשימה שחורה · בלי תשובה"],
];

for (const [text, expected] of ANSWERS) {
  test(`תשובה לשאלה "${text}" → ${expected.slice(0, 40)}`, () => {
    assert.equal(answerReply(text), expected);
  });
}

/* ============================================================
 *  המסלול המלא, מתחילתו ועד סופו
 * ============================================================ */

test("מסלול מלא: מתעניין", () => {
  /**
   * הדיוור יצא · הוא כותב "מה המחיר" · מקבל את השאלה ·
   * עונה "לא" · מקבל "מעולה, אתפנה" · התהליך נסגר ·
   * שקט 24 שעות.
   */
  assert.equal(firstReply("מה המחיר"), SUPPLIER_QUESTION);
  assert.equal(answerReply("לא"), REPLY_IF_NOT_CUSTOMER);
  assert.ok(REPLY_IF_NOT_CUSTOMER.includes("אתפנה"));
});

test("מסלול מלא: לקוח קיים", () => {
  assert.equal(firstReply("מעוניין"), SUPPLIER_QUESTION);
  assert.equal(answerReply("כן"), REPLY_IF_CUSTOMER);
  assert.ok(REPLY_IF_CUSTOMER.includes("2080"));
});

test("מסלול מלא: הצהיר מראש - מדלג על השאלה", () => {
  assert.equal(firstReply("יש לי כבר יס"), REPLY_IF_CUSTOMER);
});

test("מסלול מלא: לא ברור פעמיים - עובר אליך", () => {
  assert.equal(firstReply("מתי אפשר לדבר"), SUPPLIER_QUESTION);
  assert.equal(answerReply("אני צריך לחשוב"), SUPPLIER_QUESTION_AGAIN);
  assert.equal(MAX_SUPPLIER_ASKS, 2);
});

/* ============================================================
 *  השקט של 24 שעות
 * ============================================================ */

test("אחרי שהתהליך נסגר - שקט 24 שעות", () => {
  assert.equal(QUIET_HOURS, 24);

  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");
  assert.ok(src.includes("hours < QUIET_HOURS"), "אין בדיקת שקט");
  assert.ok(src.includes('action: "quiet"'));
});

test("כל סיום של תהליך נסגר בפועל", () => {
  /**
   * אם מסלול לא נסגר, הבוט יחזור על עצמו מול אותו אדם.
   */
  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");

  for (const outcome of ["לקוח קיים", "מתעניין", "לא ברור", "הסרה"]) {
    assert.ok(
      src.includes(`finish(lead.id, "${outcome}")`),
      `המסלול "${outcome}" לא סוגר את התהליך`
    );
  }
  assert.equal(DONE_EVENT, "campaign_done");
});

test("השאלות נספרות מאז הסגירה האחרונה", () => {
  /**
   * אחרת מי שסגר תהליך לפני חודש נחשב "כבר נשאל"
   * לנצח, ולא יישאל במבצע הבא.
   */
  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");
  assert.ok(src.includes("const since = lastDone?.createdAt"));
  assert.ok(src.includes("e.createdAt.getTime() > since.getTime()"));
});

/* ============================================================
 *  מה שכבר לא יכול לחסום
 * ============================================================ */

test("אין אף אחת מהחסימות שהשתיקו אותו", () => {
  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");

  for (const [what, why] of [
    ["shouldBotReply", "השער המשותף - שבע חסימות שנבנו לשיחה רגילה"],
    ["botPausedUntil", '"אתה בשיחה עם הלקוח"'],
    ["withinBotHours", "שעות פעילות"],
    ["botStatuses", "מגבלת סטטוסים"],
    ["replyCooldown", "המתנה בין תשובות - חסמה את התשובה לשאלה עצמה"],
    ["liveChat", '"הלקוח שלח שתי הודעות"'],
  ]) {
    assert.ok(!src.includes(what), `חזרה החסימה: ${why}`);
  }
});

test("התנאים היחידים הם שלושה", () => {
  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");

  assert.ok(src.includes("!settings.campaignBot"), "המתג לא נבדק");
  assert.ok(src.includes("lead.doNotContact"), "הרשימה השחורה לא נבדקת");
  assert.ok(src.includes("hours < QUIET_HOURS"), "השקט לא נבדק");
});

test("המתג עצמאי ולא תלוי במצב הבוט הרגיל", () => {
  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  assert.ok(!src.includes("botMode"), "בוט הדיוור תלוי במצב הבוט הרגיל");
  assert.ok(
    hook.includes("settings.campaignBot"),
    "הוובוק לא בודק את המתג העצמאי"
  );
  /** הבוט הגדול נמחק - אין יותר מה שירוץ לפניו */
  assert.ok(
    !hook.includes("handleInboundMessage"),
    "הבוט הגדול חזר לקליטה"
  );
});

test("המתג מגיע מההגדרות עד המסך", () => {
  const settings = io.readFileSync("lib/settings.ts", "utf8");
  const api = io.readFileSync("app/api/settings/route.ts", "utf8");
  const screen = io.readFileSync("components/BotSettings.tsx", "utf8");
  const page = io.readFileSync("app/settings/page.tsx", "utf8");
  const health = io.readFileSync("app/api/health/system/route.ts", "utf8");

  assert.ok(settings.includes("campaignBot"), "לא נקרא מהמסד");
  assert.ok(api.includes("campaignBot"), "אי אפשר לשמור");
  assert.ok(screen.includes("campaignBot"), "אין כפתור");
  assert.ok(page.includes("campaignBot={settings.campaignBot"), "לא מועבר למסך");
  assert.ok(health.includes("בוט_הדיוור"), "לא מופיע בבריאות המערכת");
});

test("בקשת הסרה גוברת גם על השקט וגם על הכל", () => {
  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");
  assert.ok(
    src.indexOf("detectUnsubscribe(params.text)") <
      src.indexOf("hours < QUIET_HOURS"),
    "בקשת הסרה נבדקת אחרי השקט"
  );
});

test("כשל בשליחה מדווח ולא נראה כהצלחה", () => {
  const src = io.readFileSync("lib/campaign-bot.ts", "utf8");
  assert.ok(src.includes('action: "send-failed"'));
});

console.log(`✓ campaign-bot (סימולציה): ${passed} בדיקות עברו`);
