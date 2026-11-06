import assert from "node:assert/strict";
import io from "node:fs";
import {
  anchorsOf,
  receivedCampaign,
  CAMPAIGN_WINDOW_DAYS,
  ANCHOR_MIN_CHARS,
} from "../lib/campaign-audience";

/**
 * ============================================================
 *  מי קיבל את הדיוור
 * ============================================================
 *
 *  **הבעיה:** "הוא עונה לי ללקוחות פרטיים." הבוט ענה לכל
 *  מי שכתב, ולכן אנשים שלא שמעו על שום מבצע קיבלו שאלה
 *  עליו.
 *
 *  **והסיכון בתיקון, שחייב להיבדק כאן:** אם הזיהוי שוגה
 *  לכיוון השני - כל הנמענים נחסמים ואף אחד לא מקבל
 *  תשובה. זה בדיוק מה שקרה בגרסה 175, ולכן הקובץ הזה
 *  קיים.
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

const at = (iso: string) => new Date(iso);
const NOW = at("2026-11-04T09:00:00Z");

/** הדיוור כפי שהוא נשמר בתבנית, עם משתנה */
const CAMPAIGN = `היי {{1}}, מבצע חדש של yes:
חבילת טלוויזיה + אינטרנט סיבים ב-99 ש"ח לחודש.
מעוניין? תכתוב לי כאן.`;

function out(bodyText: string, iso = "2026-11-04T07:00:00Z", broadcast = false) {
  return { bodyText, broadcast, createdAt: at(iso) };
}

function check(outgoing: ReturnType<typeof out>[], listSendAt?: Date | null) {
  return receivedCampaign({
    campaignText: CAMPAIGN,
    outgoing,
    listSendAt: listSendAt ?? null,
    now: NOW,
  });
}

/* ============================================================
 *  העוגנים
 * ============================================================ */

test("המשתנה של התבנית לא נכנס לעוגן", () => {
  /**
   * **זו הנקודה שמפילה השוואה פשוטה.** התבנית יוצאת עם
   * {{1}} ומה שחוזר מטקסטר הוא "היי אושר". השוואה מלאה
   * נכשלת על כל נמען בלי יוצא מן הכלל.
   */
  const anchors = anchorsOf(CAMPAIGN);
  assert.ok(anchors.length > 0, "לא נמצא אף עוגן");

  for (const anchor of anchors) {
    assert.ok(!anchor.includes("{"), "המשתנה נכנס לעוגן");
    assert.ok(!anchor.includes("1}}"), "המשתנה נכנס לעוגן");
  }
});

test("העוגן הארוך ראשון - הוא המזהה החזק", () => {
  const anchors = anchorsOf(CAMPAIGN);
  for (let i = 1; i < anchors.length; i++) {
    assert.ok(
      anchors[i - 1].length >= anchors[i].length,
      "העוגנים לא מסודרים מהארוך לקצר"
    );
  }
});

test("קטע קצר לא נחשב עוגן", () => {
  /**
   * "היי" מופיע בכל הודעה שנייה. עוגן קצר היה מזהה כל
   * אדם כנמען - כלומר מבטל את הסינון לגמרי.
   */
  assert.deepEqual(anchorsOf("היי"), []);
  assert.deepEqual(anchorsOf("שלום רב"), []);
  assert.deepEqual(anchorsOf("{{1}}"), []);
  assert.deepEqual(anchorsOf(""), []);
  assert.equal(ANCHOR_MIN_CHARS, 12);
});

test("טקסט בלי שום קטע ארוך מספיק מוחזר כלא מזוהה", () => {
  const r = receivedCampaign({
    campaignText: "מבצע",
    outgoing: [out("מבצע")],
    now: NOW,
  });
  assert.equal(r.yes, false);
  assert.ok(r.why.includes("קצר מדי"), "הסיבה לא מסבירה מה לתקן");
});

/* ============================================================
 *  נמענים אמיתיים - אסור לחסום אף אחד מהם
 * ============================================================ */

