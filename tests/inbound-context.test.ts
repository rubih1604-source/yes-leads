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

const base = {
  origin: "leadmanager",
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

console.log(`✓ inbound-context: ${passed} בדיקות עברו`);
