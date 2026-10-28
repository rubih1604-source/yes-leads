import assert from "node:assert/strict";
import io from "node:fs";
import { digitsOf, isBlacklisted, splitByBlacklist } from "../lib/blacklist";
import {
  isBroadcastMessage,
  replyAfterBroadcast,
  replyDelayLabel,
  sortReplies,
  REPLY_WINDOW_DAYS,
} from "../lib/broadcast-replies";

/**
 * ============================================================
 *  נעילה על החסימה ועל מסך ההתעניינות
 * ============================================================
 *
 *  החסימה חוצה שתי טבלאות שמחוברות רק דרך הטלפון, ומספר
 *  נשמר בכל צורה אפשרית. הצלבה שלא מנרמלת מחזירה "אף אחד
 *  לא ברשימה" - ואז שולחת לכולם, בשקט.
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

/* ---------- ההצלבה לפי טלפון ---------- */

test("כל צורות הכתיבה מתכנסות לאותו מפתח", () => {
  const forms = [
    "+972521234567",
    "972521234567",
    "0521234567",
    "052-123-4567",
    "052 123 4567",
    "+972-52-123-4567",
  ];

  const keys = new Set(forms.map(digitsOf));
  assert.equal(keys.size, 1, `התפצל ל-${keys.size} מפתחות: ${[...keys]}`);
});

test("שני אנשים שונים לא מתנגשים", () => {
  assert.notEqual(digitsOf("0521234567"), digitsOf("0521234568"));
});

test("מספר ריק לא חוסם אף אחד", () => {
  const denied = new Set([digitsOf("0521234567")]);
  assert.equal(isBlacklisted("", denied), false);
  assert.equal(isBlacklisted(null, denied), false);
});

test("מי שברשימה נחסם בכל פורמט", () => {
  const denied = new Set([digitsOf("+972521234567")]);

  for (const form of ["0521234567", "052-123-4567", "+972521234567"]) {
    assert.equal(isBlacklisted(form, denied), true, `לא נחסם: ${form}`);
  }
});

test("מי שלא ברשימה עובר", () => {
  const denied = new Set([digitsOf("0521234567")]);
  assert.equal(isBlacklisted("0509999999", denied), false);
});

/* ---------- החלוקה שקובעת מי מקבל ---------- */

const contacts = [
  { id: "a", phone: "052-123-4567" },
  { id: "b", phone: "0509999999" },
  { id: "c", phone: "+972521234567" },
  { id: "d", phone: "0541111111" },
];

test("החסומים יוצאים והשאר נשארים", () => {
  const denied = new Set([digitsOf("0521234567")]);
  const { allowed, blocked } = splitByBlacklist(contacts, denied);

  assert.deepEqual(blocked.map((c) => c.id).sort(), ["a", "c"]);
  assert.deepEqual(allowed.map((c) => c.id).sort(), ["b", "d"]);
});

test("אף אחד לא נעלם - הסכום נשמר", () => {
  const denied = new Set([digitsOf("0521234567")]);
  const { allowed, blocked } = splitByBlacklist(contacts, denied);
  assert.equal(allowed.length + blocked.length, contacts.length);
});

test("רשימה שחורה ריקה - כולם עוברים", () => {
  const { allowed, blocked } = splitByBlacklist(contacts, new Set());
  assert.equal(allowed.length, contacts.length);
  assert.equal(blocked.length, 0);
});

/* ---------- שהדיוור באמת קורא לזה ---------- */

const send = io.readFileSync("app/api/broadcast/[id]/send/route.ts", "utf8");

test("הדיוור מסנן לפי הרשימה השחורה", () => {
  assert.ok(send.includes("blacklistedDigits"));
  assert.ok(send.includes("splitByBlacklist"));
});

test("השליחה רצה על המותרים בלבד", () => {
  assert.ok(
    send.includes("allowed.slice(0, BATCH)"),
    "המנה עדיין נלקחת מכל הנותרים ולא רק מהמותרים"
  );
});

