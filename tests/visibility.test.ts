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

test("ליד שלך - ברשימה", () => {
  const v = explainVisibility({ origin: "leadmanager", entries: [mine] });
  assert.equal(v.inMyList, true);
});

test("ליד שהועבר לאלעד - לא ברשימה", () => {
  const v = explainVisibility({
    origin: "sale",
    entries: [mine, sale("לידים אלעד")],
  });
  assert.equal(v.inMyList, false, "ליד שהועבר לאלעד חזר להופיע אצלך");
});

test("כניסת מכירה בהיסטוריה לא מוציאה ליד שהבעלות שלו שלך", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [sale("לידים אלעד"), mine],
  });
  assert.equal(v.inMyList, true, "חזר הבאג שבלע לידים לנצח");
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
    origin: "sale",
    entries: [sale("לידים אלעד")],
  });
  assert.ok(
    v.reason.includes("לידים אלעד"),
    `ההסבר לא אומר מי לקח אותו: ${v.reason}`
  );
});

test("ההסבר מזכיר שהגעה חדשה תחזיר אותו", () => {
  const v = explainVisibility({
    origin: "sale",
    entries: [sale("לידים אלעד")],
  });
  assert.ok(v.reason.includes("תחזיר"), `חסר מה יקרה הלאה: ${v.reason}`);
});

test("ליד שלך עם היסטוריית מכירה - ההסבר אומר ששניהם נכונים", () => {
  const v = explainVisibility({
    origin: "leadmanager",
    entries: [sale("לידים אלעד"), mine],
  });
  assert.ok(v.reason.includes("נספרות"), `חסר ההסבר על ההיסטוריה: ${v.reason}`);
});

test("שני ערוצים - שניהם מוזכרים, בלי כפילות", () => {
  const v = explainVisibility({
    origin: "sale",
    entries: [sale("אלעד א"), sale("אלעד ב"), sale("אלעד א")],
  });
  assert.ok(v.reason.includes("אלעד א"));
  assert.ok(v.reason.includes("אלעד ב"));
  assert.equal(v.reason.split("אלעד א").length - 1, 1, "השם הופיע פעמיים");
});

/* ---------- ההסבר לא יכול להתפצל מהכלל ---------- */

test("הכלל מסנן לפי הבעלות הנוכחית ולא לפי היסטוריה", () => {
  const rule = JSON.stringify(MY_LEADS_WHERE);
  assert.ok(rule.includes("whatsapp"), "נעלם התנאי של וואטסאפ");
  assert.ok(rule.includes('"sale"'), "ליד שהועבר לאלעד יחזור לרשימה שלך");
  assert.ok(
    !rule.includes("entries"),
    "הסינון חזר לשאול על היסטוריית הכניסות"
  );
});

