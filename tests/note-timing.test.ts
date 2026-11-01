import assert from "node:assert/strict";
import io from "node:fs";
import {
  readNoteTiming,
  noteAlertTitle,
  normalizedWordSources,
  LEAD_DAYS,
} from "../lib/note-timing";

/**
 * ============================================================
 *  נעילה על תזכורות מהערות
 * ============================================================
 *
 *  **שני כשלים אפשריים, ורק אחד מהם מסוכן.**
 *
 *  הערה שלא זוהה בה מועד פשוט נשמרת בלי תזכורת - חבל,
 *  אבל לא נורא.
 *
 *  תזכורת לתאריך שגוי היא הרבה יותר גרועה: אתה סומך
 *  עליה, לא מתקשר, והלקוח חותם אצל מישהו אחר. לכן
 *  המודול שותק כשהוא לא בטוח.
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

/** 1 בנובמבר 2026 */
const NOW = new Date(2026, 10, 1, 11, 0, 0);

const read = (text: string) => readNoteTiming(text, NOW);

/* ---------- הדוגמה שביקשת ---------- */

test("\"נכנס עוד חודש לדירה\" פותח תזכורת לסוף נובמבר", () => {
  const t = read("נכנס עוד חודש לדירה עושה בדיקה")!;

  assert.ok(t, "לא זוהה מועד");
  assert.equal(t.dueAt.getMonth(), 11, "המועד אינו דצמבר");
  assert.equal(t.dueAt.getDate(), 1);

  /** ההתראה שלושה ימים קודם - 28 בנובמבר */
  assert.equal(t.remindAt.getMonth(), 10);
  assert.equal(t.remindAt.getDate(), 28);
});

test("ההתראה תמיד מקדימה את המועד", () => {
  for (const note of [
    "נכנס עוד חודש לדירה",
    "מסיים חוזה בעוד חודשיים",
    "עוד שבועיים",
    "בודק ב 15.12.26",
  ]) {
    const t = read(note)!;
    assert.ok(t, `לא זוהה: ${note}`);
    assert.ok(
      t.remindAt.getTime() < t.dueAt.getTime(),
      `ההתראה אחרי המועד: ${note}`
    );
  }
});

test("ההפרש הוא בדיוק שלושה ימים", () => {
  const t = read("נכנס עוד חודש")!;
  const days = Math.round(
    (t.dueAt.getTime() - t.remindAt.getTime()) / 86400000
  );
  assert.equal(days, LEAD_DAYS);
});

/* ---------- ניסוחים יחסיים ---------- */

test("חודש, חודשיים ומספר חודשים", () => {
  assert.equal(read("עוד חודש")!.dueAt.getMonth(), 11);
  assert.equal(read("בעוד חודשיים")!.dueAt.getMonth(), 0);
  assert.equal(read("עוד 3 חודשים")!.dueAt.getMonth(), 1);
});

test("שבוע, שבועיים וימים", () => {
  const week = read("עוד שבוע")!;
  assert.equal(
    Math.round((week.dueAt.getTime() - NOW.getTime()) / 86400000),
    7
  );

  const two = read("בעוד שבועיים")!;
  assert.equal(
    Math.round((two.dueAt.getTime() - NOW.getTime()) / 86400000),
    14
  );

  const days = read("עוד 10 ימים")!;
  assert.equal(
    Math.round((days.dueAt.getTime() - NOW.getTime()) / 86400000),
    10
  );
});

test("שנה מזוהה גם היא", () => {
  assert.equal(read("מסיים התחייבות עוד שנה")!.dueAt.getFullYear(), 2027);
});

/* ---------- תאריכים מפורשים ---------- */

test("תאריך מלא נקרא כמו שנכתב", () => {
  const t = read("נכנס לדירה ב 1.12.26")!;
  assert.equal(t.dueAt.getDate(), 1);
  assert.equal(t.dueAt.getMonth(), 11);
  assert.equal(t.dueAt.getFullYear(), 2026);
});

