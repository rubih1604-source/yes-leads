/**
 * ============================================================
 *  המקרה של אברהם - שני עולמות, אפס נגיעה
 * ============================================================
 *
 *  **המקרה האמיתי שהבדיקה הזו שומרת עליו.**
 *
 *  אברהם נכנס בבוקר מקמפיין של המכירה. אחרי עשר דקות הוא
 *  מילא את המודעה של רובי. אצל רובי הוא **לא הופיע בכלל**.
 *
 *  הסיבה לא הייתה באג נקודתי אלא המבנה: במסד היה
 *  `phone @unique`, כלומר מספר אחד = שורה אחת בכל המערכת.
 *  הכניסה השנייה מצאה את השורה של המכירה, עדכנה אותה,
 *  והליד של רובי מעולם לא נוצר. כל "תיקון" קודם היה
 *  ניסיון להחליט **למי שייכת** השורה המשותפת - במקום לתת
 *  לכל צד שורה משלו.
 *
 *  הבדיקה כאן נועלת את ההפרדה בשלוש רמות, כדי ששום עדכון
 *  עתידי לא יחזיר את זה בלי להיתפס:
 *
 *    1. הסכימה - המפתח הוא טלפון + ערוץ, ולא טלפון.
 *    2. הקליטה - מחפשת ליד **בתוך הערוץ**, ואחרי שהערוץ
 *       כבר הוכרע.
 *    3. הרשימות - כל צד שואל על הערוץ שלו.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MINE_CHANNEL,
  SALE_CHANNEL,
  channelKey,
  MY_LEADS_WHERE,
  SALE_LEADS_WHERE,
  leadsWhere,
  isSameSubmission,
} from "../lib/channel";
import { phoneChannel, mineKey, saleKey } from "../lib/lead-by-phone";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(
      "     " + (err instanceof Error ? err.message : String(err))
    );
  }
}

const read = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

const schema = read("../prisma/schema.prisma");
const intake = read("../app/api/webhooks/leadmanager/route.ts");
const index = read("../lib/lead-index.ts");
const runner = read("../lib/runner.ts");

/* ============================================================
 *  1. הסכימה
 * ========================================================= */
console.log("\nהסכימה - המפתח הוא טלפון + ערוץ");

test("לטלפון אין יותר @unique לבדו", () => {
  assert.ok(
    !/\n\s*phone\s+String\s+@unique/.test(schema),
    "phone @unique חזר - אותו אדם לא יוכל להיות ליד בשני הערוצים"
  );
});

test("הייחודיות של טלפון+ערוץ נאכפת על המסד", () => {
  /**
   * ============================================================
   *  למה לא `@@unique` בסכימה
   * ============================================================
   *
   *  `prisma db push` מסרב ליצור אינדקס ייחודי חדש בלי
   *  `--accept-data-loss`, והבנייה ברנדר נכשלה בגלל זה.
   *  הדגל הזה נשאר בפקודת הבנייה לתמיד וימחק עמודה בשקט
   *  ביום שבו תהיה טעות אמיתית - ולכן הוא לא בא בחשבון
   *  על מערכת חיה.
   *
   *  האכיפה נעשית ישירות על המסד במקום. התוצאה זהה.
   */
  assert.ok(
    !schema.includes("@@unique([phone, channel])"),
    "`@@unique` חזר לסכימה - הבנייה ברנדר תיכשל שוב"
  );

  assert.ok(
    schema.includes("@@index([phone, channel])"),
    "אין אפילו אינדקס רגיל - החיפוש לפי טלפון+ערוץ יהיה איטי"
  );

  assert.ok(
    index.includes("CREATE UNIQUE INDEX IF NOT EXISTS"),
    "אין אכיפה במסד - שתי קליטות במקביל ייצרו שתי שורות"
  );

  assert.ok(
    runner.includes("ensureLeadIndex()"),
    "האכיפה לא רצה מעצמה"
  );
});

test("האכיפה רצה אחרי מילוי הערוצים, לא לפניו", () => {
  const fill = runner.indexOf("fillChannels()");
  const ensure = runner.indexOf("ensureLeadIndex()");

  assert.ok(fill > -1 && ensure > -1);
  assert.ok(
    fill < ensure,
    "נאכפת ייחודיות לפני שלכל שורה יש את הערוץ הנכון שלה"
  );
});

test("האכיפה לא מנסה בלי סוף על כפילויות קיימות", () => {
  /**
   * בלי בדיקת הכפילויות מראש, היצירה נכשלת בשגיאה סתומה
   * בכל דקה, לנצח, בלי שאף אחד יודע למה.
   */
  assert.ok(
    index.includes("HAVING COUNT(*) > 1"),
    "אין בדיקת כפילויות לפני היצירה"
  );
  assert.ok(
    index.includes("duplicates"),
    "מספר הכפילויות לא מדווח"
  );
});

