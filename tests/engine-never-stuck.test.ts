/**
 * ============================================================
 *  המנוע לא יכול להיתקע, ולא יכול להשתתק
 * ============================================================
 *
 *  **המקרה שהבדיקה הזו נולדה ממנו.**
 *
 *  שינית סטטוס ל"נשלחה הצעת מחיר" בעשרות לידים. החוק
 *  הוגדר לשלוח הודעה אחרי 5 שעות. **אף אחד לא קיבל
 *  כלום.** לא שגיאה, לא התראה, לא כישלון - פשוט כלום.
 *
 *  **הסיבה, ושלושה חלקים לה, כולם שלי:**
 *
 *   1. `fetch` בלי תקרת זמן **לא נכשל - הוא תלוי לנצח**.
 *      השרת השני לא עונה ולא סוגר, וההבטחה לא נפתרת.
 *
 *   2. המנוע מסמן "אני רץ" לפני שהוא מתחיל ומוריד את
 *      הסימון ב-`finally`. קריאה תלויה = `finally` לא
 *      מגיע = **הנעילה דלוקה לנצח**. כל סבב חדש ראה
 *      "כבר רץ" ודילג.
 *
 *   3. התחזוקה - סנכרון תבניות מטקסטר ובדיקת פערים מול
 *      פייסבוק - רצה **לפני** המשימות. כלומר כל הודעה
 *      חיכתה לשתי מערכות חיצוניות.
 *
 *  שלושתם יחד: מערכת שנראית תקינה לגמרי ופשוט הפסיקה
 *  לעשות דברים. זה הכשל הגרוע ביותר שיש, כי אין לו שום
 *  סימן.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { DEFAULT_TIMEOUT_MS } from "../lib/fetch-timeout";

/**
 * `runner` נקרא כטקסט ולא מיובא.
 *
 * הוא מושך את לקוח פריזמה, שלא מותקן בסביבת הבדיקות -
 * ובדיקה שלא יכולה לרוץ שווה בדיוק כמו בדיקה שלא קיימת.
 */

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
const runner = read("../lib/runner.ts");

/* ============================================================
 *  1. אין אף קריאה החוצה בלי תקרת זמן
 * ========================================================= */
console.log("\nכל קריאה החוצה חייבת להיגמר");

test("**אין שום fetch גולמי בכל הפרויקט**", () => {
  /**
   * זו הבדיקה המרכזית. `fetch` אחד בלי תקרת זמן מספיק
   * כדי להשתיק את כל המערכת, ולכן אין כאן יוצאים מן
   * הכלל - גם לא "רק לקריאה הזו".
   */
  /**
   * **קוד שרת בלבד: `lib` ו-`app/api`.**
   *
   * קריאה מהדפדפן (כפתור במסך שקורא ל-API שלנו) לא
   * יכולה להקפיא את המנוע - במקרה הגרוע כפתור נשאר
   * מסתובב. מה שמסוכן הוא קריאה שיוצאת **מהשרת** למערכת
   * חיצונית, וזה בדיוק מה שנבדק כאן.
   */
  const root = new URL("../", import.meta.url).pathname;
  const SKIP = new Set(["node_modules", ".git", ".next", "dist"]);
  const offenders: string[] = [];

  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (![".ts", ".tsx"].includes(extname(path))) continue;

      const src = readFileSync(path, "utf8");

      /** הקובץ שמגדיר את העטיפה הוא היחיד שקורא ל-fetch */
      if (path.endsWith("lib/fetch-timeout.ts")) continue;

      for (const m of src.matchAll(/(?<![A-Za-z])fetch\(/g)) {
        const before = src.slice(Math.max(0, m.index - 20), m.index);
        if (before.endsWith("WithTimeout")) continue;
        offenders.push(path.replace(root, ""));
        break;
      }
    }
  })(join(root, "lib"));

  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (![".ts", ".tsx"].includes(extname(path))) continue;

      const src = readFileSync(path, "utf8");

      for (const m of src.matchAll(/(?<![A-Za-z])fetch\(/g)) {
        const before = src.slice(Math.max(0, m.index - 20), m.index);
        if (before.endsWith("WithTimeout")) continue;
        offenders.push(path.replace(root, ""));
        break;
      }
    }
  })(join(root, "app", "api"));

  assert.deepEqual(
    offenders,
    [],
    `קריאות בלי תקרת זמן: ${offenders.join(", ")}`
  );
});