test("שתי הגרסאות שנכשלו לא יכולות לחזור", () => {
  const rule = JSON.stringify(MY_LEADS_WHERE);
  assert.ok(
    !rule.includes('"none":{"isSale":true}'),
    "חזר הכלל שהעלים ליד לנצח אחרי כניסת מכירה אחת"
  );
  assert.ok(
    !rule.includes('"some":{"isSale":false}'),
    "חזר הכלל שהחזיר לרשימה את מי שהועבר לאלעד"
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


/* ---------- מצב "רק דיוור" ---------- */

const botFile = io.readFileSync("lib/bot.ts", "utf8");
const gateFile = io.readFileSync("lib/bot-gate.ts", "utf8");
const settingsApi = io.readFileSync("app/api/settings/route.ts", "utf8");

test("יש מצב שבו הבוט עוצר לפני הסיווג", () => {
  assert.ok(botFile.includes('settings.botMode === "broadcast"'));
});

test("העצירה היא לפני הסיווג, אחרת הוא עדיין יענה", () => {
  const stop = botFile.indexOf('settings.botMode === "broadcast"');
  const classify = botFile.indexOf("await classifyMessage(");
  assert.ok(stop > -1 && classify > -1);
  assert.ok(stop < classify, "הבוט מסווג לפני שהוא עוצר - כלומר עדיין עונה");
});

test("בקשת הסרה נרשמת לפני העצירה, בכל מצב", () => {
  const detect = botFile.indexOf("detectUnsubscribe(params.text)");
  const stop = botFile.indexOf('settings.botMode === "broadcast"');
  assert.ok(detect < stop, "במצב רק-דיוור בקשות הסרה לא היו נרשמות");
});

test("שאלת הסינון נשאלת לפני העצירה", () => {
  const ask = botFile.indexOf("SUPPLIER_QUESTION");
  const stop = botFile.indexOf('settings.botMode === "broadcast"');
  assert.ok(ask > -1 && ask < stop, "במצב רק-דיוור השאלה לא הייתה נשלחת");
});

test("מגבלת הסטטוסים לא חלה במצב רק-דיוור", () => {
  assert.ok(gateFile.includes('settings.botMode !== "broadcast"'));
  const guard = gateFile.indexOf('settings.botMode !== "broadcast"');
  const check = gateFile.indexOf("settings.botStatuses.includes");
  assert.ok(guard < check, "מגבלת הסטטוסים תחסום את שאלת הסינון");
});

test("שאר תנאי השער עדיין חלים", () => {
  assert.ok(gateFile.includes("settings.botEnabled"), "אפשר לכבות את הבוט");
  assert.ok(gateFile.includes("lead.botMuted"), "אפשר להשתיק מול לקוח");
  assert.ok(gateFile.includes('lead.origin === "sale"'), "ליד של אלעד לא מדובר");
});

test("רק שני ערכים מתקבלים בשמירה", () => {
  assert.ok(settingsApi.includes('body.botMode === "all"'));
  assert.ok(settingsApi.includes('body.botMode === "broadcast"'));
});

test("יש מתג במסך ההגדרות", () => {
  const ui = io.readFileSync("components/BotSettings.tsx", "utf8");
  assert.ok(ui.includes("botMode"));
  assert.ok(ui.includes("רק על תגובות לדיוור"));
});


/* ---------- "למה הבוט לא שאל" ---------- */

const botCheck = io.readFileSync(
  "app/api/diagnostics/bot-check/route.ts",
  "utf8"
);

test("האבחון מריץ את אותו שער שהבוט מריץ", () => {
  assert.ok(
    botCheck.includes("shouldBotReply"),
    "האבחון בודק תנאים משלו - יענה אחרת מהבוט"
  );
});

test("האבחון בודק זיהוי דיוור באותה פונקציה", () => {
  assert.ok(botCheck.includes("isBroadcastMessage"));
  assert.ok(botCheck.includes("replyAfterBroadcast"));
});

test("האבחון לא משנה כלום", () => {
  assert.ok(!/db\.\w+\.(update|create|delete)/.test(botCheck));
  assert.ok(!botCheck.includes("export async function POST"));
});

test("האבחון מחזיר מסקנה אחת ולא רשימת נתונים", () => {
  assert.ok(botCheck.includes("מסקנה"));
});

const mark = io.readFileSync(
  "app/api/maintenance/mark-broadcasts/route.ts",
  "utf8"
);

test("הסימון לאחור דורש בחירת תבנית מפורשת", () => {
  assert.ok(
    mark.includes('return NextResponse.json(\n      { error: "צריך לבחור תבנית'),
    "אפשר להריץ בלי תבנית ולסמן הכל"
  );
});

test("הסימון נוגע רק בהודעות יוצאות שעוד לא מסומנות", () => {
  assert.ok(mark.includes('direction: "out"'));
  assert.ok(mark.includes("broadcast: false"));
});

test("לסימון יש תצוגה מקדימה שלא משנה כלום", () => {
  const get = mark.slice(
    mark.indexOf("export async function GET"),
    mark.indexOf("export async function POST")
  );
  assert.ok(!get.includes("updateMany"), "התצוגה המקדימה משנה נתונים");
});

console.log(`✓ visibility: ${passed} בדיקות עברו`);
