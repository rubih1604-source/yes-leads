/**
 * ============================================================
 *  בדיקה מלאה של הפרויקט, לפני שעולים לרנדר
 * ============================================================
 *
 *  **למה זה קיים.**
 *
 *  שתי בניות נכשלו ברנדר אחרי שנאמר "נבדק, הכל תקין".
 *  שתי הפעמים הבדיקה באמת רצה - ופשוט לא כיסתה את מה
 *  שנשבר: פעם אחת היא דילגה על תיקיית `components`
 *  שלמה, ופעם אחרת היא בדקה תחביר בלבד.
 *
 *  בדיקה שמדווחת "תקין" על מה שהיא לא בדקה גרועה מכלום,
 *  כי היא קונה ביטחון שלא קיים. לכן הקובץ הזה בודק **כל
 *  קובץ בפרויקט**, בלי רשימת תיקיות שצריך לזכור לעדכן,
 *  ומדווח במפורש מה הוא לא יכול לבדוק.
 *
 *  **מה הוא בודק:**
 *   1. תחביר - כל קובץ TS/TSX
 *   2. ייבוא - שכל `from "./x"` מצביע על קובץ שקיים
 *   3. ייצוא - שכל `import { X }` באמת מיוצא משם
 *   4. "use client" - רכיב שמשתמש בהוקים חייב אותו
 *   5. שדות פריזמה - שכל שדה שנכתב קיים בסכימה
 *   6. מסלולי API - שיש להם ייצוא של GET/POST
 *   7. הכרזות כפולות באותו קובץ
 *   8. בטיחות הסכימה ל-db push
 *
 *  **מה הוא לא בודק, וצריך לומר את זה בקול:** זו אינה
 *  בדיקת טיפוסים אמיתית. רק `tsc` נותן את זה, והוא דורש
 *  התקנה מלאה של התלויות.
 *
 *  הרצה:  node scripts/verify.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, dirname, resolve, basename } from "node:path";

const root = resolve(process.argv[2] ?? ".");

const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".vercel",
  "coverage",
]);

/* ============================================================
 *  איסוף הקבצים
 * ========================================================= */

const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if ([".ts", ".tsx", ".mts", ".cts"].includes(extname(path))) files.push(path);
  }
}

walk(root);

const problems = [];
const note = (kind, file, message) => problems.push({ kind, file, message });

const sources = new Map();
for (const file of files) sources.set(file, readFileSync(file, "utf8"));

/* ============================================================
 *  1. תחביר
 * ========================================================= */

let esbuild = null;

try {
  esbuild = await import("esbuild");
} catch {
  try {
    esbuild = await import("/opt/npm-tools/node_modules/esbuild/lib/main.js");
  } catch {
    esbuild = null;
  }
}

if (!esbuild) {
  console.error("אזהרה: esbuild לא זמין - בדיקת התחביר לא רצה");
  process.exitCode = 2;
} else {
  for (const [file, src] of sources) {
    try {
      esbuild.transformSync(src, {
        loader: extname(file) === ".tsx" ? "tsx" : "ts",
        tsconfigRaw: { compilerOptions: { jsx: "preserve" } },
      });
    } catch (err) {
      note("תחביר", file, String(err).split("\n").slice(1, 3).join(" ").trim());
    }
  }
}

/* ============================================================
 *  2+3. ייבוא וייצוא
 * ========================================================= */

const CANDIDATES = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];

function resolveLocal(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // חבילה חיצונית

  for (const ext of CANDIDATES) {
    const path = base + ext;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }

  return false; // מקומי אבל לא נמצא
}

/** מה כל קובץ מייצא */
function exportsOf(src) {
  const names = new Set();

  for (const m of src.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g
  )) {
    names.add(m[1]);
  }

  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }

  if (/export\s+default/.test(src)) names.add("default");
  /** `export *` - לא נוכל לדעת, ולכן לא נתלונן על הקובץ הזה */
  if (/export\s*\*/.test(src)) names.add("*");

  return names;
}

const exportCache = new Map();

function exportsFor(file) {
  if (!exportCache.has(file)) {
    exportCache.set(file, exportsOf(sources.get(file) ?? readFileSync(file, "utf8")));
  }
  return exportCache.get(file);
}

for (const [file, src] of sources) {
  /**
   * בדיקות מכילות שמות מודולים **בתוך מחרוזות** (למשל
   * `src.includes('from "./runner"')`), וזה לא ייבוא.
   * סריקה שלהן מחזירה ממצאי שקר, ולכן הן מדולגות כאן -
   * התחביר שלהן נבדק למעלה כמו כל קובץ אחר.
   */
  if (file.includes("/tests/")) continue;

  /** ייבוא עם שמות: import { a, b } from "x" */
  for (const m of src.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g
  )) {
    const target = resolveLocal(file, m[2]);
    if (target === null) continue;

    if (target === false) {
      note("ייבוא", file, `לא נמצא: ${m[2]}`);
      continue;
    }

    const available = exportsFor(target);
    if (available.has("*")) continue;

    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0]?.replace(/^type\s+/, "").trim();
      if (!name) continue;
      if (!available.has(name)) {
        note("ייצוא", file, `${name} לא מיוצא מ-${m[2]}`);
      }
    }
  }

  /** ייבוא ברירת מחדל ו-import() דינמי */
  for (const m of src.matchAll(
    /(?:import\s+[A-Za-z0-9_$]+\s+from|import\()\s*["']([^"']+)["']/g
  )) {
    const target = resolveLocal(file, m[1]);
    if (target === false) note("ייבוא", file, `לא נמצא: ${m[1]}`);
  }
}