test("תקרת הזמן סבירה - לא קצרה מדי ולא אינסופית", () => {
  assert.ok(DEFAULT_TIMEOUT_MS >= 5_000, "קצר מדי - רשת איטית תיכשל");
  assert.ok(DEFAULT_TIMEOUT_MS <= 30_000, "ארוך מדי - סבב יתעכב");
});

test("נגמר הזמן = שגיאה אמיתית, לא תשובה ריקה", () => {
  const src = read("../lib/fetch-timeout.ts");
  assert.ok(
    /throw new Error\(`לא התקבלה תשובה/.test(src),
    "פסק זמן עובר בשקט - הקורא יחשוב שהכל תקין"
  );
});

/* ============================================================
 *  2. הנעילה לא יכולה להישאר דלוקה
 * ========================================================= */
console.log("\nהנעילה משחררת את עצמה");

test("הנעילה מחזיקה גם זמן, לא רק כן/לא", () => {
  assert.ok(
    runner.includes("let engineStartedAt = 0;"),
    "הנעילה לא יודעת מתי נלקחה - אי אפשר לדעת שהיא תקועה"
  );
});

test("סבב שמחזיק יותר מדי זמן מאבד את הנעילה", () => {
  assert.ok(
    runner.includes("engineRunning && heldFor < ENGINE_STUCK_MINUTES"),
    "נעילה תקועה תחסום את המנוע לנצח"
  );
  const limit = Number(
    runner.match(/ENGINE_STUCK_MINUTES = (\d+)/)?.[1] ?? 0
  );
  assert.ok(limit > 0 && limit <= 15, `תקרת הנעילה היא ${limit} דקות`);
});

test("**השתלטות על נעילה תקועה מתריעה**", () => {
  /**
   * אחרת החלפנו שקט אחד בשקט אחר: המנוע היה מתאושש,
   * ואף אחד לא היה יודע שהוא נפל.
   */
  assert.ok(
    runner.includes('title: "המנוע נתקע והופעל מחדש"'),
    "המנוע מתאושש בשקט - לא תדע שמשהו נפל"
  );
});

test("הנעילה משוחררת תמיד, גם בכישלון", () => {
  const at = runner.indexOf("} finally {");
  const block = runner.slice(at, at + 160);
  assert.ok(block.includes("engineRunning = false"));
  assert.ok(block.includes("engineStartedAt = 0"));
});

/* ============================================================
 *  3. המשימות רצות לפני התחזוקה
 * ========================================================= */
console.log("\nהמשימות קודם, התחזוקה אחר כך");

test("**שליחת ההודעות לא מחכה לטקסטר ולפייסבוק**", () => {
  const jobs = runner.indexOf("const summary = await runDueJobsInner(limit);");
  const sync = runner.indexOf("await syncTemplatesIfStale()");
  const gap = runner.indexOf("await checkFacebookGap()");

  assert.ok(jobs > -1, "המשימות לא רצות בכלל");
  assert.ok(sync > -1 && gap > -1, "התחזוקה נעלמה");

  assert.ok(
    jobs < sync,
    "סנכרון התבניות רץ לפני המשימות - הודעה תחכה לטקסטר"
  );
  assert.ok(
    jobs < gap,
    "בדיקת פייסבוק רצה לפני המשימות - הודעה תחכה לפייסבוק"
  );
});

test("כל שלב תחזוקה עטוף בנפרד", () => {
  /**
   * מחפשים **בתוך runDueJobs בלבד**.
   *
   * חיפוש על כל הקובץ היה מוצא את ההגדרה של הפונקציה
   * במקום את הקריאה לה, ונכשל בלי קשר למה שהוא בודק.
   * זו טעות שחוזרת, ולכן היא כתובה כאן.
   */
  const fn = runner.slice(
    runner.indexOf("export async function runDueJobs("),
    runner.indexOf("async function runDueJobsInner(")
  );

  for (const step of [
    "fillChannels()",
    "ensureLeadIndex()",
    "warnIfStuck()",
    "syncTemplatesIfStale()",
    "checkFacebookGap()",
  ]) {
    const at = fn.indexOf(step);
    assert.ok(at > -1, `${step} נעלם`);
    assert.ok(
      fn.slice(at, at + 60).includes("catch(() => null)"),
      `${step} לא עטוף - כישלון שלו יבלע את השאר`
    );
  }
});

test("הסיכום שחוזר הוא של המשימות, לא של התחזוקה", () => {
  const at = runner.indexOf("const summary = await runDueJobsInner(limit);");
  assert.ok(
    runner.slice(at).includes("return summary;"),
    "הסיכום אבד - המסכים יראו 0 נשלחו גם כשנשלח"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
