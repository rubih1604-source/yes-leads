import assert from "node:assert/strict";
import io from "node:fs";
import {
  decideReply,
  readRequestedTime,
  intentPatternSources,
  NOTHING_NEW,
} from "../lib/reply-intent";
import { normalizeText } from "../lib/unsubscribe";

/**
 * ============================================================
 *  נעילה על ניווט התגובות
 * ============================================================
 *
 *  **מה עומד על הפרק.** המודול הזה מחליט אם לקוח עובר
 *  ל"לא מעוניין", מקבל תזכורת, או מקבל הודעה אוטומטית
 *  נוספת. טעות כאן היא לקוח חי שנסגר, או הודעה שנשלחת
 *  למי שכתב "תפסיקו".
 *
 *  הכלל: כשלא בטוחים - לא שולחים. "לא ברור" חייב להוביל
 *  להתראה אליך, לעולם לא לשליחה.
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

/** ראשון בנובמבר 2026, 11:00 - יום ראשון */
const NOW = new Date("2026-11-01T11:00:00+02:00");

/* ---------- אין תגובה ---------- */

test("בלי תגובה התבנית יוצאת כמתוכנן", () => {
  assert.equal(decideReply({ text: null, now: NOW }).action, "send");
  assert.equal(decideReply({ text: "", now: NOW }).action, "send");
  assert.equal(decideReply({ text: "   ", now: NOW }).action, "send");
  assert.equal(NOTHING_NEW.action, "send");
});

test("סימנים בלבד הם עדיין הודעה מהלקוח", () => {
  /**
   * "?" או אימוג'י מתרוקנים בנרמול, אבל הלקוח כן כתב.
   * תבנית אוטומטית שתיפול עכשיו תיראה כאילו לא קראת.
   */
  const d = decideReply({ text: "!!!", now: NOW });
  assert.notEqual(d.action, "send");
  assert.equal(d.intent, "unclear");
});

/* ---------- בקשת הסרה ---------- */

test("בקשת הסרה עוצרת הכל ומסמנת", () => {
  for (const text of [
    "הסר",
    "תסירו אותי מהרשימה",
    "אל תשלחו לי יותר הודעות",
    "תפסיקו לשלוח",
    "תמחקו את המספר שלי",
  ]) {
    const d = decideReply({ text, now: NOW });
    assert.equal(d.intent, "remove", `לא זוהה כבקשת הסרה: ${text}`);
    assert.equal(d.action, "set_status");
  }
});

/* ---------- לקוח קיים ---------- */

test("מי שאומר שהוא כבר לקוח לא מקבל עוד הודעות", () => {
  for (const text of ["יש לי כבר יס", "אני לקוח של yes", "אני כבר בסטינג"]) {
    const d = decideReply({ text, now: NOW });
    assert.equal(d.intent, "existing_customer", `לא זוהה: ${text}`);
    assert.equal(d.status, "לקוח קיים");
  }
});

/* ---------- בקשה לחזור ---------- */

test("בקשה לחזור פותחת תזכורת ולא סוגרת ליד", () => {
  for (const text of [
    "תדבר איתי מחר",
    "תחזור אליי מחר",
    "אני בשיחה כרגע",
    "לא יכול לדבר עכשיו",
    "תתקשר אליי בערב",
    "מחר אפשר",
  ]) {
    const d = decideReply({ text, now: NOW });
    assert.equal(d.intent, "call_later", `לא זוהה כדחייה: ${text}`);
    assert.equal(d.action, "remind");
    assert.ok(d.remindAt, `אין מועד לתזכורת: ${text}`);
    assert.ok(
      d.remindAt!.getTime() > NOW.getTime(),
      `התזכורת בעבר: ${text}`
    );
  }
});

test("בקשה לחזור בלי שעה עדיין מקבלת מועד", () => {
  /**
   * **זה ההפסד השקט.** לקוח שביקש שתחזור ולא ציין מתי
   * פשוט נשכח. ברירת מחדל היא לא ניחוש - היא ההבדל בין
   * פנייה שחוזרת לפנייה שמתה.
   */
  const d = decideReply({ text: "תדבר איתי", now: NOW });
  assert.equal(d.action, "remind");
  assert.ok(d.remindAt);
});

test("דחייה גוברת על חוסר עניין באותו משפט", () => {
  /**
   * "לא מעוניין לדבר עכשיו, תתקשר מחר" הוא דחיית שיחה,
   * לא סירוב. סדר בדיקה הפוך היה סוגר לקוח חי.
   */
  const d = decideReply({
    text: "לא מעוניין לדבר עכשיו תתקשר מחר",
    now: NOW,
  });
  assert.equal(d.intent, "call_later");
  assert.notEqual(d.status, "לא מעוניין");
});