test("לליד יש עמודת ערוץ עם ברירת מחדל", () => {
  assert.ok(
    /channel\s+String\s+@default\("mine"\)/.test(schema),
    "עמודת הערוץ חסרה או בלי ברירת מחדל"
  );
});

test("השינוי אינו הורס נתונים: לא נמחקה שום עמודה", () => {
  /**
   * Render מריץ `prisma db push`, והוא עוצר על אובדן
   * נתונים. הסרת אינדקס אינה אובדן; מחיקת עמודה כן.
   */
  for (const col of [
    "phone",
    "origin",
    "status",
    "intakeAt",
    "doNotContact",
    "extra",
  ]) {
    assert.ok(
      schema.includes(col),
      `העמודה ${col} נעלמה מהסכימה - db push ייכשל או ימחק נתונים`
    );
  }
});

/* ============================================================
 *  2. הקליטה
 * ========================================================= */
console.log("\nהקליטה - מחפשים בתוך הערוץ, אחרי שהוכרע");

test("השליפה היא לפי טלפון + ערוץ", () => {
  assert.ok(
    intake.includes("phoneChannel(phone, leadChannel)"),
    "הקליטה עדיין מחפשת ליד לפי טלפון בלבד - זה הבאג של אברהם"
  );
});

test("אין בקליטה שום שליפת ליד לפי טלפון בלבד", () => {
  assert.ok(
    !/lead\s*\n?\s*\.?findUnique\(\{\s*where:\s*\{\s*phone\s*\}/.test(intake),
    "נשארה שליפה לפי טלפון בלבד"
  );
});

test("הערוץ מוכרע לפני השליפה, לא אחריה", () => {
  const decided = intake.indexOf("const leadChannel = channelKey(");
  const looked = intake.indexOf("phoneChannel(phone, leadChannel)");

  assert.ok(decided > -1, "הערוץ לא נקבע בכלל");
  assert.ok(looked > -1, "אין שליפה לפי ערוץ");
  assert.ok(
    decided < looked,
    "מחפשים ליד לפני שידוע לאיזה ערוץ הכניסה שייכת"
  );
});

test("ליד חדש נולד עם הערוץ חתום עליו", () => {
  assert.ok(
    intake.includes("channel: leadChannel"),
    "ליד חדש נולד בלי ערוץ, ולכן ייפול לברירת המחדל גם כשהוא של המכירה"
  );
});

test("אין יותר דריסת סטטוס לפי בעלות", () => {
  assert.ok(
    !intake.includes("isSaleNow ? existing.status"),
    "חזר התנאי שחוסם עדכון סטטוס"
  );
});

/* ============================================================
 *  3. הרשימות
 * ========================================================= */
console.log("\nהרשימות - כל צד שואל על הערוץ שלו");

test("הרשימה שלך מוגבלת לערוץ שלך", () => {
  assert.equal((MY_LEADS_WHERE as Record<string, unknown>).channel, MINE_CHANNEL);
});

test("רשימת המכירה היא בדיוק המשלים", () => {
  assert.equal(
    (SALE_LEADS_WHERE as Record<string, unknown>).channel,
    SALE_CHANNEL
  );
});

test("'כולל מכירה' מסיר את ההגבלה ולא מוסיף תנאי", () => {
  assert.equal(
    (leadsWhere(true) as Record<string, unknown>).channel,
    undefined
  );
  assert.equal(
    (leadsWhere(false) as Record<string, unknown>).channel,
    MINE_CHANNEL
  );
});

test("תנאי החיפוש נושא תמיד גם טלפון וגם ערוץ", () => {
  assert.deepEqual(phoneChannel("0501234567", MINE_CHANNEL), {
    phone: "0501234567",
    channel: "mine",
  });
  assert.equal(mineKey("0501234567").channel, "mine");
  assert.equal(saleKey("0501234567").channel, "sale");
});

test("אין יותר אף findUnique לפי טלפון+ערוץ", () => {
  /**
   * פריזמה לא יודעת שהצמד ייחודי, ולכן `findUnique` עליו
   * הוא שגיאת טיפוסים שתפיל את הבנייה.
   */
  for (const file of [
    "../app/api/webhooks/leadmanager/route.ts",
    "../app/api/webhooks/texter/route.ts",
    "../app/api/leads/route.ts",
    "../app/api/import-leads/route.ts",
    "../lib/facebook-gap.ts",
    "../lib/broadcast-lead.ts",
    "../lib/move-channel.ts",
    "../lib/lead-by-phone.ts",
  ]) {
    const src = read(file);
    assert.ok(
      !/findUnique\(\{\s*where:\s*(phoneChannel|mineKey|saleKey)/.test(src),
      `${file} עדיין קורא findUnique על צמד שאינו מפתח של פריזמה`
    );
    assert.ok(
      !src.includes("phone_channel"),
      `${file} עדיין משתמש במפתח המורכב שפריזמה כבר לא מכירה`
    );
  }
});

test("channelKey מתרגם נכון לשני הכיוונים", () => {
  assert.equal(channelKey(true), SALE_CHANNEL);
  assert.equal(channelKey(false), MINE_CHANNEL);
});

/* ============================================================
 *  4. "אותה הגשה" כבר לא בולעת הגעה אמיתית
 * ========================================================= */
console.log("\nאותה הגשה - רק כשזו באמת אותה הגשה");

const now = new Date("2026-11-13T10:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

test("אותו מזהה הגשה = אותה הגשה, תמיד", () => {
  assert.equal(
    isSameSubmission({
      incomingFbId: "abc",
      knownFbId: "abc",
      channel: "mine",
      entries: [],
      now,
    }),
    true
  );
});

test("אותה הגשה משתי דלתות שונות - לא נספרת פעמיים", () => {
  assert.equal(
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      via: "facebook",
      entries: [{ isSale: false, at: minutesAgo(1), via: "leadmanager" }],
      now,
    }),
    true
  );
});

test("**אותה דלת פעמיים = שתי הגעות אמיתיות**", () => {
  /**
   * זה הליד שנבלע בלי שאף אחד ידע: אדם שמילא באמת
   * פעמיים, או שתי מודעות שלך שנכנסו ברצף. קודם חלון
   * של עשר דקות בלע את השנייה.
   */
  assert.equal(
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      via: "leadmanager",
      entries: [{ isSale: false, at: minutesAgo(3), via: "leadmanager" }],
      now,
    }),
    false,
    "הגעה שנייה מאותה דלת נבלעה"
  );
});

test("מזהה הגשה שונה = הגעה חדשה", () => {
  assert.equal(
    isSameSubmission({
      incomingFbId: "new-id",
      knownFbId: "old-id",
      channel: "mine",
      via: "facebook",
      entries: [{ isSale: false, at: minutesAgo(60), via: "facebook" }],
      now,
    }),
    false
  );
});

test("כניסה של המכירה לא נחשבת לאותה הגשה אצלך", () => {
  assert.equal(
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      via: "leadmanager",
      entries: [{ isSale: true, at: minutesAgo(1), via: "leadmanager" }],
      now,
    }),
    false
  );
});

