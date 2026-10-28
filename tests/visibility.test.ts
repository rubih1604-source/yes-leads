import assert from "node:assert/strict";
import io from "node:fs";
import { explainVisibility, MY_LEADS_WHERE } from "../lib/channel";

/**
 * ============================================================
 *  נעילה על "למה הליד לא ברשימה"
 * ============================================================
 *
 *  שני דברים נבדקים כאן:
 *
 *  1. שההסבר **מסכים** עם הכלל האמיתי שהרשימה רצה לפיו.
 *     הסבר שאומר דבר אחד בזמן שהמסך עושה אחר גרוע יותר
 *     מאין הסבר בכלל - הוא שולח אותך לכיוון הלא נכון.
 *
 *  2. שכלי האבחון קורא את השדה הנכון במסד. הוא קרא
 *     payload במקום rawPayload, ולכן תמיד ענה "לא הגיעה
 *     שום בקשה" - וכל ליד חסר הפך לחקירה ידנית.
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

const mine = { isSale: false };
const sale = (channelName?: string) => ({ isSale: true, channelName });

/* ---------- ההסבר מסכים עם הכלל ---------- */

test("ליד עם כניסה שלך - ברשימה", () => {
  const v = explainVisibility({ origin: "leadmanager", entries: [mine] });
  assert.equal(v.inMyList, true);
});

test("ליד עם כניסה שלך וגם של אלעד - ברשימה", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [sale("לידים אלעד"), mine],
  });
  assert.equal(v.inMyList, true);
});

test("ליד שכל הכניסות שלו מכירה - לא ברשימה", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [sale("לידים אלעד")],
  });
  assert.equal(v.inMyList, false);
});

test("ליד בלי כניסות - ברשימה, כדי שלידים ותיקים לא ייעלמו", () => {
  const v = explainVisibility({ origin: "leadmanager", entries: [] });
  assert.equal(v.inMyList, true);
});

test("וואטסאפ בלבד - לא ליד", () => {
  const v = explainVisibility({ origin: "whatsapp", entries: [mine] });
  assert.equal(v.inMyList, false);
});

/* ---------- ההסבר באמת מסביר ---------- */

test("ההסבר נוקב בשם הערוץ שלקח את הליד", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [sale("לידים אלעד")],
  });
  assert.ok(
    v.reason.includes("לידים אלעד"),
    `ההסבר לא אומר מי לקח אותו: ${v.reason}`
  );
});

test("בלי שם ערוץ - נופל לשם הקמפיין", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [{ isSale: true, campaign: "קמפיין ממירים" }],
  });
  assert.ok(v.reason.includes("קמפיין ממירים"));
});

test("שני ערוצים - שניהם מוזכרים, בלי כפילות", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [sale("אלעד א"), sale("אלעד ב"), sale("אלעד א")],
  });
  assert.ok(v.reason.includes("אלעד א"));
  assert.ok(v.reason.includes("אלעד ב"));
  assert.equal(v.reason.split("אלעד א").length - 1, 1, "השם הופיע פעמיים");
});

test("ההסבר אומר מה לעשות ולא רק מה קרה", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [sale("לידים אלעד")],
  });
  assert.ok(v.reason.includes("ערוצים"), "חסרה ההנחיה לאן ללכת");
});

/* ---------- ההסבר לא יכול להתפצל מהכלל ---------- */

test("הכלל ברשימה הוא 'יש כניסה שלך או אין כניסות'", () => {
  const rule = JSON.stringify(MY_LEADS_WHERE);
  assert.ok(rule.includes('"isSale":false'), "הכלל השתנה - ההסבר חייב להשתנות איתו");
  assert.ok(rule.includes('"none":{}'), "נעלם הענף של לידים ותיקים");
  assert.ok(
    rule.includes('"origin":{"not":"whatsapp"}'),
    "נעלם התנאי של וואטסאפ"
  );
});

test("הכלל לא חזר לגרסה שבלעה לידים", () => {
  const rule = JSON.stringify(MY_LEADS_WHERE);
  assert.ok(
    !rule.includes('"none":{"isSale":true}'),
    "חזר הכלל שהעלים ליד לנצח אחרי כניסת מכירה אחת"
  );
});

/* ---------- כלי האבחון ---------- */