/* ---------- השעה שביקש ---------- */

test("מחר בלי שעה - מחר בבוקר מאוחר", () => {
  const at = readRequestedTime("תדבר איתי מחר", NOW)!;
  assert.equal(at.getDate(), 2);
  assert.equal(at.getHours(), 10);
});

test("מחר בערב ומחר בבוקר נקראים נכון", () => {
  assert.equal(readRequestedTime("תחזור אליי מחר בערב", NOW)!.getHours(), 18);
  assert.equal(readRequestedTime("תחזור אליי מחר בבוקר", NOW)!.getHours(), 9);
});

test("שעה חד ספרתית נקראת כאחר הצהריים", () => {
  /** "תחזור ב-5" זה חמש אחר הצהריים, לא לפנות בוקר */
  const at = readRequestedTime("תחזור אליי ב5", NOW)!;
  assert.equal(at.getHours(), 17);
});

test("שעה מפורשת נשמרת כמו שנכתבה", () => {
  const at = readRequestedTime("תתקשר בשעה 17", NOW)!;
  assert.equal(at.getHours(), 17);
  assert.equal(at.getDate(), 1);
});

test("שעה שכבר עברה מועברת למחר", () => {
  /** ב-11:00 בבוקר, "תתקשר ב-9" הוא מחר ולא לפני שעתיים */
  const at = readRequestedTime("תתקשר ב 9 בבוקר", NOW)!;
  assert.ok(at.getTime() > NOW.getTime());
});

test("בעוד שעה ובעוד שעתיים", () => {
  const one = readRequestedTime("תתקשר בעוד שעה", NOW)!;
  assert.equal(Math.round((one.getTime() - NOW.getTime()) / 60000), 60);

  const two = readRequestedTime("בעוד שעתיים", NOW)!;
  assert.equal(Math.round((two.getTime() - NOW.getTime()) / 60000), 120);
});

test("בעוד דקות לא הופך לשעות", () => {
  const at = readRequestedTime("בעוד 20 דקות", NOW)!;
  assert.equal(Math.round((at.getTime() - NOW.getTime()) / 60000), 20);
});

test("יום בשבוע מחושב קדימה ולא אחורה", () => {
  /** NOW הוא יום ראשון; "ביום רביעי" הוא עוד שלושה ימים */
  const at = readRequestedTime("תתקשר ביום רביעי", NOW)!;
  assert.ok(at.getTime() > NOW.getTime());
  assert.equal(at.getDay(), 3);
});

test("שבוע הבא הוא שבעה ימים קדימה", () => {
  const at = readRequestedTime("נדבר שבוע הבא", NOW)!;
  assert.equal(Math.round((at.getTime() - NOW.getTime()) / 86400000), 7);
});

test("טקסט בלי שום רמז זמן מחזיר ריק", () => {
  assert.equal(readRequestedTime("שלום מה נשמע", NOW), null);
});

/* ---------- עניין ---------- */

test("עניין מפורש מתריע לך ולא שולח עוד תבנית", () => {
  for (const text of [
    "מעוניין",
    "אשמח לשמוע",
    "שלח לי פרטים",
    "כמה זה עולה",
    "המבצע עדיין בתוקף?",
    "אני רוצה להתקדם",
  ]) {
    const d = decideReply({ text, now: NOW });
    assert.equal(d.intent, "interested", `לא זוהה כעניין: ${text}`);
    assert.equal(d.action, "alert");
  }
});

test("מעוניינת בלשון נקבה מזוהה גם היא", () => {
  const d = decideReply({
    text: "מעוניינת לשמוע אם המבצע עדיין בתוקף",
    now: NOW,
  });
  assert.equal(d.intent, "interested");
});

/* ---------- חוסר עניין ---------- */

test("חוסר עניין מעביר סטטוס בלי לחסום", () => {
  for (const text of ["לא מעוניין", "לא רלוונטי", "לא תודה"]) {
    const d = decideReply({ text, now: NOW });
    assert.equal(d.intent, "not_interested", `לא זוהה: ${text}`);
    assert.equal(d.status, "לא מעוניין");
  }
});

test("\"לא מעוניין\" לעולם לא נקרא כהבעת עניין", () => {
  /**
   * התבנית של "מעוניין" תפסה את המילה גם אחרי "לא",
   * והמערכת הייתה מתריעה להתקשר בדחיפות ללקוח שסירב.
   */
  for (const text of ["לא מעוניין", "לא מעוניינת", "ממש לא מעוניין"]) {
    const d = decideReply({ text, now: NOW });
    assert.notEqual(d.intent, "interested", `סווג כעניין: ${text}`);
  }
});

