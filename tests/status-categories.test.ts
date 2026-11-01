import assert from "node:assert/strict";
import io from "node:fs";
import {
  groupByCategory,
  categoryNames,
  DEFAULT_STATUSES,
  CAT_OTHER,
  CAT_NO_ANSWER,
  type StatusDef,
} from "../lib/statuses";

/**
 * ============================================================
 *  נעילה על קטגוריות הסטטוסים
 * ============================================================
 *
 *  **מה עלול להישבר בשקט.** סטטוס שנופל בין הקטגוריות
 *  פשוט נעלם מהבורר - ואז אי אפשר להעביר אליו ליד, בלי
 *  שום הודעת שגיאה. לכן הבדיקה המרכזית כאן היא שכל
 *  סטטוס מופיע בדיוק פעם אחת.
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

const s = (name: string, category?: string | null): StatusDef => ({
  name,
  color: "#000000",
  category: category ?? null,
});

/* ---------- אף סטטוס לא נעלם ---------- */

test("כל סטטוס מופיע בדיוק פעם אחת", () => {
  const list = [
    s("א", "ראשונה"),
    s("ב", "שנייה"),
    s("ג", "ראשונה"),
    s("ד"),
  ];

  const flat = groupByCategory(list).flatMap((g) => g.statuses.map((x) => x.name));

  assert.equal(flat.length, list.length, "סטטוס נעלם או שוכפל");
  assert.deepEqual([...flat].sort(), ["א", "ב", "ג", "ד"]);
});

test("ברירת המחדל עוברת שלמה דרך הקיבוץ", () => {
  const flat = groupByCategory(DEFAULT_STATUSES).flatMap((g) => g.statuses);
  assert.equal(flat.length, DEFAULT_STATUSES.length);
});

test("סטטוס בלי קטגוריה נופל ל'אחרים' ולא נעלם", () => {
  const groups = groupByCategory([s("יתום"), s("א", "יש")]);
  const other = groups.find((g) => g.category === CAT_OTHER);

  assert.ok(other, "אין קבוצת אחרים");
  assert.deepEqual(other!.statuses.map((x) => x.name), ["יתום"]);
});

test("קטגוריה ריקה או רווחים נחשבת כלא מסווג", () => {
  const groups = groupByCategory([s("א", "   "), s("ב", "")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].category, CAT_OTHER);
});

/* ---------- הסדר ---------- */

test("'אחרים' תמיד אחרונה", () => {
  const groups = groupByCategory([s("יתום"), s("א", "קטגוריה"), s("ב", "עוד")]);
  assert.equal(groups[groups.length - 1].category, CAT_OTHER);
});

test("סדר הקטגוריות נגזר מסדר הסטטוסים", () => {
  /**
   * אין סדר שני לתחזק: גרירת סטטוס במסך ההגדרות מזיזה
   * גם את הקטגוריה שלו.
   */
  const groups = groupByCategory([s("א", "שנייה"), s("ב", "ראשונה")]);
  assert.equal(groups[0].category, "שנייה");
  assert.equal(groups[1].category, "ראשונה");
});

test("סטטוסים בתוך קטגוריה שומרים על סדרם", () => {
  const groups = groupByCategory([
    s("א", "ק"),
    s("ב", "אחרת"),
    s("ג", "ק"),
  ]);
  const first = groups.find((g) => g.category === "ק")!;
  assert.deepEqual(first.statuses.map((x) => x.name), ["א", "ג"]);
});

/* ---------- רשימת הקטגוריות ---------- */

test("שמות הקטגוריות בלי כפילויות ובלי ריקים", () => {
  const names = categoryNames([
    s("א", "ק"),
    s("ב", "ק"),
    s("ג"),
    s("ד", "  "),
    s("ה", "אחרת"),
  ]);
  assert.deepEqual(names, ["ק", "אחרת"]);
});

test("רשימה ריקה לא מפילה כלום", () => {
  assert.deepEqual(groupByCategory([]), []);
  assert.deepEqual(categoryNames([]), []);
});

/* ---------- ברירות המחדל ---------- */

test("כל סטטוס ברירת מחדל משויך לקטגוריה", () => {
  /**
   * סטטוס ברירת מחדל בלי קטגוריה היה נוחת ב"אחרים" -
   * כלומר הרשימה הארוכה חוזרת דרך הדלת האחורית.
   */
  for (const status of DEFAULT_STATUSES) {
    assert.ok(
      (status.category ?? "").trim(),
      `לסטטוס "${status.name}" אין קטגוריה`
    );
  }
});

