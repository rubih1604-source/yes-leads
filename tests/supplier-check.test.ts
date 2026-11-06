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

const botSource = io.readFileSync("lib/campaign-bot.ts", "utf8");

test("הבוט מדלג רק על הצהרה מפורשת", () => {
  assert.ok(botSource.includes("statesExistingCustomer(params.text)"));
});

test("הבוט כבר לא מדלג על סמך תשובה רחבה", () => {
  assert.ok(
    !/volunteered\s*=[\s\S]{0,60}readSupplierAnswer/.test(
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
  const bot = botSource;

  assert.ok(
    bot.includes("SUPPLIER_QUESTION_AGAIN"),
    "תגובה לא ברורה עדיין נענית בשתיקה"
  );
  assert.ok(
    bot.includes("asks.length < MAX_SUPPLIER_ASKS"),
    "אין תקרה - הלקוח יקבל את השאלה בלולאה"
  );
  assert.ok(
    bot.includes("ענה ולא ברור - צריך אותך"),
    "אחרי התקרה לא נפתחת התראה, והלקוח נשכח"
  );
});

test("השאלה החוזרת נספרת, אחרת התקרה חסרת משמעות", () => {
  assert.ok(
    botSource.includes("again: true") && botSource.includes("ASKED_EVENT"),
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

test("השאלה החוזרת לא יכולה לצאת לנצח", () => {
  /**
   * **מה שמנע את הלולאה קודם, ומה שמונע אותה עכשיו.**
   *
   * בבוט הקודם הגנה על זה בדיקה של "האם זו תגובה
   * לדיוור", שהייתה מורכבת ונשברה. בבוט הנקי המחסום
   * פשוט: השאלות נספרות מאז סגירת התהליך האחרונה, ויש
   * תקרה - ואחרי התקרה התהליך **נסגר**, כך שנכנס השקט
   * של 24 שעות ואין לופ.
   */
  assert.ok(botSource.includes("const since = lastDone?.createdAt"));
  assert.ok(botSource.includes("asks.length < MAX_SUPPLIER_ASKS"));
  assert.ok(
    botSource.includes('finish(lead.id, "לא ברור")'),
    "אחרי התקרה התהליך לא נסגר - הבוט יחזור על עצמו"
  );
});

test("ההתראה נפתחת פעם אחת בלבד", () => {
  /**
   * בלי זה, כל הודעה נוספת מאותו אדם פותחת התראה
   * חדשה, ורשימת ההתראות הופכת לרעש.
   */
  assert.ok(botSource.includes("NEEDS_YOU_EVENT"), "אין סימון שההתראה כבר נפתחה");
  assert.ok(
    botSource.indexOf("NEEDS_YOU_EVENT") <
      botSource.indexOf('title: "ענה ולא ברור'),
    "הבדיקה נעשית אחרי שההתראה כבר נוצרה"
  );
  assert.ok(botSource.includes("if (!already)"), "ההתראה נוצרת בלי תנאי");
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

/* ============================================================
 *  בוט הדיוור עומד בפני עצמו
 * ============================================================
 *
 *  **למה זה הדבר הכי חשוב כאן.** הבוט עושה דבר אחד -
 *  שואל שאלה אחת וקורא את התשובה. הוא רץ בתוך קובץ של
 *  אלף שורות שתלוי בסיווג, בחוקים, במאגר ידע ובמייל,
 *  וכשאחד מהם נפל - הבוט נפל איתו.
 */

const CAMPAIGN = "lib/campaign-bot.ts";

test("בוט הדיוור לא נשען על השכבות הכבדות", () => {
  const src = io.readFileSync(CAMPAIGN, "utf8");

  for (const heavy of [
    './classify"',
    './answer"',
    './email"',
    './callback-time"',
    './runner"',
  ]) {
    assert.ok(
      !src.includes(`from ${heavy}`),
      `בוט הדיוור תלוי ב-${heavy} - זו בדיוק התלות שהפילה אותו`
    );
  }
});

test("מנוע החוקים נטען רק כשצריך, ואחרי שהתשובה כבר יצאה", () => {
  /**
   * התלות המעגלית הייתה דרך מנוע החוקים. ייבוא דינמי
   * כאן אומר שגם אם הוא ייפול, הלקוח כבר קיבל תשובה.
   */
  const src = io.readFileSync(CAMPAIGN, "utf8");

  assert.ok(
    !/^\s*import\s[^;]*from\s+"\.\/rules"/m.test(src),
    "מנוע החוקים מיובא בראש הקובץ"
  );
  assert.ok(src.includes('await import("./rules")'));
  assert.ok(
    src.indexOf("await send(lead, replyForAnswer") <
      src.indexOf("setExistingCustomer"),
    "הסטטוס משתנה לפני שהתשובה נשלחה"
  );
});

test("בקשת הסרה מטופלת לפני כל דבר אחר", () => {
  const src = io.readFileSync(CAMPAIGN, "utf8");
  /**
   * השער המשותף הוסר לגמרי מבוט הדיוור. מה שנשאר לבדוק
   * הוא שבקשת ההסרה קודמת לשקט של 24 השעות - אחרת מי
   * שבתוך השקט יבקש הסרה ולא ייחסם.
   */
  assert.ok(
    src.indexOf("detectUnsubscribe(params.text)") <
      src.indexOf("hours < QUIET_HOURS"),
    "בקשת הסרה נבדקת אחרי השקט"
  );
});

test("כל מסלול מחזיר סיבה", () => {
  /** בלי סיבה אי אפשר לדעת למה לא יצא כלום */
  const src = io.readFileSync(CAMPAIGN, "utf8");
  const returns = src.match(/return \{\s*\n?\s*action:/g) ?? [];
  const reasons = src.match(/reason:/g) ?? [];
  assert.ok(returns.length >= 6, `רק ${returns.length} מסלולים`);
  assert.ok(reasons.length >= returns.length, "יש מסלול בלי סיבה");
});

test("בוט הדיוור הוא הבוט היחיד בקליטה", () => {
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  assert.ok(hook.includes("handleCampaignReply"), "הבוט לא מחובר לקליטה");
  assert.ok(
    hook.includes("settings.campaignBot"),
    "הקליטה לא נשלטת על ידי מתג בוט הדיוור"
  );

  /**
   * **הבוט הקודם נמחק מהמערכת.** הבדיקה הזו היא השומר:
   * אם מישהו יחזיר אותו, היא תיפול. הוא החזיק עותק שני
   * של תהליך הסינון ושער עם שבע חסימות, ושניהם השתיקו
   * אותו בשקט.
   */
  for (const gone of [
    "handleInboundMessage",
    "pauseBotAfterHumanReply",
    "@/lib/bot",
  ]) {
    assert.ok(!hook.includes(gone), `הבוט הקודם חזר לקליטה: ${gone}`);
  }
});

test("הבוט הקודם לא קיים בקוד", () => {
  /**
   * ============================================================
   *  למה "ריק" ולא "לא קיים"
   * ============================================================
   *
   *  קובץ ZIP יכול להוסיף ולעדכן קבצים, אבל אין לו שום
   *  דרך לומר "הקובץ הזה נמחק". לבקש מחיקה ביד זה לבנות
   *  מערכת שתלויה בכך שמישהו יזכור - ואם הוא ימחק חלק
   *  ולא הכל, הבנייה תיפול.
   *
   *  לכן הקבצים נדרסים בקבצים ריקים. הבדיקה כאן היא שהם
   *  **ריקים מקוד**: אין בהם ייבוא, אין פונקציות, ואין
   *  שום דבר שיכול לרוץ.
   */
  for (const gone of [
    "lib/bot.ts",
    "lib/bot-gate.ts",
    "lib/classify.ts",
    "lib/callback-time.ts",
  ]) {
    if (!io.existsSync(gone)) continue;

    const src = io.readFileSync(gone, "utf8");

    assert.ok(
      src.includes("קובץ שנותר למחיקה"),
      `${gone} חזר למערכת עם קוד`
    );
    assert.ok(
      !/^\s*import\s/m.test(src),
      `${gone} עדיין מייבא קוד`
    );
    assert.ok(
      !/\bfunction\b|\bsettings\./.test(src),
      `${gone} עדיין מחזיק לוגיקה`
    );
  }
});

console.log(`✓ supplier-check (סימולציות): ${passed} בדיקות עברו`);