/* ============================================================
 *  5. העברה בין ערוצים - בלי ליפול על התנגשות
 * ========================================================= */
console.log("\nהעברה בין ערוצים");

const move = read("../lib/move-channel.ts");

test("ההעברה בודקת קודם אם המספר כבר קיים בצד השני", () => {
  assert.ok(
    move.includes("collision"),
    "העברה תיפול בשגיאת ייחודיות במקום לדווח"
  );
});

test("ההעברה כותבת ערוץ ו-origin יחד", () => {
  assert.ok(
    /data:\s*\{\s*channel:\s*target,\s*origin:\s*originForChannel\(target\)/.test(
      move
    ),
    "שדה אחד יישאר מאחור ויסתור את השני"
  );
});

test("אף מקום אחר לא כותב origin: sale ישירות", () => {
  /**
   * חמישה מקומות עשו את זה לבד. אחרי ההפרדה כתיבה כזו
   * משנה מפתח, ולכן היא חייבת לעבור דרך דלת אחת.
   */
  for (const file of [
    "../lib/transfer.ts",
    "../app/api/leads/route.ts",
    "../app/api/leads/bulk-move-sale/route.ts",
  ]) {
    const src = read(file);
    assert.ok(
      !/data:\s*\{\s*origin:\s*(SALE_ORIGIN|"sale")\s*\}/.test(src),
      `${file} עדיין כותב בעלות ישירות`
    );
  }
});

/* ============================================================
 *  6. המילוי החד־פעמי
 * ========================================================= */
console.log("\nמילוי הערוץ ללידים הוותיקים");

const fill = read("../lib/channel-fill.ts");

test("המילוי רץ מעצמו מהמנוע, בלי כפתור", () => {
  assert.ok(
    runner.includes("fillChannels()"),
    "המילוי לא רץ לבד - כל הלידים של המכירה יקפצו לרשימה שלך"
  );
});

test("המילוי מיישר את שני הכיוונים", () => {
  assert.ok(fill.includes("channel: SALE_CHANNEL"), "לא ממלא לכיוון המכירה");
  assert.ok(fill.includes("channel: MINE_CHANNEL"), "לא מיישר חזרה");
});

test("כישלון לא מסומן כהצלחה", () => {
  assert.ok(
    fill.includes("if (toSale && toMine)"),
    "התאריך נרשם גם כשהמילוי נכשל, והוא לא ינסה שוב"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
