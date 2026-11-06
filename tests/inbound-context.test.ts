import assert from "node:assert/strict";
import io from "node:fs";
import { withinBotHours } from "../lib/working-hours";
import {
  decideInbound,
  lastBroadcastKind,
  KIND_DATA,
  KIND_LEADS,
} from "../lib/inbound-context";

/**
 * ============================================================
 *  נעילה על "את מי מותר לשאול"
 * ============================================================
 *
 *  **הנזק שזה מונע.**
 *
 *  דיוור ללידים שלך נשלח לפי סטטוס - לאנשים שכבר דיברת
 *  איתם, שחלקם קיבלו ממך הצעת מחיר. שאלה כמו "האם אתם
 *  לקוחות של yes?" לאדם כזה אומרת לו שאינך זוכר מי הוא.
 *
 *  השאלה נועדה לדאטה שנטענה מקובץ בלבד - אנשים שבאמת
 *  איננו יודעים עליהם כלום.
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

const out = (kind: string | null, iso: string) => ({
  direction: "out",
  broadcast: true,
  broadcastKind: kind,
  templateName: "מבצע",
  bodyText: "שלום, יש לנו מבצע",
  createdAt: at(iso),
});

const inMsg = (text: string, iso: string) => ({
  direction: "in",
  bodyText: text,
  createdAt: at(iso),
});

/**
 * ברירת המחדל היא **נמען דיוור**, לא ליד שלך.
 *
 * קודם היה כאן "leadmanager" - כלומר כל הבדיקות של
 * שאלת הסינון רצו על ליד שבפועל אסור לשאול אותו, וזה
 * בדיוק המקרה שנשבר בשטח. הבעלות נבדקת בנפרד למטה.
 */
const base = {
  origin: "broadcast",
  askedAt: null as Date | null,
  blacklisted: false,
  now: at("2026-10-29T12:00:00Z"),
};

/* ---------- הכלל המרכזי ---------- */

