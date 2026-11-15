import assert from "node:assert/strict";
import io from "node:fs";
import {
  parsePool,
  serializePool,
  pickFromPool,
  templateForRule,
  poolSize,
  poolLabel,
  poolVerdict,
  replyRate,
  MIN_SENDS_FOR_VERDICT,
} from "../lib/template-pool";

/**
 * ============================================================
 *  נעילה על בנק התבניות
 * ============================================================
 *
 *  שתי סכנות כאן, ושתיהן שקטות:
 *
 *  1. **חלוקה לא שווה.** אם תבנית אחת יוצאת יותר מהאחרות,
 *     ההשוואה ביניהן חסרת משמעות - ואז נחליף ניסוח בגלל
 *     מקריות, לא בגלל תוצאה.
 *
 *  2. **בנק ריק ששובר שליחה.** חוק ששולח תבנית חייב
 *     להחזיר שם תקין תמיד, אחרת כל הודעה בסטטוס הזה
 *     נכשלת בלי שאף אחד ישים לב.
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

/* ---------- פירוק הבנק ---------- */

test("בנק ריק מחזיר רשימה ריקה", () => {
  assert.deepEqual(parsePool(null), []);
  assert.deepEqual(parsePool(""), []);
  assert.deepEqual(parsePool("   "), []);
  assert.deepEqual(parsePool(",,, ,"), []);
});

test("רווחים ושורות לא יוצרים תבניות מדומות", () => {
  assert.deepEqual(parsePool(" a , b \n c "), ["a", "b", "c"]);
});

test("תבנית כפולה לא מקבלת תור כפול", () => {
  /**
   * זו בדיוק הדרך שבה חלוקה מתעוותת בלי שרואים: אותה
   * תבנית פעמיים ברשימה הייתה יוצאת פי שניים.
   */
  assert.deepEqual(parsePool("a,b,a"), ["a", "b"]);
});

test("שמירה חזרה מנקה את אותם דברים", () => {
  assert.equal(serializePool([" a ", "b", "a", ""]), "a,b");
  assert.equal(serializePool([]), null);
  assert.equal(serializePool(["  "]), null);
});

/* ---------- הסבב ---------- */

test("הסבב מחלק שווה בדיוק", () => {
  const pool = ["t1", "t2", "t3"];
  const counts: Record<string, number> = { t1: 0, t2: 0, t3: 0 };

  for (let cursor = 0; cursor < 300; cursor++) {
    counts[pickFromPool(pool, cursor)!]++;
  }

  assert.equal(counts.t1, 100);
  assert.equal(counts.t2, 100);
  assert.equal(counts.t3, 100);
});

test("הסבב הולך לפי הסדר ולא מדלג", () => {
  const pool = ["a", "b", "c"];
  const order = [0, 1, 2, 3, 4, 5].map((c) => pickFromPool(pool, c));
  assert.deepEqual(order, ["a", "b", "c", "a", "b", "c"]);
});

test("מונה פגום לא מפיל שליחה", () => {
  const pool = ["a", "b"];
  assert.ok(pickFromPool(pool, -1));
  assert.ok(pickFromPool(pool, -7));
  assert.ok(pickFromPool(pool, NaN));
  assert.ok(pickFromPool(pool, 1.9));
});

test("בנק ריק מחזיר null ולא מתרסק", () => {
  assert.equal(pickFromPool([], 0), null);
});

/* ---------- ההכרעה של החוק ---------- */

test("בלי בנק החוק מתנהג בדיוק כמו קודם", () => {
  const rule = { templateName: "inbox_marketing_1", templatePool: null };
  for (let c = 0; c < 5; c++) {
    assert.equal(templateForRule(rule, c).chosen, "inbox_marketing_1");
  }
});

test("בנק גובר על התבנית הבודדת", () => {
  const rule = { templateName: "ישן", templatePool: "a,b" };
  assert.equal(templateForRule(rule, 0).chosen, "a");
  assert.equal(templateForRule(rule, 1).chosen, "b");
});

test("בנק של אחת מתנהג כתבנית קבועה", () => {
  const rule = { templateName: null, templatePool: "רק_זו" };
  assert.equal(templateForRule(rule, 0).chosen, "רק_זו");
  assert.equal(templateForRule(rule, 9).chosen, "רק_זו");
});

