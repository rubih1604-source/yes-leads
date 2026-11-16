/**
 * ============================================================
 *  בדיקת תחביר על **כל** הפרויקט
 * ============================================================
 *
 *  **למה הקובץ הזה קיים, ולמה הוא בתוך הפרויקט.**
 *
 *  בדיקה שרצה מחוץ לפרויקט היא בדיקה שאפשר לשכוח, ושאפשר
 *  להריץ עם רשימת תיקיות חלקית בלי לשים לב. בדיוק זה קרה:
 *  הבדיקה רצה על `app`, `lib` ו-`tests` בלבד, **ולא על
 *  `components`** - ולכן סוגר מיותר שנשאר בקובץ רכיב עבר
 *  אותה בשקט, דיווח "0 כשלים", והפיל את הבנייה ברנדר.
 *
 *  מהיום הרשימה היא "כל מה שיש", לא רשימה שמישהו זוכר
 *  לעדכן. תיקייה חדשה נבדקת מעצמה.
 *
 *  הרצה:  node scripts/check-syntax.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";

/** מה שלא נבדק: תלויות, פלט בנייה, וגיט */
const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".vercel",
  "coverage",
]);

const root = resolve(process.argv[2] ?? ".");

const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;

    const path = join(dir, name);

    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }

    if ([".ts", ".tsx", ".mts", ".cts"].includes(extname(path))) {
      files.push(path);
    }
  }
}

walk(root);

let esbuild;

try {
  esbuild = await import("esbuild");
} catch {
  /**
   * בלי esbuild אין בדיקה - ולכן יוצאים בשגיאה.
   *
   * "לא הצלחתי לבדוק" חייב להיכשל ולא להיראות כמו "הכל
   * תקין". בדיקה שמדווחת הצלחה כשהיא לא רצה היא גרועה
   * מכלום.
   */
  console.error("esbuild לא זמין - אי אפשר לבדוק תחביר");
  process.exit(2);
}

let bad = 0;

for (const file of files) {
  try {
    esbuild.transformSync(readFileSync(file, "utf8"), {
      loader: extname(file) === ".tsx" ? "tsx" : "ts",
      tsconfigRaw: { compilerOptions: { jsx: "preserve" } },
    });
  } catch (err) {
    bad++;
    console.error(`\nשגיאת תחביר: ${file}`);
    console.error(String(err).split("\n").slice(0, 6).join("\n"));
  }
}

console.log(
  `\nנבדקו ${files.length} קבצים ב-${root} · ${bad} עם שגיאת תחביר`
);

process.exit(bad > 0 ? 1 : 0);
