import assert from "node:assert/strict";
import io from "node:fs";
import {
  readSupplierAnswer,
  statesExistingCustomer,
  customerPatternSources,
  replyForAnswer,
  SUPPLIER_QUESTION,
  SUPPLIER_QUESTION_AGAIN,
  MAX_SUPPLIER_ASKS,
  NEEDS_YOU_EVENT,
  ASKED_EVENT,
  REPLY_IF_CUSTOMER,
  REPLY_IF_NOT_CUSTOMER,
} from "../lib/supplier-check";

/**
 * ============================================================
 *  נעילה על שאלת הסינון
 * ============================================================
 *
 *  קריאה שגויה של התשובה מסמנת לקוח אמיתי כ"לקוח קיים",
 *  שולחת לו *2080 במקום הצעה, ומוציאה אותו מהרשימה החמה.
 *  זה ליד שנזרק בלי שתדע.
 *
 *  לכן ברירת המחדל היא **לא להכריע**: בספק, הליד נשאר לך.
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

/* ---------- כן ---------- */

for (const text of [
  "כן",
  "כן בטח",
  "כן אני לקוח שלכם",
  "בטח",
  "yes",
  "אני ביס",
  "סטינג",
  "יש לי yes",
]) {
  test(`"${text}" נקרא כלקוח קיים`, () => {
    assert.equal(readSupplierAnswer(text), "yes", text);
  });
}

/* ---------- לא ---------- */

for (const text of [
  "לא",
  "לא לקוח",
  "אני לא",
  "לא, אני בהוט",
  "הוט",
  "פרטנר",
  "סלקום",
  "no",
  "free tv",
  "בזק",
]) {
  test(`"${text}" נקרא כלא לקוח`, () => {
    assert.equal(readSupplierAnswer(text), "no", text);
  });
}

/* ---------- שלילה גוברת ---------- */

test("'לא yes' נקרא כשלילה ולא כחיוב", () => {
  assert.equal(readSupplierAnswer("לא yes"), "no");
});

test("'לא yes אלא הוט' נקרא כשלילה", () => {
  assert.equal(readSupplierAnswer("לא yes אלא הוט"), "no");
});

/* ---------- מה שאסור להכריע ---------- */

for (const text of [
  "",
  "   ",
  "מה המחיר",
  "תתקשר אליי מחר",
  "👍",
  "אני צריך לבדוק",
  "תשלח לי פרטים",
]) {
  test(`"${text || "(ריק)"}" לא מוכרע - הליד נשאר לך`, () => {
    assert.equal(readSupplierAnswer(text), null, text);
  });
}

test("מילה בתוך מילה לא נספרת", () => {
  // "פיסיקה" מכיל יס, "אלא" מכיל לא
  assert.equal(readSupplierAnswer("פיסיקה"), null);
  assert.equal(readSupplierAnswer("אלא"), null);
});

/* ---------- התשובות ---------- */

test("לקוח קיים מקבל את מספר השירות", () => {
  assert.equal(replyForAnswer("yes"), REPLY_IF_CUSTOMER);
  assert.ok(REPLY_IF_CUSTOMER.includes("2080"));
});

test("מי שלא לקוח מקבל שחוזרים אליו", () => {
  assert.equal(replyForAnswer("no"), REPLY_IF_NOT_CUSTOMER);
});

test("בלי תשובה ברורה - לא נשלח כלום", () => {
  assert.equal(replyForAnswer(null), null);
});

test("השאלה היא בדיוק מה שביקשת", () => {
  assert.equal(
    SUPPLIER_QUESTION,
    "רגע לפני שאני יוצר איתכם קשר, האם אתם כיום לקוחות של yes/sting?"
  );
});


/* ============================================================
   הצהרה מפורשת מול תשובה לשאלה
   ============================================================

   לקוח קיבל דיוור שנגמר ב"אם אתם מעוניינים תרשמו לי" וכתב
   "כן". הבוט קרא את זה כתשובה לשאלת הסינון - שאלה שלא
   נשאלה - וענה "פנו ל*2080". ליד שרצה לקנות נשלח לשירות.

   מאז: רק שם של ספק מדלג על השאלה. "כן" תמיד מקבל אותה.
*/

const MUST_NOT_SKIP = [
  "כן",
  "כן מעוניין",
  "בטח",
  "אשמח",
  "לא",
  "מה המחיר",
  "יש לי הוט",
  "אני לא ביס",
  "אני לא לקוח של סטינג",
  "",
];

for (const t of MUST_NOT_SKIP) {
  test(`"${t || "(ריק)"}" לא מדלג על השאלה`, () => {
    assert.equal(statesExistingCustomer(t), false);
  });
}