test("חוק בלי שום תבנית מחזיר null ולא מחרוזת ריקה", () => {
  /**
   * מחרוזת ריקה הייתה עוברת את הבדיקה של המתזמן ומגיעה
   * לטקסטר כשם תבנית ריק.
   */
  assert.equal(
    templateForRule({ templateName: null, templatePool: null }, 0).chosen,
    null
  );
  assert.equal(templateForRule({}, 0).chosen, null);
});

/* ---------- תצוגה ---------- */

test("התווית אומרת כמה תבניות באמת מתחלפות", () => {
  assert.equal(poolSize(null), 0);
  assert.equal(poolSize("a,b,c"), 3);
  assert.ok(poolLabel(null).includes("אחת"));
  assert.ok(poolLabel("a,b,c").includes("3"));
  assert.ok(poolLabel("a,b,c").includes("סבב"));
});

/* ---------- מתי מותר להכריז על מנצחת ---------- */

test("לא מכריזים על מנצחת לפני הסף", () => {
  const v = poolVerdict([
    { templateName: "a", sent: 40, replied: 12 },
    { templateName: "b", sent: 6, replied: 0 },
  ]);
  assert.equal(v.ready, false);
  assert.equal(v.winner, null);
  assert.ok(v.reason.includes("24"), `ההסבר לא אומר כמה חסר: ${v.reason}`);
});

test("אחרי הסף מכריזים לפי אחוז התגובות ולא לפי מספרים מוחלטים", () => {
  /**
   * "a" קיבלה יותר תגובות במספר מוחלט, אבל גם נשלחה
   * הרבה יותר. מי שסופר מספרים במקום אחוזים היה בוחר
   * בה בטעות.
   */
  const v = poolVerdict([
    { templateName: "a", sent: 200, replied: 20 },
    { templateName: "b", sent: 30, replied: 9 },
  ]);
  assert.equal(v.ready, true);
  assert.equal(v.winner, "b");
});

test("תבנית אחת בלבד - אין למה להשוות", () => {
  const v = poolVerdict([{ templateName: "a", sent: 500, replied: 100 }]);
  assert.equal(v.ready, false);
  assert.equal(v.winner, null);
});

test("תיקו לא מכריז מנצחת", () => {
  const v = poolVerdict([
    { templateName: "a", sent: 100, replied: 10 },
    { templateName: "b", sent: 100, replied: 10 },
  ]);
  assert.equal(v.ready, true);
  assert.equal(v.winner, null);
});

test("הסף הוא 30 ולא מספר שהשתנה בטעות", () => {
  assert.equal(MIN_SENDS_FOR_VERDICT, 30);
});

test("אחוז תגובות על אפס שליחות לא מתפוצץ", () => {
  assert.equal(replyRate({ templateName: "a", sent: 0, replied: 0 }), 0);
});

/* ---------- החיבור למנוע ---------- */

test("המתזמן בוחר מהבנק ולא שולח את התבנית הקבועה", () => {
  const rules = io.readFileSync("lib/rules.ts", "utf8");

  assert.ok(
    rules.includes("templateForRule"),
    "המתזמן לא עובר דרך ההכרעה של הבנק"
  );
  assert.ok(
    rules.includes("templateName: chosen"),
    "המשימה נוצרת עם התבנית הקבועה במקום עם התורנית"
  );
  assert.ok(
    rules.includes("poolCursor"),
    "המונה לא מתקדם - כל הלידים היו מקבלים את אותה תבנית"
  );
});

test("המונה מתקדם רק כשיש באמת מה לסובב", () => {
  const rules = io.readFileSync("lib/rules.ts", "utf8");
  assert.ok(
    rules.includes("pool.length > 1"),
    "המונה מתקדם גם על בנק של אחת - כתיבה מיותרת בכל תזמון"
  );
});

test("שינוי הבנק מאפס את המונה", () => {
  const api = io.readFileSync("app/api/rules/[id]/route.ts", "utf8");
  assert.ok(
    api.includes("poolCursor = 0"),
    "בנק חדש היה ממשיך מאמצע הסבב הישן"
  );
});

/* ---------- הסטטוס החדש והחוקים ---------- */

test("הסטטוס 'אין מענה 2' קיים", () => {
  const statuses = io.readFileSync("lib/statuses.ts", "utf8");
  assert.ok(statuses.includes("אין מענה 2"));
});