test("לוכסנים ושנה מלאה עובדים גם", () => {
  const t = read("בדיקה 15/12/2026")!;
  assert.equal(t.dueAt.getDate(), 15);
  assert.equal(t.dueAt.getMonth(), 11);
});

test("תאריך בלי שנה שכבר עבר עובר לשנה הבאה", () => {
  /**
   * מי שכותב "1.3" בנובמבר מתכוון למרץ הקרוב, לא
   * לתשעה חודשים אחורה.
   */
  const t = read("מסיים חוזה 1.3")!;
  assert.equal(t.dueAt.getFullYear(), 2027);
  assert.equal(t.dueAt.getMonth(), 2);
});

test("תאריך לא הגיוני לא מזוהה", () => {
  assert.equal(read("45.99.26"), null);
});

/* ---------- שמות חודשים ---------- */

test("שם חודש מפנה לתחילתו", () => {
  const t = read("נכנס לדירה בדצמבר")!;
  assert.equal(t.dueAt.getMonth(), 11);
  assert.equal(t.dueAt.getDate(), 1);
});

test("חודש שכבר עבר השנה הוא בשנה הבאה", () => {
  const t = read("בודק בינואר")!;
  assert.equal(t.dueAt.getFullYear(), 2027);
});

/* ---------- מה שלא מזוהה ---------- */

test("הערה בלי מועד לא פותחת תזכורת", () => {
  for (const note of [
    "לקוח נחמד",
    "מעוניין בחבילת ספורט",
    "בעל חנות ברחובות",
    "",
    "   ",
  ]) {
    assert.equal(read(note), null, `זוהה מועד שלא קיים: ${note}`);
  }
});

test("מועד שכבר עבר אינו תזכורת", () => {
  /** "נכנס לדירה ב-1.10.26" הוא תיעוד, לא משימה */
  assert.equal(read("נכנס לדירה ב 1.10.2026"), null);
});

/* ---------- מקרי קצה בתאריכים ---------- */

test("31 בחודש ועוד חודש לא גולש לחודש שאחריו", () => {
  /**
   * JavaScript הופך 31 בינואר + חודש ל-3 במרץ. הערה
   * שנכתבה ב-31 בחודש הייתה מקבלת תזכורת לחודש הלא
   * נכון.
   */
  const jan31 = new Date(2027, 0, 31, 11, 0, 0);
  const t = readNoteTiming("נכנס עוד חודש", jan31)!;
  assert.equal(t.dueAt.getMonth(), 1, "גלש מעבר לפברואר");
});

test("חציית שנה עובדת", () => {
  const dec = new Date(2026, 11, 20, 11, 0, 0);
  const t = readNoteTiming("עוד חודש", dec)!;
  assert.equal(t.dueAt.getFullYear(), 2027);
  assert.equal(t.dueAt.getMonth(), 0);
});

test("מועד קרוב מאוד לא מייצר התראה בעבר", () => {
  /**
   * "עוד יומיים" פחות שלושה ימים הוא אתמול. תזכורת
   * בעבר לא תופיע לעולם, ולכן היא נדחית למחר.
   */
  const t = read("חוזר אליי עוד יומיים")!;
  assert.ok(t.remindAt.getTime() > NOW.getTime(), "התזכורת בעבר");
});

/* ---------- כותרת ההתראה ---------- */

test("ההתראה נושאת את ההערה שלך ולא ניסוח כללי", () => {
  const note = "נכנס עוד חודש לדירה עושה בדיקה";
  const title = noteAlertTitle(note, read(note)!);

  assert.ok(title.includes("נכנס"), "ההערה לא מופיעה בהתראה");
  assert.ok(title.includes("דירה"));
});

test("הערה ארוכה נחתכת ולא שוברת את ההתראה", () => {
  const long = "א".repeat(400) + " עוד חודש";
  const title = noteAlertTitle(long, read(long)!);
  assert.ok(title.length < 120, `כותרת ארוכה מדי: ${title.length}`);
});

/* ---------- עברית שנופלת בשקט ---------- */

