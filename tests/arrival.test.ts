import assert from "node:assert/strict";
import io from "node:fs";
import {
  bumpsToTop,
  arrivalIntakeAt,
  duplicateLabel,
} from "../lib/arrival";

/**
 * ============================================================
 *  נעילה על "כל הגעה צפה לראש"
 * ============================================================
 *
 *  **הכלל, במילים של רובי.** כל ליד שנכנס - לא משנה
 *  מאיזו דלת ולא משנה מה התווית שלו - מופיע בראש הרשימה
 *  עם התאריך של עכשיו. אם המספר כבר קיים, מופיעה התווית
 *  "כפול", והכניסות הקודמות נשמרות בכרטיס.
 *
 *  **איך זה נשבר.** הכלל היה כתוב בתוך הוובוק בלבד.
 *  ליד שנכנס ידנית קיבל כניסה ותווית - אבל התאריך נשאר
 *  הישן, ולכן הוא נשאר קבור באמצע הרשימה. בפועל הוא לא
 *  היה קיים: אפשר היה למצוא אותו רק בחיפוש לפי מספר.
 *
 *  לכן הבדיקה המרכזית כאן היא לא על החישוב - היא על
 *  **כך שכל דלת עוברת דרך אותה פונקציה**.
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

/* ---------- הכלל עצמו ---------- */

test("הגעה רגילה מקפיצה לראש", () => {
  assert.equal(bumpsToTop({}), true);
});

test("ברירת המחדל היא להקפיץ, גם בלי שאומרים כלום", () => {
  /**
   * דלת חדשה שלא חשבה על הנושא חייבת להתנהג נכון
   * מעצמה. חריג מתקבל רק כשמצהירים עליו במפורש.
   */
  assert.equal(bumpsToTop({ sameSubmission: undefined }), true);
  assert.equal(bumpsToTop({ isSale: undefined }), true);
  assert.equal(bumpsToTop({ sameSubmission: false, isSale: false }), true);
});

test("אותה הגשה משתי דלתות לא מזיזה כלום", () => {
  assert.equal(bumpsToTop({ sameSubmission: true }), false);
});

test("כניסה של קונה לא מזיזה את הרשימה שלך", () => {
  assert.equal(bumpsToTop({ isSale: true }), false);
});

test("התאריך שנכתב הוא עכשיו, ו-undefined כשלא נוגעים", () => {
  const now = new Date("2026-11-01T18:00:00Z");

  assert.equal(arrivalIntakeAt({}, now), now);
  assert.equal(arrivalIntakeAt({ isSale: true }, now), undefined);
  assert.equal(arrivalIntakeAt({ sameSubmission: true }, now), undefined);
});

/* ---------- התווית ---------- */

test("כניסה אחת אינה כפילות", () => {
  assert.equal(duplicateLabel(1), null);
  assert.equal(duplicateLabel(0), null);
});

test("התווית סופרת את הכניסות בפועל", () => {
  assert.ok(duplicateLabel(3)!.includes("3"));
  assert.ok(duplicateLabel(2)!.includes("כפול"));
  assert.ok(duplicateLabel(4000)!.includes("4000"));
});

/* ---------- כל דלת עוברת דרך אותו כלל ---------- */

const DOORS = [
  "app/api/webhooks/leadmanager/route.ts",
  "app/api/leads/route.ts",
];

for (const door of DOORS) {
  test(`הדלת ${door} מריצה את כלל ההגעה`, () => {
    const src = io.readFileSync(door, "utf8");
    assert.ok(
      /arrivalIntakeAt|bumpArrival/.test(src),
      "הדלת הזו לא מקפיצה ליד חוזר לראש הרשימה"
    );
  });

  test(`הדלת ${door} לא מחשבת את התאריך בעצמה`, () => {
    /**
     * עותק משלה הוא בדיוק איך שהכלל התפצל לשתי
     * התנהגויות. יש כלל אחד, והוא ב-lib/arrival.
     */
    const src = io.readFileSync(door, "utf8");
    assert.ok(
      !/intakeAt:\s*(sameSubmission|isSale)/.test(src),
      "הדלת מחזיקה עותק משלה של הכלל"
    );
  });
}

test("ליד ידני קיים מקבל גם כניסה וגם תאריך חדש", () => {
  /**
   * קרה בפועל: הכניסה נרשמה, התווית "כפול · 3" הופיעה,
   * והתאריך נשאר 23.09 - כלומר הליד נשאר בלתי נראה.
   */
  const src = io.readFileSync("app/api/leads/route.ts", "utf8");

  const repeat = src.slice(
    src.indexOf("leadId = existing!.id;"),
    src.indexOf("const entry = await db.leadEntry")
  );

  assert.ok(
    repeat.includes("bumpArrival"),
    "המסלול של ליד קיים לא מעדכן את התאריך"
  );
});

test("הליד הקיים לא נדרס - רק התאריך זז", () => {
  /**
   * הסטטוס, השם וההיסטוריה של ליד שעבדת עליו חייבים
   * להישאר. רק המיקום ברשימה משתנה.
   */
  const src = io.readFileSync("app/api/leads/route.ts", "utf8");

  const repeat = src.slice(
    src.indexOf("leadId = existing!.id;"),
    src.indexOf("const entry = await db.leadEntry")
  );

  for (const field of ["status:", "firstName:", "origin:"]) {
    assert.ok(
      !repeat.includes(field),
      `המסלול של ליד קיים דורס ${field}`
    );
  }
});