const traceRaw = io.readFileSync("app/api/diagnostics/trace/route.ts", "utf8");

/**
 * ההערות מוסרות לפני הבדיקה.
 *
 * ההערה שמתעדת את הבאג מכילה את הטקסט "log.payload", והיא
 * הפילה את הבדיקה. בדיקה שנופלת על תיעוד של באג מלמדת
 * למחוק תיעוד - וזה בדיוק הפוך ממה שצריך.
 */
const trace = traceRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("האבחון קורא את השדה הנכון במסד", () => {
  assert.ok(
    !/log\.payload\b/.test(trace),
    "חזר השדה payload - החיפוש יחזיר ריק תמיד"
  );
  assert.ok(trace.includes("log.rawPayload"));
});

test("האבחון עונה על 'למה הוא לא ברשימה'", () => {
  assert.ok(trace.includes("explainVisibility"));
  assert.ok(trace.includes("ברשימה_שלך"));
});

test("האבחון שולף את שם הערוץ, אחרת אין מה להציג", () => {
  assert.ok(trace.includes("channelRef"));
});

test("האבחון לא משכפל את הכלל אלא מייבא אותו", () => {
  assert.ok(
    trace.includes('from "@/lib/channel"'),
    "הכלל שוכפל לתוך האבחון ויתפצל ממנו"
  );
});


/* ---------- הרשימה השחורה: הוספה ידנית וסריקת היסטוריה ---------- */

const blacklistRoute = io.readFileSync(
  "app/api/blacklist/[id]/route.ts",
  "utf8"
);

test("יש הוספה ידנית ויש הוצאה ידנית", () => {
  assert.ok(blacklistRoute.includes("export async function POST"));
  assert.ok(blacklistRoute.includes("export async function DELETE"));
});

test("שתיהן עוברות דרך המקום האחד ולא כותבות למסד בעצמן", () => {
  assert.ok(blacklistRoute.includes("addToBlacklist"));
  assert.ok(blacklistRoute.includes("removeFromBlacklist"));
  assert.ok(
    !/db\.lead\.update/.test(blacklistRoute),
    "הנתיב כותב ישירות למסד ועוקף את המקום האחד"
  );
});

test("שתי הפעולות דורשות התחברות", () => {
  const logins = blacklistRoute.match(/isLoggedIn\(\)/g) ?? [];
  assert.equal(logins.length, 2, "אחת הפעולות פתוחה לכל מי שיודע את הכתובת");
});

const scan = io.readFileSync(
  "app/api/maintenance/scan-unsubscribes/route.ts",
  "utf8"
);

test("סריקת ההיסטוריה משתמשת באותו זיהוי של הקליטה", () => {
  assert.ok(
    scan.includes("detectUnsubscribe"),
    "הסריקה מממשת זיהוי משלה - שני כללים שיתפצלו"
  );
  assert.ok(scan.includes("addToBlacklist"));
});

test("לסריקה יש תצוגה מקדימה שלא משנה כלום", () => {
  assert.ok(scan.includes("export async function GET"));
  const get = scan.slice(scan.indexOf("export async function GET"), scan.indexOf("export async function POST"));
  assert.ok(
    !get.includes("addToBlacklist"),
    "התצוגה המקדימה משנה נתונים"
  );
});

test("הסריקה עוברת רק על הודעות נכנסות", () => {
  assert.ok(scan.includes('direction: "in"'));
});

test("הסריקה מדלגת על מי שכבר ברשימה", () => {
  assert.ok(scan.includes("lead.doNotContact"));
});

const card = io.readFileSync("components/LeadCardActions.tsx", "utf8");

test("יש כפתור הסרה מדיוור בכרטיס הליד", () => {
  assert.ok(card.includes("הסר מדיוור"));
});

test("הכפתור מבקש אישור לפני שהוא מוסיף", () => {
  assert.ok(card.includes("blacklistAsk"));
  const ask = card.indexOf("setBlacklistAsk(true)");
  const act = card.indexOf("blacklistNow");
  assert.ok(ask > -1 && act > -1);
});

test("הכפתור לא מוצג למי שכבר ברשימה", () => {
  assert.ok(card.includes("{!doNotContact && ("));
});

console.log(`✓ visibility: ${passed} בדיקות עברו`);