test("לא מעוניין אינו בקשת הסרה", () => {
  /**
   * ההבדל שווה כסף: "לא מעוניין" חוזר אליו בעוד חודש,
   * בקשת הסרה לא חוזרת לעולם.
   */
  const d = decideReply({ text: "לא מעוניין", now: NOW });
  assert.notEqual(d.intent, "remove");
});

/* ---------- מה שלא ברור ---------- */

test("תגובה שלא זוהתה לא גוררת שליחה אוטומטית", () => {
  /**
   * **המעקה המרכזי.** הלקוח כתב משהו. תבנית שתיפול
   * עליו עכשיו תיראה כאילו לא קראת אותו.
   */
  for (const text of [
    "מה הכתובת שלכם",
    "אני צריך לבדוק עם אשתי",
    "שלחתי לך מייל",
    "?",
    "אוקיי",
  ]) {
    const d = decideReply({ text, now: NOW });
    assert.notEqual(d.action, "send", `נשלחה תבנית על: ${text}`);
  }
});

test("תגובה לא ברורה מגיעה אליך עם הטקסט המקורי", () => {
  const d = decideReply({ text: "אני צריך לבדוק עם אשתי", now: NOW });
  assert.equal(d.intent, "unclear");
  assert.equal(d.action, "alert");
  assert.ok(d.reason.includes("אשתי"), "ההתראה לא מראה מה הוא כתב");
});

/* ---------- עברית שנופלת בשקט ---------- */

test("כל התבניות שורדות את הנרמול", () => {
  /**
   * אות סופית או יוד כפולה בתבנית שנכתבה ביד פשוט לא
   * מתאימה לעולם - כשל שקט שאי אפשר לראות בקריאה.
   */
  for (const source of intentPatternSources()) {
    const letters = source.replace(/[^֐-׿]/g, "");
    for (const ch of letters) {
      assert.ok(
        !"םןךףץ".includes(ch),
        `אות סופית בתבנית, לא תתאים אחרי נרמול: ${source}`
      );
    }
    assert.ok(
      !/יי/.test(source.replace(/\\/g, "")),
      `יוד כפולה בתבנית, הנרמול הופך אותה לאחת: ${source}`
    );
  }
});

test("צורות כתיבה שונות של אותו דבר מגיעות לאותה מסקנה", () => {
  const forms = ["לא מעוניין", "לא מעונין", "לא מעוניינת"];
  const intents = forms.map((t) => decideReply({ text: t, now: NOW }).intent);
  assert.ok(
    intents.every((i) => i === "not_interested"),
    `לא אחיד: ${JSON.stringify(intents)}`
  );
  assert.ok(normalizeText("לא מעוניין").includes("מעונינ"));
});

/* ---------- החיבור למנוע ---------- */

test("המנוע מנווט במקום לבטל בשתיקה", () => {
  const runner = io.readFileSync("lib/runner.ts", "utf8");

  assert.ok(
    runner.includes("decideReply"),
    "המנוע עדיין מבטל כל תגובה בלי לקרוא אותה"
  );
  assert.ok(
    !runner.includes('await finish("cancelled", "הלקוח ענה")'),
    "הביטול הישן נשאר לצד הניווט - שני מנגנונים לאותה החלטה"
  );
});

test("העברת סטטוס עוברת בנקודת הכניסה ולא בעדכון ישיר", () => {
  /**
   * עדכון ישיר היה משאיר את הליד בלי תיעוד, בלי ביטול
   * המשימות הישנות ובלי החוקים של הסטטוס החדש.
   */
  const runner = io.readFileSync("lib/runner.ts", "utf8");
  const block = runner.slice(
    runner.indexOf("const decision = decideReply"),
    runner.indexOf("if (job.action === \"send_template\"")
  );

  assert.ok(block.includes("applyStatusChange"), "ההעברה לא עוברת במנוע");
  assert.ok(
    !/db\.lead\.update\([^)]*status:/.test(block),
    "סטטוס משתנה בעדכון ישיר ועוקף את המנוע"
  );
});

test("התזכורת נכנסת לאותו תור של כל השאר", () => {
  const runner = io.readFileSync("lib/runner.ts", "utf8");
  const block = runner.slice(
    runner.indexOf("const decision = decideReply"),
    runner.indexOf("if (job.action === \"send_template\"")
  );

  assert.ok(
    block.includes("db.scheduledJob"),
    "התזכורת נשמרת במקום אחר - תור שני"
  );
  assert.ok(
    block.includes("shiftToWorkingHours"),
    "תזכורת יכולה לקפוץ באמצע הלילה"
  );
});

console.log(`✓ reply-intent: ${passed} בדיקות עברו`);