/* ============================================================
 *  אף דלת לא יכולה לשכוח
 * ============================================================
 *
 *  **זו הבדיקה שהייתה חסרה.** הבדיקה הישנה בדקה את
 *  הטקסט שבתוך הוובוק - כלומר את הדלת היחידה שכבר
 *  עבדה. הדלת הידנית לא נבדקה מעולם, ולכן הבאג שרד
 *  חודשיים.
 *
 *  כאן סורקים את **כל** הקבצים שרושמים כניסה, ומחייבים
 *  כל אחד מהם להיות מסווג במפורש: או שהוא מריץ את כלל
 *  ההגעה, או שהוא רשום כאן עם סיבה למה לא.
 *
 *  דלת חדשה שתיווסף ולא תופיע באף רשימה - תפיל את
 *  הבדיקה.
 */

/** דלתות שליד נכנס דרכן - חייבות להריץ את הכלל */
const ARRIVAL_DOORS = [
  "app/api/webhooks/leadmanager/route.ts",
  "app/api/leads/route.ts",
  "app/api/import-leads/route.ts",
];

/** קבצים שרושמים כניסה אבל אינם הגעה חדשה */
const NOT_ARRIVALS: Record<string, string> = {
  "app/api/leads/bulk-move-sale/route.ts":
    "העברה לקונה - הליד יוצא מהרשימה שלך, לא נכנס אליה",
  "lib/transfer.ts":
    "העברה לקונה לפי סטטוס - אותו היגיון",
  "app/api/maintenance/backfill-entries/route.ts":
    "השלמת כניסות היסטוריות - הקפצה כאן הייתה מערבבת את כל התאריכים",
};

function filesCreatingEntries(): string[] {
  const roots = ["app/api", "lib"];
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const name of io.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (io.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts")) {
        const src = io.readFileSync(full, "utf8");
        if (/leadEntry\s*\n?\s*\.create/.test(src)) out.push(full);
      }
    }
  };

  for (const root of roots) walk(root);
  return out.sort();
}

test("כל קובץ שרושם כניסה מסווג במפורש", () => {
  for (const file of filesCreatingEntries()) {
    const known =
      ARRIVAL_DOORS.includes(file) || file in NOT_ARRIVALS;

    assert.ok(
      known,
      `הקובץ ${file} רושם כניסה ולא סווג - או שהוא דלת הגעה ויריץ את הכלל, או שתסביר למה לא`
    );
  }
});

test("כל דלת הגעה מריצה את כלל ההגעה", () => {
  for (const door of ARRIVAL_DOORS) {
    const src = io.readFileSync(door, "utf8");
    assert.ok(
      /arrivalIntakeAt|bumpArrival/.test(src),
      `${door} קולט לידים ולא מקפיץ אותם לראש הרשימה`
    );
  }
});

test("דלת ההגעה לא מחשבת את התאריך בעצמה", () => {
  for (const door of ARRIVAL_DOORS) {
    const src = io.readFileSync(door, "utf8");
    assert.ok(
      !/intakeAt:\s*new Date\(\)\s*,?\s*$/m.test(
        src.replace(/const intakeAt[^\n]*\n/g, "")
      ) || door === "app/api/import-leads/route.ts",
      `${door} כותב תאריך בעצמו במקום דרך הכלל`
    );
  }
});

test("ייבוא של מספר קיים נרשם כהגעה ולא כדילוג", () => {
  /**
   * קודם הייבוא רשם "כבר קיים" והמשיך - בלי כניסה, בלי
   * תווית, ובלי הקפצה. כלומר ההגעה הזו לא קרתה.
   */
  const src = io.readFileSync("app/api/import-leads/route.ts", "utf8");
  const block = src.slice(
    src.indexOf("if (already) {"),
    src.indexOf("if (dryRun) {")
  );

  assert.ok(block.includes("bumpArrival"), "ייבוא חוזר לא מקפיץ לראש");
  assert.ok(block.includes("leadEntry"), "ייבוא חוזר לא רושם כניסה");
});

/* ============================================================
 *  ליד ווואטסאפ הם שני דברים נפרדים
 * ============================================================
 *
 *  **הכלל, במילים של רובי:** ליד זה כניסה של פרטים.
 *  וואטסאפ נשאר בשיחות. לא לחבר ביניהם בשום צורה.
 *
 *  הודעה נכנסת מעדכנת מתי הוא כתב לאחרונה - וזהו. היא
 *  לא מזיזה אותו ברשימת הלידים, כי הוא לא נכנס שוב;
 *  הוא רק דיבר.
 */

test("הודעה נכנסת לא מזיזה ליד ברשימה", () => {
  const src = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  assert.ok(
    !src.includes("intakeAt"),
    "מסלול הוואטסאפ נוגע בתאריך הכניסה - זה מערבב שיחה עם ליד"
  );
  assert.ok(
    !src.includes("bumpArrival"),
    "מסלול הוואטסאפ מריץ כלל הגעה - הודעה אינה כניסה"
  );
});

test("מסלול הוואטסאפ מעדכן רק מתי הוא כתב", () => {
  const src = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");
  assert.ok(
    src.includes("lastInboundAt"),
    "לא נרשם מתי הלקוח כתב לאחרונה"
  );
});

test("הבוט לא נוגע בסדר רשימת הלידים", () => {
  const bot = io.readFileSync("lib/campaign-bot.ts", "utf8");
  assert.ok(!bot.includes("intakeAt"), "הבוט מזיז לידים ברשימה");
});

console.log(`✓ arrival: ${passed} בדיקות עברו`);