const RECIPIENTS: Array<[string, string]> = [
  [
    "התבנית כפי שטקסטר מרנדר אותה",
    'היי אושר, מבצע חדש של yes: חבילת טלוויזיה + אינטרנט סיבים ב-99 ש"ח לחודש. מעוניין? תכתוב לי כאן.',
  ],
  [
    "שם אחר, אותו דיוור",
    'היי רחל, מבצע חדש של yes: חבילת טלוויזיה + אינטרנט סיבים ב-99 ש"ח לחודש. מעוניין? תכתוב לי כאן.',
  ],
  [
    "בלי מרכאות ובלי מקף",
    "היי ישראל\nמבצע חדש של yes\nחבילת טלוויזיה + אינטרנט סיבים ב99 שח לחודש",
  ],
  [
    "אותיות סופיות בכתיב אחר",
    "היי, מבצע חדש של yes: חבילת טלוויזיה + אינטרנט סיבים ב-99 שח לחודש",
  ],
  [
    "רק חלק מהדיוור יצא",
    "חבילת טלוויזיה + אינטרנט סיבים ב-99 ש\"ח לחודש",
  ],
  [
    "תוספת לפני ואחרי",
    'שלום! היי דני, מבצע חדש של yes: חבילת טלוויזיה + אינטרנט סיבים ב-99 ש"ח לחודש. נשמח לשמוע',
  ],
];

for (const [name, body] of RECIPIENTS) {
  test(`נמען מזוהה: ${name}`, () => {
    const r = check([out(body)]);
    assert.equal(r.yes, true, `נמען אמיתי נחסם - ${r.why}`);
  });
}

/* ============================================================
 *  מי שלא קיבל - חייב להישאר בחוץ
 * ============================================================ */

const OUTSIDERS: Array<[string, string]> = [
  ["לקוח פרטי", "היי, מה קורה? דיברנו על ההתקנה ביום שלישי"],
  ["הצעת מחיר מלפני שבוע", "שלחתי לך את ההצעה, תעדכן אותי מה החלטת"],
  ["תיאום התקנה", "הטכנאי יגיע מחר בין 9 ל-12, מתאים?"],
  ["חבר", "אחי תתקשר אליי כשאתה פנוי"],
  ["תבנית אחרת לגמרי", "היי, רק מזכיר שלא קיבלתי ממך תשובה. אשמח לעדכון"],
];

for (const [name, body] of OUTSIDERS) {
  test(`לא נמען: ${name}`, () => {
    const r = check([out(body)]);
    assert.equal(r.yes, false, `מי שלא קיבל דיוור זוהה כנמען - ${name}`);
  });
}

test("מי שלא יצאה אליו שום הודעה אינו נמען", () => {
  const r = check([]);
  assert.equal(r.yes, false);
  assert.ok(r.why.includes("לא יצאה אליו"), "הסיבה לא מדויקת");
});

/* ============================================================
 *  שני המקורות האחרים
 * ============================================================ */

test("הודעה שמסומנת כדיוור מספיקה", () => {
  /** דיוור שיצא מהמערכת מסומן, ואז אין צורך בטקסט */
  const r = check([out("משהו אחר לגמרי", "2026-11-04T07:00:00Z", true)]);
  assert.equal(r.yes, true);
  assert.ok(r.why.includes("מסומנת כדיוור"));
});

test("רשימת דיוור שנטענה מספיקה גם בלי שום הודעה", () => {
  /**
   * **המקור שהציל את הזיהוי.** אדם שקיבל דיוור מרשימה
   * שהועלתה - לפעמים לא נרשמה עליו שום הודעה יוצאת
   * אצלנו. בלי המקור הזה הוא היה נחסם.
   */
  const r = check([], at("2026-11-03T10:00:00Z"));
  assert.equal(r.yes, true);
  assert.ok(r.why.includes("רשימת דיוור"));
});

/* ============================================================
 *  החלון
 * ============================================================ */

test("דיוור מלפני חודש אינו הדיוור הנוכחי", () => {
  const r = check([out(RECIPIENTS[0][1], "2026-09-20T10:00:00Z")]);
  assert.equal(r.yes, false, "תגובה לדיוור מלפני חודש תקבל שאלה על מבצע שנגמר");
});

test("רשימה שנשלחה לפני חודש אינה בחלון", () => {
  const r = check([], at("2026-09-20T10:00:00Z"));
  assert.equal(r.yes, false);
});