test("שני סטטוסי אין המענה יושבים יחד", () => {
  const groups = groupByCategory(DEFAULT_STATUSES);
  const group = groups.find((g) => g.category === CAT_NO_ANSWER)!;
  const names = group.statuses.map((x) => x.name);

  assert.ok(names.includes("אין מענה"));
  assert.ok(names.includes("אין מענה 2"));
});

test("אין שני סטטוסים עם אותו שם", () => {
  const names = DEFAULT_STATUSES.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, "סטטוס כפול ברשימה");
});

test("אין שני סטטוסים עם אותו צבע", () => {
  /** צבע כפול מבטל את כל התועלת של הפס הצדדי */
  const colors = DEFAULT_STATUSES.map((x) => x.color);
  assert.equal(new Set(colors).size, colors.length, "צבע חוזר על עצמו");
});

/* ---------- הבורר והמסד ---------- */

test("הבורר מקבץ ולא מציג רשימה שטוחה", () => {
  const sheet = io.readFileSync("components/StatusSheet.tsx", "utf8");

  assert.ok(
    sheet.includes("groupByCategory"),
    "הבורר עדיין מציג את כל הסטטוסים ברשימה אחת"
  );
  /** קטגוריה עם סטטוס אחד לא שולחת אותך למסך ביניים ריק */
  assert.ok(
    sheet.includes("group.statuses.length === 1"),
    "קטגוריה של סטטוס אחד פותחת מסך מיותר"
  );
});

test("הקטגוריה נשמרת במסד ולא רק במסך", () => {
  const schema = io.readFileSync("prisma/schema.prisma", "utf8");
  const model = schema.slice(
    schema.indexOf("model Status {"),
    schema.indexOf("}", schema.indexOf("model Status {"))
  );
  assert.ok(model.includes("category"), "אין שדה קטגוריה על הסטטוס");

  const store = io.readFileSync("lib/status-store.ts", "utf8");
  assert.ok(
    store.includes("category"),
    "הקטגוריה לא נקראת מהמסד - תמיד תיראה ריקה"
  );

  const api = io.readFileSync("app/api/statuses/[id]/route.ts", "utf8");
  assert.ok(api.includes("category"), "אי אפשר לשמור קטגוריה");
});

test("שינוי הקטגוריה לא נוגע בשום שדה אחר", () => {
  /**
   * שמירת קטגוריה ששולחת גם צבע או עמלה הייתה דורסת
   * שינוי שעשית במקביל במסך אחר.
   */
  const editor = io.readFileSync("components/StatusesEditor.tsx", "utf8");
  const fn = editor.slice(
    editor.indexOf("async function saveCategory"),
    editor.indexOf("async function saveCommission")
  );
  assert.ok(fn.includes("JSON.stringify({ category: value })"));
});

/* ---------- הפלטה ---------- */

test("הפלטה הורחבה ואין בה צבע כפול", () => {
  const editor = io.readFileSync("components/StatusesEditor.tsx", "utf8");
  const block = editor.slice(
    editor.indexOf("const PALETTE"),
    editor.indexOf("];", editor.indexOf("const PALETTE"))
  );

  const colors = [...block.matchAll(/#[0-9a-f]{6}/gi)].map((m) =>
    m[0].toLowerCase()
  );

  assert.ok(colors.length >= 40, `רק ${colors.length} צבעים בפלטה`);
  assert.equal(
    new Set(colors).size,
    colors.length,
    "אותו צבע מופיע פעמיים בפלטה"
  );
});

test("כל צבעי ברירת המחדל קיימים בפלטה", () => {
  /** אחרת סטטוס קיים נראה בצבע שאי אפשר לבחור שוב */
  const editor = io.readFileSync("components/StatusesEditor.tsx", "utf8");
  const block = editor.slice(
    editor.indexOf("const PALETTE"),
    editor.indexOf("];", editor.indexOf("const PALETTE"))
  );

  for (const status of DEFAULT_STATUSES) {
    assert.ok(
      block.toLowerCase().includes(status.color.toLowerCase()),
      `הצבע של "${status.name}" (${status.color}) לא בפלטה`
    );
  }
});

console.log(`✓ status-categories: ${passed} בדיקות עברו`);