const MUST_SKIP = [
  "יש לי כבר יס",
  "אני לקוח של יס",
  "אני בסטינג",
  "יש לי yes",
  "כבר יש לי סטינג",
];

for (const t of MUST_SKIP) {
  test(`"${t}" מדלג על השאלה`, () => {
    assert.equal(statesExistingCustomer(t), true);
  });
}

const botSource = io.readFileSync("lib/bot.ts", "utf8");

test("הבוט מדלג רק על הצהרה מפורשת", () => {
  assert.ok(botSource.includes("statesExistingCustomer(params.text)"));
});

test("הבוט כבר לא מדלג על סמך תשובה רחבה", () => {
  assert.ok(
    !/volunteered\s*=\s*decision\.askSupplier[\s\S]{0,60}readSupplierAnswer/.test(
      botSource
    ),
    '"כן" חזר לדלג על השאלה - לקוח מעוניין יישלח לשירות'
  );
});


/* ============================================================
   זיהוי לקוח קיים - סימולציות מלאות
   ============================================================ */

const DECLARES = [
  "אצלכם",
  "אני אצלכם",
  "אנחנו אצלכם",
  "כבר אצלכם",
  "אני ביס",
  "אנחנו ביס",
  "אני בסטינג",
  "אני יס",
  "יש לי יס",
  "יש לנו סטינג",
  "כבר יש לי יס",
  "מה עם לקוחות קיימים",
  "לקוחות קיימים?",
  "המבצע תקף גם ללקוחות קיימים?",
  "אני לקוח שלכם",
  "אני לקוחה ותיקה",
  "כבר לקוח",
  "אני כבר לקוח",
  "לקוח קיים",
  "אני לקוח קיים",
  "אנחנו לקוחות קיימים",
  "לקוחה קיימת",
  "אני מנוי אצלכם",
];

for (const t of DECLARES) {
  test(`"${t}" → פנייה לשירות`, () => {
    assert.equal(statesExistingCustomer(t), true);
  });
}

const ASK_THEM = [
  "כן",
  "לא",
  "מה המחיר",
  "כמה זה עולה אצלכם",
  "מה המחיר אצלכם",
  "כמה עולה יס פלוס",
  "מעוניינת לשמוע אם המבצע עדיין בתוקף",
  "ערב טוב מעוניינת לשמוע",
  "בבקשה ליצור קשר ביום שני משעה 12",
  "לא -בהוט סיבים",
  "יש לי הוט",
  "אני בפרטנר",
  "אני לא ביס",
  "",
];

for (const t of ASK_THEM) {
  test(`"${t || "(ריק)"}" → שאלת הסינון`, () => {
    assert.equal(statesExistingCustomer(t), false);
  });
}

/* ---------- שומרים על כתיב מנורמל ---------- */

test("אין אות סופית באף תבנית", () => {
  for (const source of customerPatternSources()) {
    const bad = source.match(/[םןךףץ]/g);
    assert.equal(bad, null, `אות סופית (${bad?.join(", ")}) ב: ${source}`);
  }
});

test("אין יוד כפולה באף תבנית", () => {
  for (const source of customerPatternSources()) {
    assert.ok(
      !source.includes("יי"),
      `יוד כפולה לא תתאים אחרי נרמול: ${source}`
    );
  }
});

/* ============================================================
 *  תגובה שלא אומרת אם הוא לקוח
 * ============================================================
 *
 *  **מה נשבר בלי זה.** הלקוח כתב משהו, השאלה כבר נשאלה,
 *  והתשובה לא הכריעה - ואז לא קרה כלום. אדם מתעניין
 *  כותב ולא מקבל דבר.
 */

const UNCLEAR = [
  "מתי אפשר לדבר",
  "כמה זה עולה",
  "תשלח לי פרטים",
  "אני צריך לבדוק עם אשתי",
  "מה כולל המבצע",
];

for (const text of UNCLEAR) {
  test(`לא נחשבת תשובה: "${text}"`, () => {
    assert.equal(
      readSupplierAnswer(text),
      null,
      `סווג כתשובה ודאית: ${text}`
    );
  });
}

test("השאלה החוזרת שונה מהראשונה", () => {
  /**
   * אותו משפט מילה במילה אומר ללקוח שלא קראו אותו.
   */
  assert.notEqual(SUPPLIER_QUESTION_AGAIN, SUPPLIER_QUESTION);
  assert.ok(SUPPLIER_QUESTION_AGAIN.includes("yes"));
  assert.ok(SUPPLIER_QUESTION_AGAIN.includes("sting"));
});