test("החלון הוא 14 יום", () => {
  assert.equal(CAMPAIGN_WINDOW_DAYS, 14);

  const inside = check([out(RECIPIENTS[0][1], "2026-10-25T09:00:00Z")]);
  const outside = check([out(RECIPIENTS[0][1], "2026-10-18T09:00:00Z")]);

  assert.equal(inside.yes, true, "נמען מתוך החלון נחסם");
  assert.equal(outside.yes, false, "נמען מחוץ לחלון עבר");
});

/* ============================================================
 *  שדה ריק
 * ============================================================ */

test("בלי טקסט דיוור הבוט לא עונה לאף אחד", () => {
  /**
   * **זו הבחירה המכוונת.** עדיף שלא יענה לאף אחד מאשר
   * שיענה לכל מי שכותב. הסיבה מוחזרת במפורש כדי שהמסך
   * והאבחון יוכלו לומר מה לתקן.
   */
  const r = receivedCampaign({
    campaignText: "",
    outgoing: [out(RECIPIENTS[0][1])],
    listSendAt: at("2026-11-03T10:00:00Z"),
    now: NOW,
  });

  assert.equal(r.yes, false, "שדה ריק פתח את הבוט לכולם");
  assert.ok(r.why.includes("לא הוכנס"), "הסיבה לא אומרת מה חסר");
});

test("רווחים בלבד נחשבים ריק", () => {
  const r = receivedCampaign({
    campaignText: "   \n  ",
    outgoing: [out(RECIPIENTS[0][1])],
    now: NOW,
  });
  assert.equal(r.yes, false);
});

/* ============================================================
 *  כל מסלול מחזיר סיבה שאפשר לפעול לפיה
 * ============================================================ */

test("לכל תשובה יש סיבה בעברית", () => {
  const cases = [
    check([out(RECIPIENTS[0][1])]),
    check([out("לקוח פרטי שלי")]),
    check([]),
    check([], at("2026-11-03T10:00:00Z")),
    receivedCampaign({ campaignText: "", outgoing: [], now: NOW }),
    receivedCampaign({ campaignText: "קצר", outgoing: [out("קצר")], now: NOW }),
  ];

  for (const r of cases) {
    assert.ok(r.why.trim().length > 5, "סיבה ריקה או חסרת משמעות");
    assert.ok(/[א-ת]/.test(r.why), "הסיבה לא בעברית");
  }
});

/* ============================================================
 *  החיווט
 * ============================================================ */

const bot = io.readFileSync("lib/campaign-bot.ts", "utf8");

test("הבוט מריץ את הזיהוי הזה ולא זיהוי משלו", () => {
  assert.ok(bot.includes("receivedCampaign({"), "הבוט לא בודק מי נמען");
  assert.ok(
    bot.includes("campaignText: settings.campaignText"),
    "הבוט לא קורא את הטקסט מההגדרות"
  );
});

test("בקשת הסרה קודמת לבדיקת הנמען", () => {
  /**
   * **זכות ההסרה לא תלויה בשום תנאי.** מי שמבקש
   * להפסיק נחסם, גם אם מעולם לא קיבל דיוור ממך.
   */
  /** בתוך הפונקציה שמטפלת בהודעה נכנסת, לא על הקובץ */
  const reply = bot.slice(bot.indexOf("export async function handleCampaignReply"));

  assert.ok(
    reply.indexOf("detectUnsubscribe(params.text)") <
      reply.indexOf("receivedCampaign({"),
    "מי שלא קיבל דיוור ויבקש הסרה - לא ייחסם"
  );
});

test("מי שלא נמען לא מקבל שום שליחה", () => {
  /**
   * ההשוואה נעשית **בתוך כל פונקציה בנפרד**. השוואה על
   * הקובץ כולו מצאה את השליחה של הפעולה הידנית, שקודמת
   * בקובץ - וזו טעות שחוזרת: אינדקס מתחילת הקובץ אינו
   * אינדקס בתוך הפונקציה.
   */
  for (const fn of ["handleCampaignReply", "askSupplierQuestion"]) {
    const body = bot.slice(bot.indexOf(`export async function ${fn}`));
    const end = body.indexOf("\nexport ", 10);
    const scoped = end > -1 ? body.slice(0, end) : body;

    const checkAt = scoped.indexOf("receivedCampaign({");
    const firstSend = scoped.indexOf("await send(lead");

    assert.ok(checkAt > -1, `${fn} לא בודקת מי נמען`);
    assert.ok(firstSend > -1, `${fn} לא שולחת כלום`);
    assert.ok(
      checkAt < firstSend,
      `${fn} שולחת הודעה לפני שנבדק אם הוא נמען`
    );
  }

  assert.ok(bot.includes('action: "not-recipient"'), "אין מסלול למי שלא נמען");
});

