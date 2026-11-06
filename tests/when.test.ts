import assert from "node:assert/strict";
import io from "node:fs";
import {
  parseWhen,
  freeSlot,
  soften,
  DAY_PART_HOUR,
  SLOT_STEP_MINUTES,
} from "../lib/when";

/**
 * ============================================================
 *  מתי נוח לך שנדבר
 * ============================================================
 *
 *  הלקוח עונה בעברית חופשית וצריך מזה זמן אחד לתזכורת.
 *
 *  **שתי דרכים להיכשל כאן, ושתיהן גרועות:**
 *
 *  1. לא להבין שעה שהלקוח כן אמר - ואז הבוט מציק לו
 *     "אשמח לדייק" על משהו שהוא כבר ענה.
 *  2. להבין שעה שהלקוח לא אמר - ואז נפתחת תזכורת
 *     מומצאת, או תזכורת בשלוש לפנות בוקר.
 *
 *  שני הכיוונים נבדקים כאן.
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

/** יום חמישי, 5.11.2026, 10:30 בבוקר, שעון ישראל */
const NOW = new Date("2026-11-05T10:30:00+02:00");

function il(date: Date) {
  return date.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function when(text: string) {
  return parseWhen(text, NOW);
}

function at(text: string): Date {
  const r = when(text);
  assert.equal(r.kind, "at", `"${text}" לא הובן בכלל`);
  return (r as { at: Date }).at;
}

/* ============================================================
 *  הבאג שהפיל את כל הקובץ
 * ============================================================ */

test("אין בקוד גבול מלה של ASCII על טקסט עברי", () => {
  /**
   * **זה הבאג שגרם לכל תבנית בקובץ להיכשל בשקט.**
   *
   * ב-JavaScript הגבול \\b מוגדר על תווי ASCII, ולכן
   * /\\bמחר\\b/ לעולם לא מתאים למלה עברית. כל ההכרעות
   * החזירו "לא ברור", לכל הודעה.
   */
  const src = io.readFileSync("lib/when.ts", "utf8");

  /** בהערות מותר להסביר את זה; בקוד אסור */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  assert.ok(
    !/\\b/.test(code),
    "חזר \\b על עברית - כל התבניות ייכשלו בשקט"
  );
});

test("הנרמול שומר על ספרות ועל נקודתיים", () => {
  /** בלי זה "14:30" הופך ל-"14 30" ושעה מדויקת נעלמת */
  assert.ok(soften("בשעה 14:30").includes("14:30"));
  assert.equal(soften("מחר בבוקר!!"), "מחר בבוקר");
  /** אותיות סופיות ויו"ד כפולה - בדיוק כמו בשאר המערכת */
  assert.equal(soften("צהריים"), "צהרימ");
  assert.equal(soften("שעתיים"), "שעתימ");
});

/* ============================================================
 *  בעוד X
 * ============================================================ */

const RELATIVE: Array<[string, number]> = [
  ["עוד שעה", 60],
  ["בעוד שעה", 60],
  ["עוד שעתיים", 120],
  ["בעוד 3 שעות", 180],
  ["עוד כמה שעות", 180],
  ["בעוד 20 דקות", 20],
  ["עוד חצי שעה", 30],
];

for (const [text, minutes] of RELATIVE) {
  test(`"${text}" → בעוד ${minutes} דקות`, () => {
    const got = at(text);
    assert.equal(
      got.getTime(),
      NOW.getTime() + minutes * 60000,
      `יצא ${il(got)}`
    );
  });
}

test('"עכשיו" נקבע ל-5 דקות מהרגע', () => {
  assert.equal(at("עכשיו").getTime(), NOW.getTime() + 5 * 60000);
});

/* ============================================================
 *  מחר - הדוגמה שהוא נתן
 * ============================================================ */

test('"מחר בוקר" → מחר ב-9:00', () => {
  const got = at("מחר בוקר");
  assert.equal(got.getDate(), 6, "לא מחר");
  assert.equal(got.getHours(), 9, `יצא ${il(got)}`);
  assert.equal(DAY_PART_HOUR.morning, 9);
});

test('"מחר בבוקר" זהה ל"מחר בוקר"', () => {
  assert.equal(at("מחר בבוקר").getTime(), at("מחר בוקר").getTime());
});

test('"מחר" בלי חלק יום → מחר ב-9:00', () => {
  const got = at("מחר");
  assert.equal(got.getDate(), 6);
  assert.equal(got.getHours(), 9);
});

test('"מחר בערב" → מחר ב-19:00', () => {
  const got = at("מחר בערב");
  assert.equal(got.getDate(), 6);
  assert.equal(got.getHours(), 19);
});

test('"מחר ב-10" → מחר ב-10:00, ולא היום', () => {
  /**
   * כאן נפל הניסיון הראשון: "מחר" לא נתפס, והשעה
   * נקראה כהיום - תזכורת ביום הלא נכון.
   */
  const got = at("מחר ב-10");
  assert.equal(got.getDate(), 6, `יצא ${il(got)} - לא מחר`);
  assert.equal(got.getHours(), 10);
});

test('"מחר בשעה 14:30" שומר על הדקות', () => {
  const got = at("מחר בשעה 14:30");
  assert.equal(got.getDate(), 6);
  assert.equal(got.getHours(), 14);
  assert.equal(got.getMinutes(), 30);
});

test('"מחרתיים" → יומיים קדימה', () => {
  assert.equal(at("מחרתיים").getDate(), 7);
});

/* ============================================================
 *  ימים בשבוע
 * ============================================================ */

test('"יום שני בבוקר" → שני הבא ב-9:00', () => {
  const got = at("יום שני בבוקר");
  assert.equal(got.getDay(), 1, "לא יום שני");
  assert.equal(got.getHours(), 9);
  assert.ok(got.getTime() > NOW.getTime(), "נקבע בעבר");
});

test('"ביום חמישי ב-11" - היום חמישי והשעה טרם עברה', () => {
  const got = at("ביום חמישי ב-11");
  assert.equal(got.getDay(), 4);
  assert.equal(got.getDate(), 5, "נדחה לשבוע הבא בלי צורך");
  assert.equal(got.getHours(), 11);
});

test("יום שהשעה בו כבר עברה נדחה לשבוע הבא", () => {
  /** היום חמישי 10:30; "חמישי ב-9" כבר עבר */
  const got = at("יום חמישי ב-9 בבוקר");
  assert.equal(got.getDay(), 4);
  assert.equal(got.getDate(), 12, `יצא ${il(got)} - נקבע בעבר`);
});

/* ============================================================
 *  שעה מדויקת, ובלי תזכורות בשלוש לפנות בוקר
 * ============================================================ */

test('"אחרי 5" → 17:00 ולא 5:00', () => {
  /**
   * **זה מה שמונע תזכורת בחמש לפנות בוקר.** אף לקוח לא
   * מתכוון לחמש בלילה; מי שכן מתכוון לבוקר אומר זאת.
   */
  const got = at("אחרי 5");
  assert.equal(got.getHours(), 17, `יצא ${il(got)}`);
});

test('"ב-5" → 17:00', () => {
  assert.equal(at("ב-5").getHours(), 17);
});

test('"ב-9 בבוקר" נשאר 9:00', () => {
  const got = at("ב-9 בבוקר");
  assert.equal(got.getHours(), 9, `יצא ${il(got)}`);
});

test('"ב-17:00" היום, כי טרם עבר', () => {
  const got = at("ב-17:00");
  assert.equal(got.getDate(), 5);
  assert.equal(got.getHours(), 17);
});

test("שעה שעברה היום נקבעת למחר", () => {
  /** עכשיו 10:30; "ב-9 בבוקר" עבר */
  const got = at("ב-9 בבוקר");
  assert.equal(got.getDate(), 6, `יצא ${il(got)}`);
});

test("חלק של היום בלי שעה", () => {
  assert.equal(at("בערב").getHours(), 19);
  assert.equal(at("בצהריים").getHours(), 12);
  assert.equal(at("אחרי הצהריים").getHours(), 16);
  /** הבוקר כבר עבר - נקבע למחר בבוקר */
  assert.equal(at("בבוקר").getDate(), 6);
});

/* ============================================================
 *  מה שאסור להפוך לתזכורת
 * ============================================================ */

const NOT_A_TIME = [
  "מתי שנוח לך",
  "לא מעוניין",
  "תודה",
  "מה המחיר",
  "99 שח",
  "אני בעבודה",
  "נדבר בהמשך",
  "כן",
  "לא",
  "אוקיי",
  "מעוניין",
  "תתקשר",
  "053-250-4834",
  "לא יודע",
  "",
];

for (const text of NOT_A_TIME) {
  test(`"${text}" אינו שעה`, () => {
    const r = when(text);
    assert.equal(
      r.kind,
      "unclear",
      `נפתחה תזכורת מומצאת: ${r.kind === "at" ? il(r.at) : ""}`
    );
  });
}

test("מספר טלפון לא נקרא כשעה", () => {
  assert.equal(when("0532504834").kind, "unclear");
  assert.equal(when("תתקשר ל053-250-4834").kind, "unclear");
});

/* ============================================================
 *  הפריסה - לפי הכלל שלו
 * ============================================================ */

test("חמישה שאמרו מחר בבוקר נפרסים בקפיצות של 5 דקות", () => {
  const desired = at("מחר בבוקר");
  const taken: Date[] = [];

  for (let i = 0; i < 5; i++) {
    taken.push(freeSlot(desired, taken));
  }

  assert.equal(SLOT_STEP_MINUTES, 5);

  for (let i = 0; i < 5; i++) {
    assert.equal(
      taken[i].getTime(),
      desired.getTime() + i * 5 * 60000,
      `הליד ה-${i + 1} נפל על ${il(taken[i])}`
    );
  }
});

test("הראשון מקבל בדיוק את הזמן שביקש", () => {
  const desired = at("מחר בבוקר");
  assert.equal(freeSlot(desired, []).getTime(), desired.getTime());
});

test("תזכורת בזמן אחר לא מזיזה כלום", () => {
  const desired = at("מחר בבוקר");
  const other = new Date(desired.getTime() + 60 * 60000);
  assert.equal(freeSlot(desired, [other]).getTime(), desired.getTime());
});

test("הפריסה לא נכנסת ללופ אינסופי", () => {
  const desired = at("מחר בבוקר");
  const taken = Array.from(
    { length: 400 },
    (_, i) => new Date(desired.getTime() + i * 5 * 60000)
  );

  const slot = freeSlot(desired, taken);
  assert.ok(slot.getTime() >= desired.getTime(), "חזר זמן בעבר");
});

/* ============================================================
 *  החיווט בבוט
 * ============================================================ */

const bot = io.readFileSync("lib/campaign-bot.ts", "utf8");

test('"לא" לא סוגר את התהליך - הוא פותח את שאלת השעה', () => {
  /**
   * **ההתנגשות שהייתה הורגת את הפיצ'ר.** אם התהליך
   * נסגר על "לא", השקט של 24 השעות היה בולע בדיוק את
   * התשובה שחיכינו לה: הלקוח כותב "מחר בבוקר" והבוט
   * שותק.
   */
  const branch = bot.slice(bot.indexOf('if (answer === "no")'), bot.indexOf('if (answer === "no")') + 1200);

  assert.ok(
    branch.includes("TIME_ASKED_EVENT"),
    "לא נרשם שהלקוח נשאל מתי נוח לו"
  );
  assert.ok(
    !branch.includes('finish(lead.id, "מתעניין")'),
    "התהליך נסגר על 'לא' - השקט יבלע את תשובת השעה"
  );
});

test("השעה נקראת לפני שאלת הסינון", () => {
  /**
   * אחרת "מחר בבוקר" ייקרא כתשובה לא ברורה לשאלת
   * הסינון, והבוט ישאל אותה שוב.
   */
  const timeStep = bot.indexOf("if (timeAsks.length > 0)");
  const supplierStep = bot.indexOf("if (asks.length > 0)");

  assert.ok(timeStep > -1, "אין שלב שקורא את השעה");
  assert.ok(timeStep < supplierStep, "שאלת הסינון קודמת לקריאת השעה");
});

test("השעה נפתחת כתזכורת עם שם, מספר ומה שאמר", () => {
  const fn = bot.slice(bot.indexOf("async function openReminder"));

  assert.ok(fn.includes("db.task"), "לא נפתחת תזכורת");
  assert.ok(fn.includes("dueAt: at"), "לתזכורת אין זמן");
  assert.ok(fn.includes("params.name"), "אין שם בתזכורת");
  assert.ok(fn.includes("displayPhone(params.phone)"), "אין מספר בתזכורת");
  assert.ok(fn.includes("params.said"), "לא נרשם מה הלקוח כתב");
  assert.ok(fn.includes("freeSlot("), "אין פריסה - כמה תזכורות על אותה דקה");
});

test("הפריסה בודקת תזכורות קיימות סביב אותו זמן", () => {
  const fn = bot.slice(bot.indexOf("async function openReminder"));
  assert.ok(fn.includes("done: false"), "תזכורות שבוצעו חוסמות סלוטים");
  assert.ok(fn.includes("gte:") && fn.includes("lte:"), "לא נשלף חלון סביב הזמן");
});

test("לא הובנה שעה - מבקשים לדייק פעם אחת ואז עובר אליך", () => {
  assert.ok(bot.includes("ASK_TIME_AGAIN"), "לא מבקשים לדייק");
  assert.ok(
    bot.includes("timeAsks.length < MAX_TIME_ASKS"),
    "אין תקרה - הלקוח יקבל את הבקשה בלולאה"
  );
  assert.ok(
    bot.includes("מתעניין - לא הצלחתי לקבוע שעה"),
    "מתעניין בלי שעה נעלם בלי התראה"
  );
});

test("הנוסח של בקשת הדיוק הוא בדיוק מה שביקש", () => {
  const supplier = io.readFileSync("lib/supplier-check.ts", "utf8");
  assert.ok(
    supplier.includes(
      "אשמח לדייק אותי באיזה שעה מתאים לך שנדבר, על מנת שארשום לי:)"
    ),
    "הנוסח שונה ממה שנמסר"
  );
});

test("אחרי שנקבעה שעה התהליך נסגר", () => {
  /** אחרת הבוט ימשיך להגיב לכל הודעה נוספת */
  assert.ok(
    bot.includes('finish(lead.id, "נקבעה חזרה")'),
    "התהליך לא נסגר אחרי שנקבעה תזכורת"
  );
});

test("המנוע הוא ששולח את התזכורת, בלי מנגנון שני", () => {
  const runner = io.readFileSync("lib/runner.ts", "utf8");
  assert.ok(runner.includes("sendTaskReminders"), "אין מי שישלח תזכורות");
  assert.ok(
    runner.includes("notifiedAt: null"),
    "אותה תזכורת תישלח שוב ושוב"
  );
  assert.ok(
    !bot.includes("sendPush("),
    "הבוט שולח התראה בעצמו - מנגנון שני במקביל למנוע"
  );
});

console.log(`✓ when: ${passed} בדיקות עברו`);