/* ============================================================
 *  4. "use client"
 * ========================================================= */

const HOOKS = /\b(useState|useEffect|useRouter|useRef|useMemo|useCallback|useContext|useReducer|useSearchParams)\s*\(/;

for (const [file, src] of sources) {
  if (!file.endsWith(".tsx")) continue;

  const isClient = /^\s*["']use client["']/.test(src);
  const usesHooks = HOOKS.test(src);
  const usesHandlers = /\son(Click|Change|Submit|Input|Blur|Focus)=\{/.test(src);

  if ((usesHooks || usesHandlers) && !isClient) {
    note(
      "use client",
      file,
      usesHooks
        ? "משתמש בהוקים בלי \"use client\" - הבנייה תיכשל"
        : "יש בו מטפל אירועים בלי \"use client\" - הבנייה תיכשל"
    );
  }
}

/* ============================================================
 *  5. שדות פריזמה
 * ========================================================= */

/**
 * **הבדיקה הזו צומצמה בכוונה, ולא הורחבה.**
 *
 * הגרסה הראשונה סרקה כל `מפתח:` בתוך קריאה לפריזמה
 * והחזירה 45 ממצאים - כמעט כולם שקר: מפתחות בתוך עמודות
 * JSON (`extra`, `meta`, `payload`), מפתחות מורכבים
 * תקינים כמו `triggerStatus_stepIndex`, וענפי תנאי.
 *
 * בדיקה שמחזירה 45 ממצאים שרובם שקר היא בדיקה שלומדים
 * להתעלם ממנה, וזה גרוע מלא לבדוק בכלל. לכן כאן נבדקים
 * רק גושי `select` ו-`orderBy`: הם **לעולם** לא מכילים
 * JSON, ולכן כל שם בהם הוא שדה אמיתי או טעות אמיתית.
 */

const schemaPath = join(root, "prisma", "schema.prisma");
const modelFields = new Map();
let schema = "";

if (existsSync(schemaPath)) {
  schema = readFileSync(schemaPath, "utf8");

  for (const m of schema.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)) {
    const fields = new Set();
    for (const line of m[2].split("\n")) {
      const clean = line.trim();
      if (!clean || clean.startsWith("//") || clean.startsWith("@@")) continue;
      const name = clean.match(/^([A-Za-z0-9_]+)\s+/);
      if (name) fields.add(name[1]);
    }
    modelFields.set(m[1], fields);
  }
}

/** כל שם שדה שקיים באיזשהו מודל - לקשרים ולשדות מוטבעים */
const anyField = new Set();
for (const fields of modelFields.values()) {
  for (const f of fields) anyField.add(f);
}

/**
 * מילים של פריזמה, לא שדות. גוש `select` יכול להכיל
 * `where` מקונן עם אופרטורים, ולכן גם הם כאן.
 */
const SELECT_WORDS = new Set([
  "select", "include", "orderBy", "take", "skip", "where", "_count",
  "_sum", "_avg", "_min", "_max", "by", "distinct", "asc", "desc",
  "equals", "not", "in", "notIn", "lt", "lte", "gt", "gte", "contains",
  "startsWith", "endsWith", "mode", "AND", "OR", "NOT", "some", "every",
  "none", "has", "hasEvery", "hasSome", "isEmpty", "nulls", "cursor",
]);

for (const [file, src] of sources) {
  if (file.includes("/tests/") || file.includes("/scripts/")) continue;

  for (const m of src.matchAll(/\b(select|orderBy):\s*\{/g)) {
    let i = src.indexOf("{", m.index + m[0].length - 1);
    let depth = 0;
    let end = i;

    for (; end < src.length && end < i + 2000; end++) {
      if (src[end] === "{") depth++;
      else if (src[end] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }

    for (const key of src.slice(i, end).matchAll(/(?:^|[{,\s])([a-zA-Z][A-Za-z0-9_]*)\s*:/g)) {
      const name = key[1];
      if (SELECT_WORDS.has(name)) continue;
      if (anyField.has(name)) continue;
      note("פריזמה", file, `"${name}" אינו שדה של אף מודל בסכימה`);
    }
  }
}

/**
 * והבדיקה החשובה באמת: כל שדה **חדש** שהעדכונים האחרונים
 * הוסיפו חייב להיות קיים בסכימה. אלה השדות שאם הם חסרים,
 * הקליטה תיפול בזמן אמת ולא בבנייה.
 */
const REQUIRED = {
  Lead: ["channel"],
  LeadEntry: ["matchedOn", "extra", "via", "isSale", "price"],
  LeadDelivery: ["heldAt", "releasedAt", "state", "createdAt"],
  Settings: [
    "holdSaleTransfers",
    "holdSaleSince",
    "channelFilledAt",
    "campaignBot",
  ],
};

for (const [model, needed] of Object.entries(REQUIRED)) {
  const fields = modelFields.get(model);

  if (!fields) {
    note("סכימה", "prisma/schema.prisma", `המודל ${model} נעלם`);
    continue;
  }

  for (const field of needed) {
    if (!fields.has(field)) {
      note("סכימה", "prisma/schema.prisma", `${model}.${field} חסר`);
    }
  }
}

/* ============================================================
 *  5ב. מסך שנשפך מחוץ לעמודת התוכן
 * ========================================================= */

/**
 * **הבאג שזה תופס.**
 *
 * המסגרת `div.app` היא מה שנותן לתוכן את עמודת התוכן:
 * ב-CSS היא מקבלת `margin-inline-start: var(--side-w)`
 * כדי לפנות את סרגל הצד. רכיב שמוצג **לידה** במקום
 * בתוכה לא מקבל את השוליים האלה, ולכן הוא נשפך מתחת
 * לסרגל - בדיוק מה שקרה במסך האבחון.
 *
 * הסימן: דף שמחזיר `<>` עם יותר מרכיב אחד ברמה העליונה,
 * כשאחד מהם הוא מסך שלם.
 */
for (const [file, src] of sources) {
  if (!/\/app\/.*\/page\.tsx$/.test(file.replace(/\\/g, "/"))) continue;

  const body = src.slice(src.indexOf("return ("));
  const frag = body.match(/return\s*\(\s*<>([\s\S]*?)<\/>/);
  if (!frag) continue;

  /** רכיבים ברמה העליונה של הפרגמנט */
  const top = [...frag[1].matchAll(/^\s{0,8}<([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1]);

  const screens = top.filter((n) => /Screen$/.test(n));

  if (screens.length > 0 && top.length > screens.length) {
    note(
      "פריסה",
      file,
      `${screens[0]} מוצג יחד עם ${top.length - screens.length} רכיבים לידו - הם ייפלו מחוץ לעמודת התוכן`
    );
  }
}

/* ============================================================
 *  6. מסלולי API
 * ========================================================= */

const METHODS = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

for (const [file, src] of sources) {
  if (basename(file) !== "route.ts" && basename(file) !== "route.tsx") continue;
  if (!METHODS.test(src)) {
    note("מסלול", file, "אין ייצוא של GET/POST - המסלול לא יענה");
  }
}

/* ============================================================
 *  7. הכרזות כפולות
 * ========================================================= */

for (const [file, src] of sources) {
  const seen = new Map();

  for (const m of src.matchAll(
    /^(?:export\s+)?(?:const|let|function|class)\s+([A-Za-z0-9_$]+)/gm
  )) {
    const name = m[1];
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }

  for (const [name, count] of seen) {
    if (count > 1) {
      note("כפילות", file, `"${name}" מוכרז ${count} פעמים`);
    }
  }
}

/* ============================================================
 *  8. בטיחות הסכימה ל-db push
 * ========================================================= */

if (schema) {
  /**
   * אינדקס ייחודי חדש מפיל את `prisma db push` בלי
   * `--accept-data-loss`. זה בדיוק מה שהפיל בנייה קודמת.
   */
  const leadModel = schema.match(/model\s+Lead\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  if (/@@unique\(\[phone,\s*channel\]\)/.test(leadModel)) {
    note(
      "סכימה",
      "prisma/schema.prisma",
      "@@unique([phone, channel]) יפיל את db push ברנדר"
    );
  }

  if (/\n\s*phone\s+String\s+@unique/.test(leadModel)) {
    note(
      "סכימה",
      "prisma/schema.prisma",
      "phone @unique חזר - ההפרדה בין הערוצים תישבר"
    );
  }
}

/* ============================================================
 *  הדוח
 * ========================================================= */

console.log(`\nנבדקו ${files.length} קבצים ב-${root}\n`);

if (problems.length === 0) {
  console.log("אין ממצאים.\n");
} else {
  const byKind = new Map();
  for (const p of problems) {
    if (!byKind.has(p.kind)) byKind.set(p.kind, []);
    byKind.get(p.kind).push(p);
  }

  for (const [kind, list] of byKind) {
    console.log(`── ${kind} (${list.length})`);
    for (const p of list) {
      console.log(`   ${p.file.replace(root + "/", "")}\n      ${p.message}`);
    }
    console.log("");
  }
}

console.log(
  "לא נבדק כאן: בדיקת טיפוסים אמיתית (tsc). היא דורשת התקנת תלויות.\n"
);

process.exit(problems.length > 0 ? 1 : process.exitCode ?? 0);