test("דיוור לדאטה שנטענה - שואלים", () => {
  const d = decideInbound({
    ...base,
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, true);
  assert.equal(d.isBroadcastReply, true);
});

test("דיוור ללידים שלך - לא שואלים", () => {
  const d = decideInbound({
    ...base,
    messages: [
      out(KIND_LEADS, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(
    d.askSupplier,
    false,
    "לקוח שקיבל הצעת מחיר בשבוע שעבר נשאל אם הוא לקוח קיים"
  );
});

test("אבל הוא כן נכנס למסך ההתעניינות", () => {
  const d = decideInbound({
    ...base,
    messages: [
      out(KIND_LEADS, "2026-10-29T09:00:00Z"),
      inMsg("מעוניין", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.isBroadcastReply, true, "תגובה לדיוור ללידים נעלמה מהמסך");
});

test("הודעה שאינה תגובה לדיוור - לא נוגעים בה", () => {
  const d = decideInbound({
    ...base,
    messages: [inMsg("שלום", "2026-10-29T10:00:00Z")],
  });

  assert.equal(d.isBroadcastReply, false);
  assert.equal(d.askSupplier, false);
});

/* ---------- מצבים שעוצרים את השאלה ---------- */

test("מי שברשימה השחורה לא נשאל", () => {
  const d = decideInbound({
    ...base,
    blacklisted: true,
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("הסר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
});

test("מי שכבר נשאל לא נשאל שוב", () => {
  const d = decideInbound({
    ...base,
    askedAt: at("2026-10-29T09:30:00Z"),
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("כן", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
});

/* ---------- היסטוריה שנרשמה לפני השדה ---------- */

test("הודעה ישנה בלי סוג נחשבת לידים - הצד הבטוח", () => {
  assert.equal(
    lastBroadcastKind([out(null, "2026-10-01T09:00:00Z")]),
    KIND_LEADS,
    "ברירת מחדל מסוכנת: הודעות ישנות היו גורמות לשאלה ללקוחות אמיתיים"
  );
});

test("ולכן גם לא שואלים עליה", () => {
  const d = decideInbound({
    ...base,
    messages: [
      out(null, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
});

/* ---------- הדיוור האחרון הוא שקובע ---------- */

test("דאטה אחרי לידים - הדיוור האחרון קובע", () => {
  const d = decideInbound({
    ...base,
    messages: [
      out(KIND_LEADS, "2026-10-20T09:00:00Z"),
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("מעוניין", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, true);
});

test("לידים אחרי דאטה - גם כאן האחרון קובע", () => {
  const d = decideInbound({
    ...base,
    messages: [
      out(KIND_DATA, "2026-10-20T09:00:00Z"),
      out(KIND_LEADS, "2026-10-29T09:00:00Z"),
      inMsg("מעוניין", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
});

test("סדר ההודעות ברשימה לא משנה את ההכרעה", () => {
  const a = decideInbound({
    ...base,
    messages: [
      inMsg("מעוניין", "2026-10-29T10:00:00Z"),
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
    ],
  });

  assert.equal(a.askSupplier, true);
});

/* ---------- ההכרעה נשארה, הבוט שהשתמש בה נמחק ---------- */

/**
 * ============================================================
 *  מה נבדק כאן קודם
 * ============================================================
 *
 *  כאן ישבו שלושה חלקים שלמים: שהבוט מריץ את decideInbound
 *  ולא מכריע בעצמו, שהוא קורא ל-settleSupplier פעמיים
 *  בלבד, ושלשער יש מצב נפרד לתגובת דיוור שבו מגבלת
 *  הסטטוסים לא חלה.
 *
 *  כל אלה תיארו את הבוט הקודם, **והוא נמחק** - יחד עם
 *  השער, הסיווג, המצבים ומגבלת הסטטוסים. בוט הדיוור לא
 *  משתמש ב-decideInbound בכלל: הוא עונה לכל מי שכותב.
 *
 *  **מה שנשאר תקף** הוא decideInbound עצמה, שעדיין
 *  מכריעה מי ענה לדיוור - בשביל מסך המתעניינים. כל
 *  הבדיקות שלה למעלה ולמטה נשארו כפי שהן.
 */

test("בוט הדיוור לא מכריע לפי הקשר הדיוור", () => {
  /**
   * זו הייתה החסימה שאף אחד לא ראה: הבוט שתק כי ההכרעה
   * אמרה "זו לא תגובה לדיוור", על מישהו שכתב לנו מילה
   * אחת בוואטסאפ.
   */
  const campaign = io.readFileSync("lib/campaign-bot.ts", "utf8");

  /**
   * ============================================================
   *  מה אסור, ומה דווקא כן
   * ============================================================
   *
   *  **אסור:** מנוע ההכרעה. decideInbound שוקל מקור,
   *  סוג דיוור, חלון תגובה ומתגים - שכבות שנשברו וחסמו
   *  100% מהנמענים. הבוט לא נוגע בו.
   *
   *  **מותר, ואף נחוץ:** שליפה פשוטה של "מתי יצא אליו
   *  דיוור מרשימה שהעלית". זו שאילתה אחת לשדה אחד, לא
   *  הכרעה - והיא המקור היחיד שמזהה נמען שלא נרשמה
   *  עליו שום הודעה יוצאת. בלעדיה הוא היה נחסם.
   */
  for (const gone of ["decideInbound", "isBroadcastReply", "broadcastKind"]) {
    assert.ok(
      !campaign.includes(gone),
      `בוט הדיוור תלוי שוב בהקשר הדיוור: ${gone}`
    );
  }

  assert.ok(
    campaign.includes("lastListSendFor"),
    "הבוט לא בודק את הרשימה שנטענה - נמען בלי הודעה רשומה ייחסם"
  );
});

test("מסך המתעניינים הוא מי שמשתמש בהכרעה", () => {
  const screen = io.readFileSync("app/broadcast-replies/page.tsx", "utf8");
  assert.ok(screen.includes("decideInbound"), "המסך לא מריץ את ההכרעה");
  assert.ok(screen.includes("decision.window"), "המסך לא קורא את החלון");
});


/* ---------- הרשימה שנטענה כמקור אמת שני ---------- */

const listSent = at("2026-11-01T09:00:00Z");

/** "עכשיו" שאחרי השליחה - אחרת שום תגובה לא בתוך הטווח */
const afterSend = { ...base, now: at("2026-11-01T12:00:00Z") };

test("ויויאן: אין רישום הודעה, אבל היא ברשימה שנשלחה", () => {
  const d = decideInbound({
    ...afterSend,
    messages: [inMsg("מעוניינת לשמוע אם המבצע בתוקף", "2026-11-01T10:00:00Z")],
    listSendAt: listSent,
  });

  assert.equal(
    d.isBroadcastReply,
    true,
    "בדיוק המקרה שקרה: הדיוור הגיע, לא נרשם, והבוט שתק"
  );
  assert.equal(d.askSupplier, true);
});

test("דיוור לרשימה הוא תמיד דאטה - ולכן שואלים", () => {
  const d = decideInbound({
    ...afterSend,
    messages: [inMsg("כמה זה עולה", "2026-11-01T10:00:00Z")],
    listSendAt: listSent,
  });
  assert.equal(d.askSupplier, true);
});

test("תגובה שקדמה לשליחת הרשימה לא נחשבת", () => {
  const d = decideInbound({
    ...afterSend,
    messages: [inMsg("שאלה ישנה", "2026-10-20T10:00:00Z")],
    listSendAt: listSent,
  });
  assert.equal(d.isBroadcastReply, false);
});

test("אחרי 30 יום מהשליחה - כבר לא", () => {
  const d = decideInbound({
    ...base,
    messages: [inMsg("מאוחר", "2026-12-20T10:00:00Z")],
    listSendAt: listSent,
    now: at("2026-12-21T00:00:00Z"),
  });
  assert.equal(d.isBroadcastReply, false);
});

test("מי שלא ברשימה ואין לו הודעה - לא נוגעים בו", () => {
  const d = decideInbound({
    ...afterSend,
    messages: [inMsg("שלום", "2026-11-01T10:00:00Z")],
    listSendAt: null,
  });
  assert.equal(d.isBroadcastReply, false);
  assert.equal(d.askSupplier, false);
});

test("רישום הודעה גובר על הרשימה - סוג הדיוור ממנו", () => {
  const d = decideInbound({
    ...afterSend,
    messages: [
      out(KIND_LEADS, "2026-11-01T09:30:00Z"),
      inMsg("מעוניין", "2026-11-01T10:00:00Z"),
    ],
    listSendAt: listSent,
  });

  assert.equal(
    d.askSupplier,
    false,
    "דיוור ללידים שלך הפך לדאטה בגלל הרשימה"
  );
});

test("גם דרך הרשימה - מי שברשימה השחורה לא נשאל", () => {
  const d = decideInbound({
    ...afterSend,
    blacklisted: true,
    messages: [inMsg("הסר", "2026-11-01T10:00:00Z")],
    listSendAt: listSent,
  });
  assert.equal(d.askSupplier, false);
});

const membership = io.readFileSync("lib/broadcast-membership.ts", "utf8");

test("החיפוש ברשימה מדויק ולא מנחש", () => {
  assert.ok(
    membership.includes("where: { phone }"),
    "השוואת טלפון חלקית תתפוס אנשים אחרים"
  );
});

test("רק רשימה שבאמת נשלחה נחשבת", () => {
  assert.ok(membership.includes("broadcastSend"));
  assert.ok(
    membership.includes('orderBy: { createdAt: "desc" }'),
    "נלקחת שליחה ישנה במקום האחרונה"
  );
});

test("מסך המתעניינים שואל את הרשימה שנטענה", () => {
  /**
   * **למה זה עדיין חשוב, ולמה זה עבר לכאן.**
   *
   * הרשימה שנטענה היא מקור האמת השני: מי שקיבל דיוור
   * מרשימה שהעלית לא בהכרח מופיע כהודעה יוצאת אצלנו.
   * קודם הבוט היה זה שצריך לדעת את זה, כדי להחליט אם
   * לשאול. בוט הדיוור לא צריך - הוא שואל את כל מי
   * שכותב.
   *
   * מי שכן צריך את זה הוא מסך המתעניינים, שמראה לך מי
   * ענה לדיוור.
   */
  const screen = io.readFileSync("app/broadcast-replies/page.tsx", "utf8");
  assert.ok(screen.includes("lastListSendForMany"));
  assert.ok(
    screen.includes("listSendAt: listSends.get(lead.phone)"),
    "ההכרעה רצה בלי לדעת מי קיבל דיוור מרשימה"
  );
});

test("כישלון בחיפוש לא שובר את המסך", () => {
  const screen = io.readFileSync("app/broadcast-replies/page.tsx", "utf8");
  assert.ok(screen.includes("lastListSendForMany"));
  assert.ok(screen.includes(".catch("), "כישלון בשליפה יפיל את המסך");
});

/* ============================================================
 *  הליד שלך לא נשאל אם הוא לקוח קיים
 * ============================================================
 *
 *  קרה בפועל: לקוח שרובי טיפל בו קיבל את שאלת הסינון,
 *  כי המספר שלו היה גם באחד מקבצי הדאטה שהועלו. ראיה
 *  של "נמצא ברשימה" הספיקה כדי להתייחס אליו כזר.
 */

test("גם דיוור דאטה שנרשם על ליד שלך לא מפעיל את השאלה", () => {
  /**
   * קובץ דאטה יכול להכיל מספר שכבר ליד שלך. גם אז -
   * הוא שלך, ואתה מכיר אותו.
   */
  const d = decideInbound({
    ...base,
    origin: "leadmanager",
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
  assert.equal(d.isBroadcastReply, true, "התגובה עדיין שייכת למסך ההתעניינות");
});

const MINE_ORIGINS = ["leadmanager", "facebook", "manual", "import"];

for (const origin of MINE_ORIGINS) {
  test(`ליד בבעלות "${origin}" לא נשאל שאלת סינון`, () => {
    const sentAt = new Date("2026-11-01T09:00:00Z");

    const d = decideInbound({
      messages: [
        {
          direction: "in",
          bodyText: "היי, רציתי לשאול משהו",
          createdAt: new Date("2026-11-01T10:00:00Z"),
        },
      ],
      origin,
      askedAt: null,
      blacklisted: false,
      listSendAt: sentAt,
      now: new Date("2026-11-01T10:05:00Z"),
    });

    assert.equal(d.askSupplier, false, `ליד שלך נשאל: ${origin}`);
    assert.ok(d.reason.includes("שלך"), `ההסבר לא מדויק: ${d.reason}`);
  });
}

test("נמען דיוור אמיתי כן נשאל", () => {
  /** בלי זה התיקון היה הורג גם את מה שכן צריך לעבוד */
  const sentAt = new Date("2026-11-01T09:00:00Z");

  const d = decideInbound({
    messages: [
      {
        direction: "in",
        bodyText: "כמה זה עולה",
        createdAt: new Date("2026-11-01T10:00:00Z"),
      },
    ],
    origin: "broadcast",
    askedAt: null,
    blacklisted: false,
    listSendAt: sentAt,
    now: new Date("2026-11-01T10:05:00Z"),
  });

  assert.equal(d.askSupplier, true, "נמען דיוור אמיתי לא נשאל");
});

test("נמען דיוור שנוצר מהתגובה שלו כן נשאל", () => {
  /**
   * ============================================================
   *  המקרה האמיתי שנשבר בשטח
   * ============================================================
   *
   *  אדם מרשימת דאטה אינו ליד עד שהוא עונה. ברגע
   *  שהתגובה שלו מגיעה הוא נוצר עם בעלות "whatsapp",
   *  ולא נרשמה עליו הודעה יוצאת - כי בזמן הדיוור הוא
   *  לא היה קיים.
   *
   *  דרשתי שחברות ברשימה תיחשב רק לבעלות "broadcast",
   *  וזה פסל את **כל** נמעני הדיוור האמיתיים: לקוח ענה
   *  לדיוור ולא קיבל כלום.
   *
   *  בדיקת הבעלות היא ההגנה; תנאי נוסף מעליה רק חסם.
   */
  const d = decideInbound({
    messages: [
      {
        direction: "in",
        bodyText: "לכמה זמן המחיר",
        createdAt: new Date("2026-11-02T06:46:00Z"),
      },
    ],
    origin: "whatsapp",
    askedAt: null,
    blacklisted: false,
    listSendAt: new Date("2026-10-28T10:58:00Z"),
    now: new Date("2026-11-02T06:50:00Z"),
  });

  assert.equal(d.askSupplier, true, "נמען דיוור אמיתי לא נשאל");
  assert.equal(d.isBroadcastReply, true);
});

test("תגובה ימים אחרי הדיוור עדיין נחשבת תגובה", () => {
  /** הדיוור יצא ברביעי, הוא ענה בשני. זה בתוך החלון. */
  const d = decideInbound({
    messages: [
      {
        direction: "in",
        bodyText: "כמה זה עולה",
        createdAt: new Date("2026-11-02T06:46:00Z"),
      },
    ],
    origin: "broadcast",
    askedAt: null,
    blacklisted: false,
    listSendAt: new Date("2026-10-28T10:58:00Z"),
    now: new Date("2026-11-02T06:50:00Z"),
  });

  assert.equal(d.askSupplier, true);
});

test("אין תנאי שפוסל נמען דיוור לפי הבעלות שלו", () => {
  /**
   * הבעלות קובעת רק אם הוא **שלך**. מעבר לזה היא לא
   * אמורה לפסול אף נמען דיוור.
   */
  const src = io.readFileSync("lib/inbound-context.ts", "utf8");
  assert.ok(
    !src.includes("fromListOnly"),
    "חזר תנאי שפוסל נמעני דיוור אמיתיים"
  );
});

test("הבעלות נבדקת בפועל ולא רק מתקבלת", () => {
  /**
   * השדה origin הועבר להכרעה מההתחלה ופשוט לא נבדק.
   * זו הייתה הטעות, ולכן היא נעולה כאן.
   */
  const src = io.readFileSync("lib/inbound-context.ts", "utf8");
  assert.ok(
    src.includes("NON_LEAD_ORIGINS.includes(input.origin)"),
    "הבעלות שוב לא משפיעה על ההכרעה"
  );
});

/* ============================================================
 *  מצב מבצע - שואלים את כולם
 * ============================================================
 *
 *  **למה זה מתג ולא ניחוש.** מבצע יוצא לרשימה שלמה, וגם
 *  מי שדיברת איתו לפני חודשיים יכול להיות כבר לקוח של
 *  yes - ואז אין מה למכור לו, וצריך להפנות אותו לשירות.
 *  ההחלטה הזו היא של רובי, ולכן היא הגדרה.
 */

test("במצב מבצע גם הליד שלך נשאל", () => {
  const d = decideInbound({
    ...base,
    origin: "leadmanager",
    askEveryone: true,
    messages: [
      out(KIND_LEADS, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, true, "ליד שלך לא נשאל במצב מבצע");
});

test("במצב מבצע גם דיוור ללידים מפעיל את השאלה", () => {
  const d = decideInbound({
    ...base,
    origin: "broadcast",
    askEveryone: true,
    messages: [
      out(KIND_LEADS, "2026-10-29T09:00:00Z"),
      inMsg("כמה זה", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, true);
});

test("בלי מצב מבצע ההגנה חוזרת מיד", () => {
  /**
   * המתג לא משנה את הכלל - הוא רק משהה אותו. ברגע
   * שהוא כבוי, ליד שלך שוב אינו נשאל.
   */
  for (const flag of [false, undefined]) {
    const d = decideInbound({
      ...base,
      origin: "leadmanager",
      askEveryone: flag,
      messages: [
        out(KIND_LEADS, "2026-10-29T09:00:00Z"),
        inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
      ],
    });

    assert.equal(d.askSupplier, false, `ההגנה לא חזרה עבור ${flag}`);
  }
});

test("מצב מבצע לא עוקף את הרשימה השחורה", () => {
  /**
   * **המעקה שאסור לפרוץ.** מי שביקש שלא יפנו אליו לא
   * מקבל הודעה, גם לא במבצע.
   */
  const d = decideInbound({
    ...base,
    origin: "broadcast",
    askEveryone: true,
    blacklisted: true,
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
});

test("מצב מבצע לא שואל מי שכבר נשאל", () => {
  const d = decideInbound({
    ...base,
    origin: "broadcast",
    askEveryone: true,
    askedAt: at("2026-10-29T09:30:00Z"),
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
});

test("מצב מבצע לא הופך הודעה סתמית לתגובת דיוור", () => {
  /** בלי דיוור קודם אין חלון, ולכן אין מה לשאול */
  const d = decideInbound({
    ...base,
    origin: "broadcast",
    askEveryone: true,
    messages: [inMsg("שלום", "2026-10-29T10:00:00Z")],
  });

  assert.equal(d.isBroadcastReply, false);
  assert.equal(d.askSupplier, false);
});

test("המתג 'שאל את כולם' הוסר מהמערכת", () => {
  /**
   * **למה הוא הוסר.** הוא קבע **את מי** לשאול: רק מי
   * שהגיע מדאטה שנטענה, או את כולם. בוט הדיוור שואל את
   * כל מי שכותב, תמיד - ולכן המתג הזה כבר לא שולט בשום
   * דבר, והשארתו במסך הייתה הבטחה ריקה.
   */
  for (const file of [
    "lib/settings.ts",
    "app/api/settings/route.ts",
    "components/BotSettings.tsx",
    "app/settings/page.tsx",
  ]) {
    assert.ok(
      !io.readFileSync(file, "utf8").includes("botAskAll"),
      `המתג שלא עושה כלום נשאר ב-${file}`
    );
  }
});

/* ============================================================
 *  24 פירושו עד חצות
 * ============================================================
 *
 *  **מה שנתפס בשטח.** רובי הקליד 24 כשעת הסיום. השרת
 *  קיבל רק עד 23 וזרק את הערך **בשקט** - המסך המשיך
 *  להראות 24, והבוט עצר ב-23:00.
 */

test("שעת סיום 24 מכסה את כל היום מהשעה שנבחרה", () => {
  const at = (hour: number) =>
    new Date(Date.UTC(2026, 10, 3, hour - 2, 30));

  for (const hour of [8, 12, 20, 23]) {
    assert.equal(
      withinBotHours(8, 24, at(hour)),
      true,
      `${hour}:30 אמור להיות בתוך החלון`
    );
  }

  /** ולפני שעת ההתחלה - עדיין מחוץ */
  assert.equal(withinBotHours(8, 24, at(7)), false);
});

test("השרת מקבל 24 כשעת סיום ולא כשעת התחלה", () => {
  const api = io.readFileSync("app/api/settings/route.ts", "utf8");
  assert.ok(
    api.includes('key === "botToHour" ? 24 : 23'),
    "24 עדיין נדחה, או שגם שעת ההתחלה מקבלת אותו"
  );
});

test("שעה פסולה מחזירה שגיאה ולא נבלעת", () => {
  /**
   * בליעה שקטה היא מה שגרם למסך להראות ערך אחד ולשרת
   * להחזיק אחר.
   */
  const api = io.readFileSync("app/api/settings/route.ts", "utf8");
  const block = api.slice(
    api.indexOf('for (const key of ["botFromHour", "botToHour"])'),
    api.indexOf('for (const key of ["notifyEmail"')
  );

  assert.ok(block.includes("שעה לא תקינה"), "ערך פסול נזרק בשקט");
  assert.ok(block.includes("status: 400"), "לא מוחזרת שגיאה למסך");
});

/* ============================================================
 *  שואלים פעם אחת לכל דיוור, לא פעם אחת לכל החיים
 * ============================================================
 *
 *  **הבאג שנתפס באמצע מבצע חי.** מי שנשאל בדיוור של
 *  אוקטובר לא קיבל כלום במבצע של נובמבר - הוא נחסם
 *  לנצח, בשקט, בלי שום סימן.
 */

test("מי שנשאל בדיוור קודם נשאל שוב במבצע חדש", () => {
  const d = decideInbound({
    ...base,
    /** נשאל לפני שבוע, בדיוור הקודם */
    askedAt: at("2026-10-22T09:00:00Z"),
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("אני", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, true, "נחסם בגלל דיוור ישן");
});

test("מי שנשאל בתוך הדיוור הזה לא נשאל שוב", () => {
  const d = decideInbound({
    ...base,
    askedAt: at("2026-10-29T09:30:00Z"),
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
  assert.ok(d.reason.includes("כבר נשלחה"));
});

test("נשאל בדיוק ברגע הדיוור נחשב בתוכו", () => {
  /** גבול: שווה לזמן הדיוור הוא בתוך הדיוור */
  const d = decideInbound({
    ...base,
    askedAt: at("2026-10-29T09:00:00Z"),
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("מה המחיר", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, false);
});

test("מעולם לא נשאל - נשאל", () => {
  const d = decideInbound({
    ...base,
    askedAt: null,
    messages: [
      out(KIND_DATA, "2026-10-29T09:00:00Z"),
      inMsg("אני", "2026-10-29T10:00:00Z"),
    ],
  });

  assert.equal(d.askSupplier, true);
});

test("ספירת השאלות מוגבלת לתהליך הנוכחי", () => {
  /**
   * אחרת מי שמיצה את המכסה באוקטובר לא יקבל כלום
   * לעולם. בבוט הנקי נקודת האפס היא **סגירת התהליך
   * האחרונה**, ולא תאריך הדיוור.
   */
  const bot = io.readFileSync("lib/campaign-bot.ts", "utf8");
  assert.ok(
    bot.includes("const since = lastDone?.createdAt"),
    "הספירה רצה מתחילת הזמן"
  );
  assert.ok(bot.includes("e.createdAt.getTime() > since.getTime()"));
});

/* ---------- פעולת ההשלמה ---------- */

test("ההשלמה מריצה את אותה הכרעה ושולחת באותו מסלול", () => {
  /**
   * פעולה שמחליטה לבד או שולחת במסלול משלה הייתה
   * מתנהגת אחרת מהבוט ברגע הלא נכון.
   */
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );

  /**
   * **מה שהשתנה.** קודם הפעולה הריצה הכרעה משלה ושלחה
   * בעצמה, ואחר כך רשמה את האירוע בנפרד - שני עותקים
   * שיכולים להיפרד. עכשיו היא קוראת לפונקציה של הבוט,
   * שגם שולחת וגם רושמת.
   */
  assert.ok(route.includes("askSupplierQuestion"), "שולחת במסלול משלה");
  assert.ok(!route.includes("decideInbound"), "מחליטה לבד");
  assert.ok(
    !route.includes("db.leadEvent"),
    "רושמת בנפרד מהשליחה - רישום שנכשל יגרום לשאלה כפולה"
  );
});

test("ההשלמה מכבדת את אותם מעקות", () => {
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );

  assert.ok(route.includes("doNotContact: false"), "שולחת לרשימה השחורה");
  /**
   * השתקה מול ליד בודד נמחקה עם הבוט הקודם. מה שמגן
   * עכשיו הוא הרשימה השחורה - כאן, וגם בתוך
   * askSupplierQuestion עצמה.
   */
  const bot = io.readFileSync("lib/campaign-bot.ts", "utf8");
  const fn = bot.slice(bot.indexOf("export async function askSupplierQuestion"));
  assert.ok(
    fn.includes("lead.doNotContact"),
    "השליחה היזומה לא בודקת את הרשימה השחורה"
  );
});

test("ההשלמה רושמת שנשאל, כדי שלא יישאל פעמיים", () => {
  const bot = io.readFileSync("lib/campaign-bot.ts", "utf8");
  const fn = bot.slice(bot.indexOf("export async function askSupplierQuestion"));

  assert.ok(fn.includes("ASKED_EVENT"), "לא נרשם שנשאל");
  assert.ok(
    fn.indexOf("await send(lead") < fn.indexOf("ASKED_EVENT"),
    "נרשם שנשאל גם כשהשליחה נכשלה"
  );
});

test("יש הצגה לפני שליחה", () => {
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));

  assert.ok(!get.includes("askSupplierQuestion"), "'הצג' שולח הודעות");
  assert.ok(!get.includes("db.leadEvent"), "'הצג' כותב למסד");
});

test("הפעולה מופיעה במסך התחזוקה", () => {
  const screen = io.readFileSync("components/MaintenanceScreen.tsx", "utf8");
  assert.ok(screen.includes("catch-up-asks"));
});

test("ההשלמה מוגבלת לדיוור הנוכחי ולא לחודש אחורה", () => {
  /**
   * **מה שנתפס לפני שליחה.** חלון של חודש הכניס 117
   * אנשים לפעולה - רובם ישנים, וחלקם כבר דיברו איתו
   * מזמן. שליחה אליהם הייתה נראית מקרית ומוזרה.
   */
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );

  assert.ok(route.includes("const DEFAULT_HOURS = 12"), "ברירת המחדל רחבה מדי");
  assert.ok(route.includes("hoursFrom(request)"), "אי אפשר לכוון את החלון");
  assert.ok(
    route.includes('createdAt: { gte: since }'),
    "תגובה ישנה עדיין יכולה להיכנס לרשימה"
  );
});

test("מי שכבר נשאל או נסגר אחרי התגובה לא נכנס לרשימה", () => {
  /**
   * **מה שהחליף את החלון הרחב.** קודם היה צריך לקרוא
   * היסטוריה רחבה כדי לזהות לאיזה דיוור הוא ענה. עכשיו
   * השאלה פשוטה: האם טופל אחרי שכתב. מי שנשאל או שנסגר
   * מולו תהליך **אחרי** התגובה - טופל, ולא נכנס.
   */
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );
  assert.ok(
    route.includes("last.createdAt.getTime() >= replied.createdAt.getTime()"),
    "מי שכבר קיבל תשובה יישאל שוב"
  );
  assert.ok(route.includes("DONE_EVENT"), "מי שהתהליך נסגר מולו יישאל שוב");
});

/* ============================================================
 *  הדיוור לא סותם את הבוט
 * ============================================================
 *
 *  **הכשל שנתפס באמצע מבצע חי.** הד של דיוור שיצא
 *  מהמערכת נקרא כ"רובי ענה ידנית", והבוט הושתק מול
 *  הליד לשעות - בדיוק בחלון שבו הלקוחות עונים לדיוור.
 */

test("הד של תבנית או דיוור אינו נחשב תשובה ידנית", () => {
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  assert.ok(hook.includes("ourCampaign"), "אין בדיקה שההודעה היא הד שלנו");
  assert.ok(
    hook.includes("!alreadyOurs && !matchedByText && !ourCampaign"),
    "ההשתקה עדיין מופעלת על הד של דיוור"
  );
});

test("הזיהוי לא נשען על טקסט זהה בלבד", () => {
  /**
   * תבנית עם משתנים מרונדרת אחרת ממה שנשמר, ולכן
   * השוואת טקסט לבדה תיכשל תמיד על דיוור.
   */
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");
  const block = hook.slice(
    hook.indexOf("const ourCampaign"),
    hook.indexOf("if (!alreadyOurs && !matchedByText && !ourCampaign)")
  );

  assert.ok(block.includes("templateName: { not: null }"));
  assert.ok(block.includes("broadcast: true"));
});

test("ההשתקה האוטומטית וכל מה שסביבה הוסרו", () => {
  /**
   * **מה היה כאן.** בדיקה על פעולת תחזוקה ששיחררה
   * לידים שהבוט הושתק מולם בטעות - ההשתקה שנקבעה
   * כש"אתה בשיחה", והדיוור עצמו נקרא כתשובה שלך.
   *
   * הפעולה נמחקה יחד עם הסיבה לה. אין יותר השתקה
   * אוטומטית, ולכן אין ממה לשחרר - וזה מה שנבדק כאן
   * עכשיו: שהיא לא חזרה.
   */
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");
  const campaign = io.readFileSync("lib/campaign-bot.ts", "utf8");

  assert.ok(
    !hook.includes("pauseBotAfterHumanReply"),
    "תשובה ידנית שלך משתיקה שוב את הבוט"
  );
  assert.ok(
    !hook.includes("botPausedUntil"),
    "חזרה ההשתקה האוטומטית לקליטה"
  );
  assert.ok(
    !campaign.includes("botPausedUntil") && !campaign.includes("botMuted"),
    "הבוט בודק שוב השתקות"
  );
  /**
   * הנתיבים נדרסו בקבצים ריקים ולא נמחקו, כי ZIP לא
   * יכול למחוק. מה שנבדק: הם לא עושים כלום חוץ מלהחזיר
   * "הוסר".
   */
  for (const route of [
    "app/api/maintenance/release-bot-pause/route.ts",
    "app/api/leads/[id]/bot/route.ts",
  ]) {
    if (!io.existsSync(route)) continue;

    const src = io.readFileSync(route, "utf8");
    assert.ok(src.includes("410"), `${route} חזר לפעולה`);
    assert.ok(!src.includes("db."), `${route} עדיין כותב למסד`);
  }
});

/* ============================================================
 *  מה שחנק את המבצע - ואיפה זה עכשיו
 * ============================================================
 *
 *  **שלושת החסמים שחנקו את המבצע.** כולם רצו לפני שאלת
 *  הסינון, וכולם נועדו למצב הרגיל:
 *
 *  1. השתקה אחרי תשובה שלך
 *  2. שתי הודעות נכנסות = "שיחה חיה"
 *  3. המתנה בין תשובות
 *
 *  השלישי הוא הקטלני: שאלת הסינון היא הודעה רגילה,
 *  ולכן **התשובה לשאלה** נחסמה בגלל השאלה עצמה. התהליך
 *  בן שני השלבים לא יכול היה להסתיים בכלל.
 *
 *  קודם נבדק כאן שהשער מדלג עליהם בתגובה לדיוור. **השער
 *  נמחק**, ולכן מה שנבדק עכשיו הוא שאף אחד מהם לא קיים
 *  בשום צורה - לא בבוט ולא בקליטה.
 */

test("אף אחד משלושת החסמים לא קיים יותר", () => {
  const campaign = io.readFileSync("lib/campaign-bot.ts", "utf8");
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  for (const [what, why] of [
    ["botPausedUntil", "השתקה אחרי תשובה שלך"],
    ["recentInbound", '"שיחה חיה" - שתי הודעות נכנסות'],
    ["replyCooldown", "המתנה בין תשובות - חסמה את התשובה לשאלה עצמה"],
    ["withinBotHours", "שעות פעילות"],
    ["botStatuses", "מגבלת סטטוסים"],
    ["shouldBotReply", "השער המשותף כולו"],
  ]) {
    assert.ok(!campaign.includes(what), `חזר החסם לבוט: ${why}`);
    assert.ok(!hook.includes(what), `חזר החסם לקליטה: ${why}`);
  }

  if (io.existsSync("lib/bot-gate.ts")) {
    const src = io.readFileSync("lib/bot-gate.ts", "utf8");
    assert.ok(src.includes("קובץ שנותר למחיקה"), "השער חזר לקוד");
  }
});

test("הרשימה השחורה נבדקת לפני כל חסימה אחרת", () => {
  /** המעקה היחיד שלא יכול להיות תלוי בשום דבר */
  const bot = io.readFileSync("lib/campaign-bot.ts", "utf8");
  assert.ok(
    bot.indexOf("detectUnsubscribe(params.text)") <
      bot.indexOf("hours < QUIET_HOURS"),
    "בקשת הסרה נבדקת אחרי השקט"
  );
});

console.log(`✓ inbound-context: ${passed} בדיקות עברו`);