test("כישלון בשליפת הרשימה לא חוסם את הבוט", () => {
  /**
   * הרשימה היא מקור נוסף, לא תנאי. אם השליפה נכשלת,
   * הזיהוי ממשיך לפי הטקסט - ולא חוסם את כולם.
   */
  const fn = bot.slice(bot.indexOf("async function listSendFor"));
  assert.ok(fn.includes("catch"), "כישלון בשליפה יפיל את הבוט");
  assert.ok(fn.includes("return null"), "כישלון לא מוחזר כ'לא נמען' בשקט");
});

test("המסך מריץ את אותה פונקציה שהבוט מריץ", () => {
  /**
   * מסך שבודק בכלל אחר מהבוט אומר "הכל טוב" על משהו
   * שלא יעבוד. זה כבר קרה כאן.
   */
  const screen = io.readFileSync("components/BotSettings.tsx", "utf8");
  const diag = io.readFileSync(
    "app/api/diagnostics/bot-check/route.ts",
    "utf8"
  );
  const health = io.readFileSync("app/api/health/system/route.ts", "utf8");

  assert.ok(screen.includes("anchorsOf("), "המסך לא בודק אם הטקסט מזוהה");
  assert.ok(diag.includes("receivedCampaign({"), "האבחון לא בודק מי נמען");
  assert.ok(health.includes("anchorsOf("), "בריאות המערכת לא בודקת את הטקסט");
});

test("מתג דלוק בלי טקסט מדווח כבעיה ולא כהערה", () => {
  /**
   * **המצב שנראה בדיוק כמו בוט שבור.** מתג דלוק ושדה
   * ריק = שתיקה מלאה. אם זה לא צועק בשני מסכים, נבזבז
   * על זה עוד יום.
   */
  const health = io.readFileSync("app/api/health/system/route.ts", "utf8");
  const screen = io.readFileSync("components/BotSettings.tsx", "utf8");

  assert.ok(
    health.includes("problems.push(") &&
      health.includes("לא הוכנס טקסט דיוור"),
    "בריאות המערכת לא מתריעה על מתג דלוק בלי טקסט"
  );
  assert.ok(
    screen.includes("המתג דלוק אבל הבוט לא יענה לאף אחד"),
    "מסך ההגדרות לא מתריע"
  );
});

test("הטקסט מגיע מההגדרות עד המסך", () => {
  const settings = io.readFileSync("lib/settings.ts", "utf8");
  const api = io.readFileSync("app/api/settings/route.ts", "utf8");
  const screen = io.readFileSync("components/BotSettings.tsx", "utf8");
  const page = io.readFileSync("app/settings/page.tsx", "utf8");
  const schema = io.readFileSync("prisma/schema.prisma", "utf8");

  assert.ok(schema.includes("campaignText"), "אין שדה במסד");
  assert.ok(settings.includes("campaignText"), "לא נקרא מהמסד");
  assert.ok(api.includes("data.campaignText"), "אי אפשר לשמור");
  assert.ok(screen.includes("campaignText: text"), "אין שדה הזנה");
  assert.ok(
    page.includes("campaignText={settings.campaignText}"),
    "הערך לא מועבר למסך"
  );
});

test("השדה במסד הוא תוספת בלבד", () => {
  /** db push מסרב למחיקת עמודות ולאינדקס ייחודי חדש */
  const schema = io.readFileSync("prisma/schema.prisma", "utf8");
  assert.ok(
    /campaignText\s+String\?/.test(schema),
    "השדה לא אופציונלי - הבנייה תיכשל על נתונים קיימים"
  );
});

console.log(`✓ campaign-audience: ${passed} בדיקות עברו`);