test("חוקי הפולואפ אחרי הצעת מחיר הם רצף של שלושה צעדים", () => {
  const rules = io.readFileSync("lib/rules.ts", "utf8");
  /** כל צעד נגזר עד סוף הרשומה שלו, אחרת כולם נראים זהים */
  const steps = rules
    .split('triggerStatus: "נשלחה הצעת מחיר"')
    .slice(1)
    .map((b) => b.split("},")[0]);

  /** שלוש שליחות ועוד התראה אחת שמזכירה לך להתקשר */
  assert.equal(
    steps.length,
    4,
    `צפויים 3 צעדי שליחה + התראה, נמצאו ${steps.length}`
  );
  assert.equal(
    steps.filter((b) => b.includes('action: "send_template"')).length,
    3
  );

  /** 6 שעות, יומיים, חמישה ימים - בדיוק מה שאושר */
  assert.ok(rules.includes("delayMinutes: 6 * 60"));
  assert.ok(rules.includes("delayMinutes: 2 * 24 * 60"));
  assert.ok(rules.includes("delayMinutes: 5 * 24 * 60"));
});

test("חוקים עם תבניות שעוד לא אושרו נשארים כבויים", () => {
  /**
   * חוק פעיל עם שם תבנית שלא קיים בטקסטר נכשל על כל
   * ליד שמגיע לסטטוס - שקט מבחוץ, ושום הודעה לא יוצאת.
   */
  const rules = io.readFileSync("lib/rules.ts", "utf8");

  for (const block of rules.split(/\{\s*\n\s*triggerStatus:/).slice(1)) {
    const body = block.split("},")[0];
    if (!body.includes("TBD")) continue;
    assert.ok(
      body.includes("active: false"),
      `חוק עם תבנית TBD נשאר פעיל: ${body.slice(0, 120)}`
    );
  }
});

/* ---------- הסטטוס החדש מגיע באמת למערכת שעובדת ---------- */

test("יש דרך לטעון סטטוס שנוסף בעדכון למערכת קיימת", () => {
  /**
   * הסטטוסים נטענים למסד רק כשהטבלה ריקה. בלי פעולת
   * התחזוקה הזו, "אין מענה 2" היה קיים בקוד ולא קיים
   * במערכת שלו - כלומר לא קיים.
   */
  const route = io.readFileSync(
    "app/api/maintenance/seed-new/route.ts",
    "utf8"
  );

  assert.ok(route.includes("DEFAULT_STATUSES"));
  assert.ok(route.includes("DEFAULT_RULES"));

  /** מוסיף בלבד - אסור שימחק או ידרוס חוק קיים */
  assert.ok(
    !/db\.status\.(delete|upsert)/.test(route),
    "הפעולה מוחקת או דורסת סטטוסים קיימים"
  );
  assert.ok(
    !/db\.rule\.(update|delete|upsert)/.test(route),
    "הפעולה נוגעת בחוקים קיימים"
  );

  /**
   * העדכון היחיד המותר על סטטוס קיים: השלמת קטגוריה
   * לסטטוס שאין לו אחת. שיוך שרובי עשה בעצמו לא נדרס,
   * ושום שדה אחר לא נוגעים בו.
   */
  const updates = [...route.matchAll(/db\.status\s*\.update\w*\(([\s\S]*?)\n      \)/g)];
  for (const [, block] of updates) {
    assert.ok(
      block.includes("category: def.category"),
      "עדכון על סטטוס קיים שנוגע במשהו מלבד קטגוריה"
    );
    assert.ok(
      block.includes("category: null"),
      "הקטגוריה מתעדכנת גם כשכבר יש אחת - שיוך ידני נדרס"
    );
  }

  /** חוק חדש במערכת שעובדת לא מתחיל לשלוח מעצמו */
  assert.ok(
    route.includes("active: false"),
    "חוק חדש נכנס פעיל ומתחיל לשלוח בלי שביקשת"
  );
});

test("הפעולה מופיעה במסך התחזוקה", () => {
  const screen = io.readFileSync("components/MaintenanceScreen.tsx", "utf8");
  assert.ok(
    screen.includes("seed-new"),
    "הפעולה קיימת בשרת אבל אין אליה דרך מהמסך"
  );
});

/* ---------- התבניות שהחוקים מצפים להן ---------- */

test("כל שם תבנית בחוקים קיים ברשימת ההקמה", () => {
  /**
   * **הכשל הכי יקר כאן.** חוק פעיל שמפנה לשם שלא קיים
   * נכשל על כל ליד, בשקט, ונראה בדיוק כמו "אף אחד לא
   * ענה". הבדיקה הזו תופסת שם שהשתנה בצד אחד בלבד.
   */
  const rules = io.readFileSync("lib/rules.ts", "utf8");
  const drafts = io.readFileSync("lib/template-drafts.ts", "utf8");

  const names = new Set<string>();

  for (const m of rules.matchAll(/templateName: "([^"]+)"/g)) {
    names.add(m[1]);
  }
  for (const m of rules.matchAll(/templatePool: "([^"]+)"/g)) {
    for (const n of m[1].split(",")) names.add(n.trim());
  }

  /** התבניות הוותיקות קיימות אצלו מזמן ולא נוצרו כאן */
  const legacy = /^inbox_marketing_/;

  for (const name of names) {
    if (legacy.test(name)) continue;
    assert.ok(
      drafts.includes(`name: "${name}"`),
      `החוקים מצפים ל-${name} אבל הוא לא ברשימת ההקמה`
    );
  }
});