test("כל המילים כתובות בכתיב שאחרי נרמול", () => {
  /**
   * "חודשיים" הופך ל"חודשימ" אחרי הנרמול. מילה שנכתבה
   * בכתיב הרגיל פשוט לא תימצא לעולם, והתוצאה היא
   * תזכורת לחודש הלא נכון - בלי שום סימן שמשהו נשבר.
   */
  for (const word of normalizedWordSources()) {
    for (const ch of word) {
      assert.ok(
        !"םןךףץ".includes(ch),
        `אות סופית במילה "${word}" - לא תתאים אחרי נרמול`
      );
    }
    assert.ok(!/יי/.test(word), `יו"ד כפולה במילה "${word}"`);
  }
});

test("חודשיים אינו נקרא כחודש אחד", () => {
  /** הצורה הארוכה חייבת להיבדק לפני הקצרה */
  const one = read("עוד חודש")!;
  const two = read("עוד חודשיים")!;
  assert.notEqual(one.dueAt.getMonth(), two.dueAt.getMonth());
});

test("שבועיים אינו נקרא כשבוע אחד", () => {
  const one = read("עוד שבוע")!;
  const two = read("עוד שבועיים")!;
  assert.ok(two.dueAt.getTime() > one.dueAt.getTime());
});

test("תאריך עם נקודות נקרא למרות הנרמול", () => {
  /**
   * הנרמול מחליף נקודות ברווחים, ולכן תאריך חייב
   * להיקרא מהטקסט המקורי.
   */
  for (const note of ["בודק ב 15.12.26", "נכנס 1/12/2026", "מסיים 20.11.26"]) {
    assert.ok(read(note), `תאריך לא זוהה: ${note}`);
  }
});

/* ---------- החיבור למערכת ---------- */

test("השמירה והתזכורת קורות באותו מקום", () => {
  /**
   * אם ההערה נשמרת במקום אחד והתזכורת נפתחת באחר,
   * בסוף תהיה הערה בלי תזכורת.
   */
  const route = io.readFileSync(
    "app/api/leads/[id]/notes/route.ts",
    "utf8"
  );

  assert.ok(route.includes("db.lead.update"), "ההערה לא נשמרת");
  assert.ok(route.includes("readNoteTiming"), "המועד לא נקרא");
  assert.ok(route.includes("db.scheduledJob"), "התזכורת לא נפתחת");
});

test("תזכורת ישנה מההערה מבוטלת לפני שנפתחת חדשה", () => {
  const route = io.readFileSync(
    "app/api/leads/[id]/notes/route.ts",
    "utf8"
  );

  assert.ok(
    route.includes("cancelled"),
    "תזכורות מהערות ייערמו לתאריכים שכבר לא נכונים"
  );
  /** הביטול ממוקד בתזכורות של הערות ולא בכל המשימות */
  assert.ok(
    route.includes("startsWith"),
    "הביטול מוחק גם משימות אחרות של הליד"
  );
});

test("התזכורת לא קופצת באמצע הלילה", () => {
  const route = io.readFileSync(
    "app/api/leads/[id]/notes/route.ts",
    "utf8"
  );
  assert.ok(route.includes("shiftToWorkingHours"));
});

test("המסך קורא את המועד באותה פונקציה של השרת", () => {
  /**
   * תצוגה מקדימה שמחשבת לבד הייתה מראה תאריך אחד
   * ושומרת אחר - וזה בדיוק סוג הפער שאי אפשר לראות.
   */
  const screen = io.readFileSync("components/LeadNotes.tsx", "utf8");
  assert.ok(screen.includes("readNoteTiming"));
});

test("תיבת ההערות מחוברת לכרטיס הליד", () => {
  const page = io.readFileSync("app/leads/[id]/page.tsx", "utf8");
  assert.ok(page.includes("LeadNotes"), "התיבה קיימת אבל לא מוצגת בשום מקום");
  assert.ok(page.includes("lead.notes"), "ההערה הקיימת לא נטענת לתיבה");
});

console.log(`✓ note-timing: ${passed} בדיקות עברו`);
