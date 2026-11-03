import assert from "node:assert/strict";
import io from "node:fs";
import path from "node:path";

/**
 * ============================================================
 *  אין תלות מעגלית בין קבצים
 * ============================================================
 *
 *  **הכשל היקר ביותר עד כה, והכי קשה לראות.**
 *
 *  lib/rules טען את lib/runner בזמן ריצה, ו-lib/runner
 *  ייבא את lib/rules בראש הקובץ. בבנייה של Next שני
 *  הקבצים נדחסו לאותה חבילה, ואז אחד מהם ניסה להשתמש
 *  בשני לפני שאותחל:
 *
 *    ReferenceError: Cannot access '_' before initialization
 *
 *  השגיאה נזרקה **בכל הודעה נכנסת**. הבוט לא הספיק לעשות
 *  כלום, והאבחון הראה שכל התנאים מתקיימים - כי הם אכן
 *  התקיימו. הקוד פשוט לא רץ.
 *
 *  **למה בדיקה ולא רק תיקון.** מעגל כזה לא מפיל בנייה,
 *  לא מפיל טיפוסים, ולא נראה בקריאת הקוד - הוא מתפוצץ
 *  רק בזמן ריצה בשרת. הדרך היחידה לתפוס אותו מראש היא
 *  לסרוק את הייבואים.
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

type Graph = Record<string, Set<string>>;

const ROOTS = ["lib", "app"];

function sourceFiles(): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const name of io.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (io.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
  };

  for (const root of ROOTS) if (io.existsSync(root)) walk(root);
  return out;
}

function resolve(from: string, raw: string): string | null {
  const base = raw.startsWith("@/")
    ? raw.slice(2)
    : path.normalize(path.join(path.dirname(from), raw));

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "route.ts"),
    path.join(base, "index.ts"),
  ]) {
    if (io.existsSync(candidate)) return path.normalize(candidate);
  }
  return null;
}

function build(): { statics: Graph; dynamics: Graph } {
  const statics: Graph = {};
  const dynamics: Graph = {};

  for (const file of sourceFiles()) {
    const src = io.readFileSync(file, "utf8");
    const s = new Set<string>();
    const d = new Set<string>();

    for (const m of src.matchAll(
      /^\s*import\s[^;]*?from\s+"(@\/[^"]+|\.{1,2}\/[^"]+)"/gm
    )) {
      const r = resolve(file, m[1]);
      if (r) s.add(r);
    }

    for (const m of src.matchAll(
      /import\(\s*"(@\/[^"]+|\.{1,2}\/[^"]+)"\s*\)/g
    )) {
      const r = resolve(file, m[1]);
      if (r) d.add(r);
    }

    statics[file] = s;
    dynamics[file] = d;
  }

  return { statics, dynamics };
}

const { statics, dynamics } = build();

function reaches(from: string, target: string): string[] | null {
  const stack: Array<[string, string[]]> = [[from, [from]]];
  const seen = new Set<string>();

  while (stack.length) {
    const [node, trail] = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);

    for (const next of statics[node] ?? []) {
      if (next === target) return [...trail, next];
      stack.push([next, [...trail, next]]);
    }
  }

  return null;
}

test("אין מעגל בייבואים הרגילים", () => {
  for (const file of Object.keys(statics)) {
    for (const dep of statics[file]) {
      const back = reaches(dep, file);
      assert.ok(
        !back,
        `תלות מעגלית: ${file} → ${back?.join(" → ")}`
      );
    }
  }
});

test("אין מעגל שעובר דרך ייבוא דינמי", () => {
  /**
   * זה בדיוק הסוג שהפיל את הבוט: צד אחד טוען בזמן ריצה,
   * הצד השני מייבא בראש הקובץ. אף כלי רגיל לא מתלונן.
   */
  for (const file of Object.keys(dynamics)) {
    for (const target of dynamics[file]) {
      if (target === file) continue;

      const back = reaches(target, file);
      assert.ok(
        !back,
        `תלות מעגלית דרך ייבוא דינמי: ${file} --טוען--> ${back?.join(" → ")}`
      );
    }
  }
});

test("הסריקה באמת מוצאת קבצים", () => {
  /** בדיקה שעוברת על רשימה ריקה לא בודקת כלום */
  const count = Object.keys(statics).length;
  assert.ok(count > 50, `נסרקו רק ${count} קבצים - הסריקה לא עובדת`);
  assert.ok(statics["lib/bot.ts"], "lib/bot.ts לא נסרק");
});

test("המנוע לא מייבא את החוקים בראש הקובץ", () => {
  /** הצד שנשבר במעגל המקורי */
  const runner = io.readFileSync("lib/runner.ts", "utf8");
  assert.ok(
    !/^\s*import\s[^;]*from\s+"\.\/rules"/m.test(runner),
    "חזר הייבוא שיצר את המעגל"
  );
});

console.log(`✓ import-cycles: ${passed} בדיקות עברו`);
