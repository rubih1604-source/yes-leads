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

/* ---------- ההכרעה אחת, ואף אחד לא עוקף אותה ---------- */

const bot = io.readFileSync("lib/bot.ts", "utf8");

test("הבוט מבצע את ההכרעה ולא מכריע בעצמו", () => {
  assert.ok(bot.includes("decideInbound"));
  assert.ok(
    bot.includes("decision.askSupplier"),
    "הבוט בודק תנאי משלו במקום את ההכרעה"
  );
});

test("הבוט כבר לא בודק לבד אם זו תגובה לדיוור", () => {
  assert.ok(
    !/if \(replyAfterBroadcast\(/.test(bot),
    "נשארה הכרעה שנייה בבוט - היא תתפצל מההכרעה המרכזית"
  );
});

const runner = io.readFileSync("lib/runner.ts", "utf8");
const send = io.readFileSync("app/api/broadcast/[id]/send/route.ts", "utf8");

test("דיוור מרשימת לידים ומבצע מסומן כ-leads", () => {
  assert.ok(runner.includes("KIND_LEADS"));
  assert.ok(!runner.includes("KIND_DATA"), "דיוור ללידים סומן כדאטה");
});

test("דיוור מרשימה שנטענה מסומן כ-data", () => {
  assert.ok(send.includes("KIND_DATA"));
  assert.ok(!send.includes("KIND_LEADS"));
});

const check = io.readFileSync(
  "app/api/diagnostics/bot-check/route.ts",
  "utf8"
);

test("האבחון מריץ את אותה הכרעה", () => {
  assert.ok(check.includes("decideInbound"));
});


/* ---------- ענה מעצמו, בלי שנשאל ---------- */

test("הצהרה מפורשת מדלגת על השאלה, והבדיקה קודמת לשליחה", () => {
  assert.ok(
    bot.includes("statesExistingCustomer(params.text)"),
    '"יש לי כבר יס" עדיין מקבל בחזרה "האם אתם לקוחות של yes?"'
  );

  const declared = bot.indexOf("statesExistingCustomer(params.text)");

  /**
   * הפסיק חשוב: בלעדיו ההתאמה תופסת גם את
   * SUPPLIER_QUESTION_AGAIN, שהיא השאלה החוזרת ויושבת
   * קודם בקובץ - והבדיקה הייתה משווה לשליחה הלא נכונה.
   */
  const ask = bot.indexOf("text: SUPPLIER_QUESTION,");
  assert.ok(declared > -1 && ask > -1);
  assert.ok(declared < ask, "השאלה נשלחת לפני שבודקים אם כבר הצהיר");
});

test("שני המסלולים משתמשים באותו מימוש", () => {
  const calls = bot.match(/settleSupplier\(\{/g) ?? [];
  assert.equal(calls.length, 2, "יש מסלול תשובה שלא עובר דרך המימוש המשותף");
});

test("המימוש המשותף משנה סטטוס רק על 'כן'", () => {
  const fn = bot.slice(
    bot.indexOf("async function settleSupplier"),
    bot.indexOf("export async function handleInboundMessage")
  );
  const yes = fn.indexOf('params.answer === "yes"');
  const status = fn.indexOf('toStatus: "לקוח קיים"');
  assert.ok(yes > -1 && yes < status, "סטטוס משתנה גם על 'לא'");
});

test("המימוש המשותף לא נוגע במי שלא הוכרע", () => {
  const fn = bot.slice(
    bot.indexOf("async function settleSupplier"),
    bot.indexOf("export async function handleInboundMessage")
  );
  assert.ok(fn.includes("if (!reply) return null"), "תשובה לא ברורה מטופלת בכל זאת");
});

test("ההיסטוריה שנשלפת לבוט כוללת את סוג הדיוור", () => {
  assert.ok(
    bot.includes("broadcastKind: true"),
    "ההכרעה תרוץ בלי לדעת מאיזה דיוור הוא הגיע"
  );
});


/* ---------- מגבלת הסטטוסים לא חוסמת תגובה לדיוור ---------- */

const gate = io.readFileSync("lib/bot-gate.ts", "utf8");

test("לשער יש מצב נפרד לתגובת דיוור", () => {
  assert.ok(gate.includes("GateScope"));
  assert.ok(gate.includes('scope: GateScope = "general"'));
});

test("מגבלת הסטטוסים חלה רק על הודעה רגילה", () => {
  assert.ok(
    gate.includes('scope === "general"'),
    "נמען דיוור עם סטטוס שלא בחרת ייחסם ולא יקבל את השאלה"
  );
  const guard = gate.indexOf('scope === "general"');
  const check = gate.indexOf("settings.botStatuses.includes");
  assert.ok(guard > -1 && guard < check);
});

test("שאר ההגנות נשארות בשני המצבים", () => {
  const statusGuard = gate.indexOf('scope === "general"');

  for (const must of [
    "settings.botEnabled",
    "withinBotHours",
    "lead.botMuted",
    'lead.origin === "sale"',
  ]) {
    const at = gate.indexOf(must);
    assert.ok(at > -1, `נעלמה הגנה: ${must}`);
    assert.ok(at < statusGuard, `${must} ירד מתחת למגבלת הסטטוסים`);
  }
});

test("ההכרעה נעשית לפני השער, אחרת אי אפשר לבחור מצב", () => {
  const decide = bot.indexOf("const decision = decideInbound({");
  const gateCall = bot.indexOf("await shouldBotReply(lead.id, scope)");

  assert.ok(decide > -1 && gateCall > -1, "השער כבר לא מקבל מצב");
  assert.ok(decide < gateCall, "השער רץ לפני שידוע מה ההודעה");
});

test("תשובה לשאלה שכבר נשאלה גם היא בשער של הדיוור", () => {
  assert.ok(
    bot.includes("decision.isBroadcastReply || askedEvent"),
    "מי שנשאל אתמול ועונה היום ייחסם בסטטוס"
  );
});

test("אין שתי שליפות היסטוריה ושתי הכרעות בבוט", () => {
  assert.equal(
    (bot.match(/decideInbound\(\{/g) ?? []).length,
    1,
    "חזרה הכרעה שנייה - היא תתפצל מהראשונה"
  );
  assert.equal(
    (bot.match(/const history/g) ?? []).length,
    1,
    "ההיסטוריה נשלפת פעמיים"
  );
});

test("האבחון מודד את אותו שער באותו מצב", () => {
  assert.ok(check.includes('shouldBotReply(lead.id, "broadcast")'));
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

test("הבוט באמת שואל את הרשימה", () => {
  assert.ok(bot.includes("lastListSendFor(lead.phone)"));
  const look = bot.indexOf("lastListSendFor(lead.phone)");
  const decide = bot.indexOf("const decision = decideInbound({");
  assert.ok(look < decide, "ההכרעה רצה לפני שידוע אם הוא ברשימה");
});

test("כישלון בחיפוש לא שובר את הבוט", () => {
  assert.ok(bot.includes("lastListSendFor(lead.phone).catch(() => null)"));
});

test("האבחון בודק את אותו מקור", () => {
  assert.ok(check.includes("lastListSendFor"));
  assert.ok(check.includes("ברשימת_דיוור_שנשלחה"));
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

test("הבוט והאבחון מריצים את אותו מתג", () => {
  /**
   * אבחון שלא מקבל את המתג היה עונה אחרת מהבוט - וזה
   * בדיוק סוג הפער שאי אפשר לראות.
   */
  const bot = io.readFileSync("lib/bot.ts", "utf8");
  const diag = io.readFileSync(
    "app/api/diagnostics/bot-check/route.ts",
    "utf8"
  );

  assert.ok(bot.includes("askEveryone: settings.botAskAll"));
  assert.ok(diag.includes("askEveryone: settings.botAskAll"));
});

test("המתג מגיע מההגדרות עד המסך", () => {
  const settings = io.readFileSync("lib/settings.ts", "utf8");
  const api = io.readFileSync("app/api/settings/route.ts", "utf8");
  const screen = io.readFileSync("components/BotSettings.tsx", "utf8");
  const page = io.readFileSync("app/settings/page.tsx", "utf8");

  assert.ok(settings.includes("botAskAll"), "לא נקרא מהמסד");
  assert.ok(api.includes("botAskAll"), "אי אפשר לשמור");
  assert.ok(screen.includes("botAskAll"), "אין כפתור");
  assert.ok(page.includes("askAll={settings.botAskAll"), "הערך לא מועבר למסך");
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

test("ספירת השאלות החוזרות מוגבלת לדיוור הנוכחי", () => {
  /**
   * אחרת מי שמיצה את המכסה באוקטובר לא יקבל כלום
   * לעולם.
   */
  const bot = io.readFileSync("lib/bot.ts", "utf8");
  assert.ok(
    bot.includes("const since = decision.window?.broadcastAt"),
    "הספירה רצה מתחילת הזמן"
  );
  assert.ok(bot.includes("createdAt: { gte: since }"));
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

  assert.ok(route.includes("decideInbound"), "מחליטה לבד");
  assert.ok(route.includes("replyToLead"), "שולחת במסלול משלה");
  assert.ok(route.includes("askEveryone: settings.botAskAll"), "מתעלמת ממצב מבצע");
});

test("ההשלמה מכבדת את אותם מעקות", () => {
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );

  assert.ok(route.includes("doNotContact: false"), "שולחת לרשימה השחורה");
  assert.ok(route.includes("botMuted: false"), "שולחת למי שהבוט מושתק אצלו");
});

test("ההשלמה רושמת שנשאל, כדי שלא יישאל פעמיים", () => {
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );
  assert.ok(route.includes("type: ASKED_EVENT"));
});

test("יש הצגה לפני שליחה", () => {
  const route = io.readFileSync(
    "app/api/maintenance/catch-up-asks/route.ts",
    "utf8"
  );
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));

  assert.ok(!get.includes("replyToLead"), "'הצג' שולח הודעות");
  assert.ok(!get.includes("db.leadEvent"), "'הצג' כותב למסד");
});

test("הפעולה מופיעה במסך התחזוקה", () => {
  const screen = io.readFileSync("components/MaintenanceScreen.tsx", "utf8");
  assert.ok(screen.includes("catch-up-asks"));
});

console.log(`✓ inbound-context: ${passed} בדיקות עברו`);