test("הסינון קורה לפני בחירת המנה", () => {
  const filter = send.indexOf("splitByBlacklist");
  const batch = send.indexOf("const batch =");
  assert.ok(filter > -1 && batch > -1);
  assert.ok(filter < batch, "הסינון חייב לקרות לפני בחירת המנה");
});

test("מי שדולג נרשם ולא נעלם", () => {
  assert.ok(send.includes("skipped: true"));
});

test("הסיום נמדד מול המותרים, אחרת הדיוור לא ייגמר לעולם", () => {
  assert.ok(send.includes("allowed.length - batch.length <= 0"));
});

/* ---------- שהבוט רושם לפני השער ---------- */

const bot = io.readFileSync("lib/bot.ts", "utf8");

test("בקשת הסרה נרשמת לפני בדיקת השער", () => {
  const detect = bot.indexOf("detectUnsubscribe(params.text)");
  const gate = bot.indexOf("shouldBotReply(lead.id)");

  assert.ok(detect > -1 && gate > -1);
  assert.ok(
    detect < gate,
    "בוט כבוי או מחוץ לשעות יגרום ל'הסר' לא להירשם"
  );
});

test("הבוט כותב לרשימה דרך המקום האחד", () => {
  assert.ok(bot.includes("addToBlacklist"));
  assert.ok(
    !/data:\s*\{\s*doNotContact:/.test(bot),
    "הבוט כותב ישירות למסד ועוקף את המקום האחד"
  );
});

/* ---------- מסך ההתעניינות ---------- */

const at = (iso: string) => new Date(iso);

const msg = (
  direction: string,
  bodyText: string,
  iso: string
): { direction: string; bodyText: string; createdAt: Date } => ({
  direction,
  bodyText,
  createdAt: at(iso),
});

test("מזהה הודעת דיוור", () => {
  assert.equal(
    isBroadcastMessage(msg("out", "דיוור: רשימת אוקטובר", "2026-10-01T09:00:00Z")),
    true
  );
});

test("שליחה ידנית אינה דיוור", () => {
  assert.equal(
    isBroadcastMessage(msg("out", "היי מה שלומך", "2026-10-01T09:00:00Z")),
    false
  );
  assert.equal(
    isBroadcastMessage(msg("in", "דיוור: משהו", "2026-10-01T09:00:00Z")),
    false
  );
});

test("מי שענה אחרי דיוור נכנס", () => {
  const found = replyAfterBroadcast(
    [
      msg("out", "דיוור: אוקטובר", "2026-10-01T09:00:00Z"),
      msg("in", "כמה זה עולה", "2026-10-01T10:30:00Z"),
    ],
    at("2026-10-02T00:00:00Z")
  );

  assert.ok(found);
  assert.equal(found?.replyText, "כמה זה עולה");
  assert.equal(found?.broadcastLabel, "אוקטובר");
});

test("מי שלא ענה לא נכנס", () => {
  const found = replyAfterBroadcast(
    [msg("out", "דיוור: אוקטובר", "2026-10-01T09:00:00Z")],
    at("2026-10-02T00:00:00Z")
  );
  assert.equal(found, null);
});

test("מי שלא קיבל דיוור לא נכנס, גם אם כתב", () => {
  const found = replyAfterBroadcast(
    [msg("in", "שלום", "2026-10-01T10:00:00Z")],
    at("2026-10-02T00:00:00Z")
  );
  assert.equal(found, null);
});

test("תגובה שקדמה לדיוור לא נחשבת", () => {
  const found = replyAfterBroadcast(
    [
      msg("in", "שאלה ישנה", "2026-09-01T10:00:00Z"),
      msg("out", "דיוור: אוקטובר", "2026-10-01T09:00:00Z"),
    ],
    at("2026-10-02T00:00:00Z")
  );
  assert.equal(found, null);
});

test("תגובה אחרי 30 יום כבר לא נחשבת", () => {
  const found = replyAfterBroadcast(
    [
      msg("out", "דיוור: אוקטובר", "2026-10-01T09:00:00Z"),
      msg("in", "מאוחר מדי", "2026-11-05T09:00:00Z"),
    ],
    at("2026-11-06T00:00:00Z")
  );
  assert.equal(found, null);
});

test("תגובה ביום ה-29 עדיין נחשבת", () => {
  const found = replyAfterBroadcast(
    [
      msg("out", "דיוור: אוקטובר", "2026-10-01T09:00:00Z"),
      msg("in", "בזמן", "2026-10-29T09:00:00Z"),
    ],
    at("2026-10-30T00:00:00Z")
  );
  assert.ok(found);
});

test("נמדד מול הדיוור האחרון, לא הראשון", () => {
  const found = replyAfterBroadcast(
    [
      msg("out", "דיוור: ישן", "2026-09-01T09:00:00Z"),
      msg("out", "דיוור: חדש", "2026-10-01T09:00:00Z"),
      msg("in", "מעוניין", "2026-10-01T11:00:00Z"),
    ],
    at("2026-10-02T00:00:00Z")
  );

  assert.equal(found?.broadcastLabel, "חדש");
});

test("התגובה הראשונה היא זו שנתפסת", () => {
  const found = replyAfterBroadcast(
    [
      msg("out", "דיוור: אוקטובר", "2026-10-01T09:00:00Z"),
      msg("in", "ראשונה", "2026-10-01T10:00:00Z"),
      msg("in", "שנייה", "2026-10-01T11:00:00Z"),
    ],
    at("2026-10-02T00:00:00Z")
  );

  assert.equal(found?.replyText, "ראשונה");
});

test("סדר ההודעות לא משנה את התוצאה", () => {
  const list = [
    msg("in", "מעוניין", "2026-10-01T11:00:00Z"),
    msg("out", "דיוור: אוקטובר", "2026-10-01T09:00:00Z"),
  ];

  assert.ok(replyAfterBroadcast(list, at("2026-10-02T00:00:00Z")));
});

test("החלון הוא 30 יום כפי שנקבע", () => {
  assert.equal(REPLY_WINDOW_DAYS, 30);
});

test("זמן התגובה מוצג בקנה מידה נכון", () => {
  const w = (from: string, to: string) => ({
    broadcastAt: at(from),
    broadcastLabel: "x",
    repliedAt: at(to),
    replyText: "x",
  });

  assert.equal(
    replyDelayLabel(w("2026-10-01T09:00:00Z", "2026-10-01T09:20:00Z")),
    "20 דק'"
  );
  assert.equal(
    replyDelayLabel(w("2026-10-01T09:00:00Z", "2026-10-01T14:00:00Z")),
    "5 שע'"
  );
  assert.equal(
    replyDelayLabel(w("2026-10-01T09:00:00Z", "2026-10-04T09:00:00Z")),
    "3 ימים"
  );
});


/* ---------- החיווט של 150 ---------- */

const botSrc = io.readFileSync("lib/bot.ts", "utf8");

test("שאלת הסינון נשאלת רק למי שענה לדיוור", () => {
  assert.ok(botSrc.includes("replyAfterBroadcast"));
  assert.ok(botSrc.includes("SUPPLIER_QUESTION"));
});

test("תשובה 'כן' משנה סטטוס ללקוח קיים", () => {
  const yes = botSrc.indexOf('answer === "yes"');
  const status = botSrc.indexOf('toStatus: "לקוח קיים"');
  assert.ok(yes > -1 && status > -1);
  assert.ok(status > yes, "שינוי הסטטוס לא תלוי בתשובה");
});

test("מי שברשימה השחורה לא נשאל ולא נענה", () => {
  /**
   * בלי זה אדם שכתב "הסר" מקבל בחזרה "האם אתם לקוחות
   * של yes?" - ההפך הגמור ממה שביקש.
   */
  assert.ok(
    botSrc.includes("!certain.blacklist && askedEvent"),
    "ענף התשובה לא מוגן מפני מי שביקש להסיר"
  );
  assert.ok(
    botSrc.includes("} else if (!certain.blacklist) {"),
    "ענף השאלה לא מוגן מפני מי שביקש להסיר"
  );
});

const repliesScreen = io.readFileSync("app/broadcast-replies/page.tsx", "utf8");

test("מסך ההתעניינות מוציא את הרשימה השחורה", () => {
  assert.ok(repliesScreen.includes("doNotContact: false"));
});

const trace = io.readFileSync("app/api/diagnostics/trace/route.ts", "utf8");

test("מסך האבחון קורא את השדה הנכון", () => {
  assert.ok(trace.includes("log.rawPayload"));
  assert.ok(!trace.includes("log.payload ??"), "השדה השבור חזר");
});


/* ---------- דיוור מכל המסלולים ---------- */

test("דיוור שיצא כתבנית רגילה נספר כדיוור", () => {
  assert.equal(
    isBroadcastMessage({
      direction: "out",
      broadcast: true,
      templateName: "מבצע אוקטובר",
      bodyText: "שלום, יש לנו מבצע",
      createdAt: at("2026-10-01T09:00:00Z"),
    }),
    true
  );
});

test("הודעה רגילה לא נספרת כדיוור", () => {
  assert.equal(
    isBroadcastMessage({
      direction: "out",
      broadcast: false,
      templateName: "מעקב",
      bodyText: "היי מה שלומך",
      createdAt: at("2026-10-01T09:00:00Z"),
    }),
    false
  );
});

test("היסטוריה שנרשמה לפני הסימון עדיין נתפסת", () => {
  assert.equal(
    isBroadcastMessage({
      direction: "out",
      templateName: null,
      bodyText: "דיוור: רשימת ספטמבר",
      createdAt: at("2026-09-01T09:00:00Z"),
    }),
    true
  );
});

test("מי שענה לדיוור מרשימת הלידים נכנס למסך", () => {
  const found = replyAfterBroadcast(
    [
      {
        direction: "out",
        broadcast: true,
        templateName: "מבצע אוקטובר",
        bodyText: "שלום, יש לנו מבצע",
        createdAt: at("2026-10-01T09:00:00Z"),
      },
      msg("in", "מעוניין", "2026-10-01T10:00:00Z"),
    ],
    at("2026-10-02T00:00:00Z")
  );

  assert.ok(found, "מי שענה לדיוור מרשימת הלידים לא נכנס למסך");
  assert.equal(found?.broadcastLabel, "מבצע אוקטובר");
});

/* ---------- סדר הרשימה ---------- */

const row = (status: string, repliedAt: string) => ({
  status,
  window: {
    broadcastAt: at("2026-10-01T09:00:00Z"),
    broadcastLabel: "x",
    repliedAt: at(repliedAt),
    replyText: status,
  },
});

test("לקוחות קיימים יורדים לסוף הרשימה", () => {
  const sorted = sortReplies([
    row("לקוח קיים", "2026-10-05T09:00:00Z"),
    row("חדש", "2026-10-02T09:00:00Z"),
    row("לקוח קיים", "2026-10-04T09:00:00Z"),
    row("מעוניין", "2026-10-03T09:00:00Z"),
  ]);

  assert.deepEqual(
    sorted.map((r) => r.status),
    ["מעוניין", "חדש", "לקוח קיים", "לקוח קיים"]
  );
});

test("בתוך כל קבוצה - התגובה האחרונה קודם", () => {
  const sorted = sortReplies([
    row("חדש", "2026-10-02T09:00:00Z"),
    row("חדש", "2026-10-06T09:00:00Z"),
  ]);

  assert.equal(sorted[0].window.repliedAt.toISOString().slice(0, 10), "2026-10-06");
});

test("אף אחד לא נעלם במיון", () => {
  const rows = [row("חדש", "2026-10-02T09:00:00Z"), row("לקוח קיים", "2026-10-03T09:00:00Z")];
  assert.equal(sortReplies(rows).length, rows.length);
});

test("המסך באמת ממיין דרך הכלל המשותף", () => {
  const screen = io.readFileSync("app/broadcast-replies/page.tsx", "utf8");
  assert.ok(screen.includes("sortReplies"), "המסך ממיין בעצמו ואף אחד לא בודק את זה");
  assert.ok(screen.includes("broadcast: true"), "המסך לא שולף את סימון הדיוור");
});

console.log(`✓ blacklist: ${passed} בדיקות עברו`);