test("התקרה היא שתי שאלות ולא יותר", () => {
  /**
   * בלי תקרה, מי שכותב משפטים שאינם תשובה מקבל את
   * השאלה בלולאה - וזו הדרך הבטוחה לקבל בקשת הסרה.
   */
  assert.equal(MAX_SUPPLIER_ASKS, 2);
});

test("הבוט שואל שוב ועוצר בתקרה", () => {
  const bot = io.readFileSync("lib/bot.ts", "utf8");

  assert.ok(
    bot.includes("SUPPLIER_QUESTION_AGAIN"),
    "תגובה לא ברורה עדיין נענית בשתיקה"
  );
  assert.ok(
    bot.includes("asks < MAX_SUPPLIER_ASKS"),
    "אין תקרה - הלקוח יקבל את השאלה בלולאה"
  );
  assert.ok(
    bot.includes("ענה ולא ברור - צריך אותך"),
    "אחרי התקרה לא נפתחת התראה, והלקוח נשכח"
  );
});

test("השאלה החוזרת נספרת, אחרת התקרה חסרת משמעות", () => {
  const bot = io.readFileSync("lib/bot.ts", "utf8");
  const block = bot.slice(
    bot.indexOf("SUPPLIER_QUESTION_AGAIN,\n          });"),
    bot.indexOf("supplier:asked-again")
  );
  assert.ok(
    bot.includes("again: true") && bot.includes("type: ASKED_EVENT"),
    "השאלה החוזרת לא נרשמת"
  );
});

test("תשובה ברורה אחרי השאלה החוזרת עדיין מטופלת", () => {
  /** הזרימה לא נשברת: כן/לא ממשיכים כרגיל */
  assert.equal(readSupplierAnswer("לא"), "no");
  assert.equal(readSupplierAnswer("כן"), "yes");
  assert.equal(readSupplierAnswer("יש לי כבר יס"), "yes");

  /**
   * "אני בהוט" הוא כן תשובה: הוא אצל מתחרה, כלומר לא
   * אצלנו. נבדק כאן במפורש כדי שלא ייחשב בטעות עמום.
   */
  assert.equal(readSupplierAnswer("אני בהוט"), "no");
});

/* ---------- שהתיקון לא ידלוף למקומות אחרים ---------- */

test("השאלה החוזרת רק בתוך חלון של תגובה לדיוור", () => {
  /**
   * **הדליפה שנתפסה לפני ההעלאה.** הענף הזה רץ לפני
   * בדיקת מצב הבוט. בלי התנאי, ליד שנשאל פעם את שאלת
   * הסינון היה מקבל אותה שוב על כל הודעה לא ברורה -
   * גם חודש אחרי, וגם במצב "כל הודעה", במקום לקבל
   * טיפול רגיל.
   */
  const bot = io.readFileSync("lib/bot.ts", "utf8");
  assert.ok(
    bot.includes("if (!answer && decision.isBroadcastReply)"),
    "השאלה החוזרת יכולה לצאת מחוץ להקשר של דיוור"
  );
});

test("ההתראה נפתחת פעם אחת בלבד", () => {
  /**
   * בלי זה, כל הודעה נוספת מאותו אדם פותחת התראה
   * חדשה, ורשימת ההתראות הופכת לרעש.
   */
  const bot = io.readFileSync("lib/bot.ts", "utf8");
  assert.ok(bot.includes("NEEDS_YOU_EVENT"), "אין סימון שההתראה כבר נפתחה");
  assert.ok(
    bot.indexOf("NEEDS_YOU_EVENT") < bot.indexOf('title: "ענה ולא ברור'),
    "הבדיקה נעשית אחרי שההתראה כבר נוצרה"
  );
  assert.ok(bot.includes("if (!already)"), "ההתראה נוצרת בלי תנאי");
});

test("הסימון נפרד מסימון השאלה", () => {
  /** שני אירועים שונים, אחרת הספירה של השאלות תתקלקל */
  assert.notEqual(NEEDS_YOU_EVENT, ASKED_EVENT);
});

test("מצב המבצע לא משנה את נוסח התשובות", () => {
  /**
   * המתג קובע **את מי** שואלים, לא **מה** עונים.
   */
  assert.equal(replyForAnswer("yes"), REPLY_IF_CUSTOMER);
  assert.equal(replyForAnswer("no"), REPLY_IF_NOT_CUSTOMER);
  assert.equal(replyForAnswer(null), null);
});

console.log(`✓ supplier-check (סימולציות): ${passed} בדיקות עברו`);
