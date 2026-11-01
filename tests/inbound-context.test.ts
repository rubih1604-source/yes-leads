import assert from "node:assert/strict";
import io from "node:fs";
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
  alreadyAsked: false,
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
    alreadyAsked: true,
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
  const ask = bot.indexOf("text: SUPPLIER_QUESTION");
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
      alreadyAsked: false,
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
    alreadyAsked: false,
    blacklisted: false,
    listSendAt: sentAt,
    now: new Date("2026-11-01T10:05:00Z"),
  });

  assert.equal(d.askSupplier, true, "נמען דיוור אמיתי לא נשאל");
});

test("מי שכתב מעצמו לא נשאל רק בגלל חברות ברשימה", () => {
  /**
   * origin "whatsapp" הוא מישהו שכתב ראשון. אם לא נרשם
   * אליו דיוור, "הוא ברשימה" היא ראיה חלשה מדי.
   */
  const d = decideInbound({
    messages: [
      {
        direction: "in",
        bodyText: "שלום",
        createdAt: new Date("2026-11-01T10:00:00Z"),
      },
    ],
    origin: "whatsapp",
    alreadyAsked: false,
    blacklisted: false,
    listSendAt: new Date("2026-11-01T09:00:00Z"),
    now: new Date("2026-11-01T10:05:00Z"),
  });

  assert.equal(d.askSupplier, false);
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

console.log(`✓ inbound-context: ${passed} בדיקות עברו`);