test("שמות התבניות תקינים לטקסטר", () => {
  const drafts = io.readFileSync("lib/template-drafts.ts", "utf8");

  for (const m of drafts.matchAll(/name: "([^"]+)"/g)) {
    assert.ok(
      /^[a-z0-9_]+$/.test(m[1]),
      `${m[1]} לא יתקבל כשם תבנית - רק אותיות קטנות, מספרים וקו תחתון`
    );
  }
});

test("כל תבנית מכילה את משתנה השם", () => {
  const drafts = io.readFileSync("lib/template-drafts.ts", "utf8");

  for (const m of drafts.matchAll(/body:\s*(["'])([\s\S]*?)\1,/g)) {
    assert.ok(
      m[2].includes("{{1}}"),
      `תבנית בלי {{1}} תצא בלי שם הלקוח: ${m[2].slice(0, 50)}`
    );
  }
});

test("יש תבניות לכל ארבעת הסטטוסים", () => {
  const drafts = io.readFileSync("lib/template-drafts.ts", "utf8");

  for (const status of [
    "אין מענה",
    "אין מענה 2",
    "נשלחה הצעת מחיר",
    "לא מעוניין",
  ]) {
    assert.ok(
      drafts.includes(`status: "${status}"`),
      `אין תבניות לסטטוס ${status}`
    );
  }
});

test("תבניות הפולואפ לא מניחות שההצעה נשלחה בכתב", () => {
  /**
   * רובי לא תמיד שולח הצעה - לפעמים הוא רק מספר עליה
   * בשיחה. "שלחתי לך את פרטי ההצעה" ללקוח שלא קיבל
   * כלום נראה כמו הודעה שנשלחה בטעות.
   */
  const drafts = io.readFileSync("lib/template-drafts.ts", "utf8");
  const block = drafts.slice(
    drafts.indexOf("quote_followup_1"),
    drafts.indexOf("notinterested_1")
  );

  for (const phrase of ["שלחתי לך", "ההצעה הגיעה", "שההצעה הגיעה"]) {
    assert.ok(
      !block.includes(phrase),
      `תבנית פולואפ מניחה שליחה בכתב: "${phrase}"`
    );
  }
});

/* ---------- ההתראות ---------- */

test("ההתראה אומרת מה לעשות ולא רק מה קרה", () => {
  const runner = io.readFileSync("lib/runner.ts", "utf8");

  assert.ok(
    runner.includes("rule?.note"),
    "ההתראה עדיין מציגה משפט קבוע לכל הסטטוסים"
  );
  /** אסור לקרוא את ההערה מהמשימה - השדה הזה מסמן דיוור */
  assert.ok(
    !runner.includes("title: job.note"),
    "ההתראה קוראת שדה שכבר נושא משמעות אחרת"
  );
});

test("לכל סטטוס מעקב יש התראה ולא רק הודעה", () => {
  const rules = io.readFileSync("lib/rules.ts", "utf8");

  for (const status of ["אין מענה", "אין מענה 2", "נשלחה הצעת מחיר"]) {
    const blocks = rules
      .split(`triggerStatus: "${status}"`)
      .slice(1)
      .map((b) => b.split("},")[0]);

    assert.ok(
      blocks.some((b) => b.includes('action: "notify"')),
      `לסטטוס ${status} אין התראה שתזכיר לך להתקשר`
    );
  }
});

test("ההתראות דלוקות - הן לא שולחות כלום ללקוח", () => {
  /**
   * חוק שליחה כבוי כי התבנית עוד לא אושרה. התראה היא
   * פנימית בלבד, ואין סיבה שתחכה לאישור של מטא.
   */
  const rules = io.readFileSync("lib/rules.ts", "utf8");

  for (const block of rules.split(/\{\s*\n(?:\s*\/\*\*[\s\S]*?\*\/\n)?\s*triggerStatus:/).slice(1)) {
    const body = block.split("},")[0];
    if (!body.includes('action: "notify"')) continue;
    assert.ok(
      body.includes("active: true"),
      `התראה נכנסה כבויה: ${body.slice(0, 120)}`
    );
  }
});

test("מסך התבניות להקמה מופיע בתפריט", () => {
  const more = io.readFileSync("app/more/page.tsx", "utf8");
  const nav = io.readFileSync("components/Nav.tsx", "utf8");

  assert.ok(more.includes("/template-drafts"), "המסך קיים אבל אין אליו דרך");
  assert.ok(nav.includes("/template-drafts"), "התפריט התחתון לא יסמן את המסך");
});


/* ============================================================
 *  תבנית שבורה לא עולה בליד
 * ============================================================
 *
 *  **הכשל שנתפס בשטח:** "חלק מהתבניות הוא שולח וחלק לא."
 *
 *  בנק של שלוש תבניות מתחלף בסבב. אם אחת מהן לא קיימת
 *  בטקסטר או לא מאושרת, כל ליד שלישי לא קיבל כלום -
 *  והדפוס נראה אקראי, כי הוא תלוי רק במונה הסבב.
 */

const POOL = { templateName: "ברירת_מחדל", templatePool: "a,b,c" };

/** b שבורה */
const works = (name: string) => name !== "b";

test("תבנית שבורה מדולגת, והסבב ממשיך על התקינות", () => {
  const got = [0, 1, 2, 3].map((c) => templateForRule(POOL, c, works).chosen);
  assert.deepEqual(got, ["a", "c", "a", "c"], "השבורה עדיין יוצאת");
});

test("הדילוג מדווח ולא נבלע", () => {
  /**
   * אחרת היינו מחליפים כשל גלוי בכשל שקט - בדיוק מה
   * שאנחנו מנקים מהמערכת.
   */
  const r = templateForRule(POOL, 0, works);
  assert.deepEqual(r.skipped, ["b"], "לא דווח מה דולג");
});

test("החלוקה נשארת שווה בין התקינות", () => {
  const counts: Record<string, number> = {};
  for (let c = 0; c < 60; c++) {
    const name = templateForRule(POOL, c, works).chosen!;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  assert.equal(counts["a"], 30);
  assert.equal(counts["c"], 30);
  assert.equal(counts["b"], undefined);
});

test("בנק שכולו שבור נופל לתבנית הבודדת אם היא תקינה", () => {
  const r = templateForRule(POOL, 0, (n) => n === "ברירת_מחדל");
  assert.equal(r.chosen, "ברירת_מחדל", "הליד נשאר בלי הודעה בלי צורך");
});

test("כשאין אף תבנית תקינה - לא נבחרת שבורה", () => {
  /**
   * שליחה שתיכשל ממילא רק מסתירה את הסיבה. עדיף null,
   * והמנוע מתריע בשם הסטטוס.
   */
  const r = templateForRule(POOL, 0, () => false);
  assert.equal(r.chosen, null);
  assert.deepEqual(r.skipped, ["a", "b", "c"]);
});

test("תבנית בודדת שבורה מדווחת ולא נשלחת", () => {
  const r = templateForRule({ templateName: "שבורה", templatePool: null }, 0, () => false);
  assert.equal(r.chosen, null);
  assert.deepEqual(r.skipped, ["שבורה"]);
});

test("בלי בדיקת תקינות ההתנהגות זהה לקודם", () => {
  /** לא נמסרה פונקציה - שום דבר לא מסונן */
  const got = [0, 1, 2].map((c) => templateForRule(POOL, c).chosen);
  assert.deepEqual(got, ["a", "b", "c"]);
});

/* ---------- החיווט במנוע ---------- */

test("המתזמן מסנן לפי מה שקיים ומאושר", () => {
  const rules = io.readFileSync("lib/rules.ts", "utf8");

  assert.ok(rules.includes("db.template"), "לא נבדק מה קיים");
  assert.ok(rules.includes("t.approved"), "תבנית לא מאושרת נחשבת תקינה");
  assert.ok(
    rules.includes("templateForRule(rule, rule.poolCursor, isUsable)"),
    "הסינון לא מחובר לבחירה"
  );
});

test("טבלת תבניות ריקה לא משתיקה את כל המערכת", () => {
  /**
   * טבלה ריקה פירושה שהסנכרון לא רץ, ולא שכל התבניות
   * שבורות. חסימה במצב כזה הייתה עוצרת כל הודעה
   * במערכת.
   */
  const rules = io.readFileSync("lib/rules.ts", "utf8");
  assert.ok(
    rules.includes("templateRows.length === 0 ? true"),
    "סנכרון שלא רץ יחסום את כל ההודעות"
  );
});

test("אין תבנית תקינה - מתריע ולא שולח", () => {
  const rules = io.readFileSync("lib/rules.ts", "utf8");
  assert.ok(rules.includes("אין תבנית תקינה לסטטוס"), "אין התראה");
  assert.ok(rules.includes("template_skipped"), "הדילוג לא מתועד");
});

/* ============================================================
 *  הרשימה המקומית חייבת לשקף את טקסטר
 * ============================================================
 *
 *  הדילוג על תבנית שבורה שווה בדיוק כמה שהרשימה המקומית
 *  מעודכנת. שני כשלים היו כאן:
 *
 *  1. הסנכרון רץ רק בלחיצת כפתור.
 *  2. תבנית שנמחקה בטקסטר נשארה מסומנת מאושרת **לנצח** -
 *     הסנכרון עדכן רק את מה שחזר, ומה שנעלם לא נגעו בו.
 */

const sync = io.readFileSync("lib/template-sync.ts", "utf8");

test("תבנית שנעלמה מטקסטר מסומנת כלא זמינה", () => {
  assert.ok(sync.includes("notIn: live"), "מה שנעלם נשאר מאושר לנצח");
  assert.ok(sync.includes("approved: false"), "הסימון לא מבוצע");
});

test("תבנית שנעלמה לא נמחקת", () => {
  /** השורה מקושרת לחוקים ולהודעות - מחיקה מוחקת את המדידה */
  assert.ok(!sync.includes("deleteMany"), "שורות נמחקות");
  assert.ok(!sync.includes("db.template.delete"), "שורות נמחקות");
});

test("תשובה שלא פוענחה לא מסמנת הכל כלא זמין", () => {
  /**
   * תשובה שלא הצלחנו לקרוא אינה הוכחה שאין תבניות.
   * סימון גורף במצב כזה היה משתיק את כל המערכת.
   */
  const guard = sync.indexOf("templates.length === 0");
  const disable = sync.indexOf("notIn: live");
  assert.ok(guard > -1 && disable > -1);
  assert.ok(guard < disable, "סימון גורף רץ לפני בדיקת השפיות");
});

test("הסנכרון רץ אוטומטית מהמנוע", () => {
  const runner = io.readFileSync("lib/runner.ts", "utf8");
  assert.ok(
    runner.includes("syncTemplatesIfStale()"),
    "הרשימה מתעדכנת רק בלחיצת כפתור"
  );
  assert.ok(
    runner.includes("syncTemplatesIfStale().catch"),
    "כישלון בסנכרון יעצור את כל המנוע"
  );
});

test("אין שתי גרסאות של סנכרון", () => {
  /** הכפילות הזו היא בדיוק מה שגרם לנזק כאן */
  const route = io.readFileSync("app/api/templates/sync/route.ts", "utf8");
  assert.ok(route.includes("syncTemplates()"), "הנתיב לא משתמש במשותף");
  assert.ok(!route.includes("db.template.upsert"), "הנתיב מחזיק עותק משלו");
  assert.ok(!route.includes("parseTemplates"), "הנתיב מפענח בעצמו");
});

console.log(`✓ template-pool: ${passed} בדיקות עברו`);
