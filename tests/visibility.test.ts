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


/* ---------- בוט אחד, בלי מצבים ---------- */

const botFile = io.readFileSync("lib/campaign-bot.ts", "utf8");
const settingsApi = io.readFileSync("app/api/settings/route.ts", "utf8");

/**
 * ============================================================
 *  מה נבדק כאן קודם, ולמה זה הוחלף
 * ============================================================
 *
 *  כל הבדיקות בחלק הזה שמרו על המצב "רק דיוור" מול "כל
 *  הודעה": שהעצירה קודמת לסיווג, שמגבלת הסטטוסים לא חלה,
 *  שהשער עדיין חוסם. כולן תיארו נכון את הבוט הקודם -
 *  והבוט הקודם נמחק, יחד עם השער, הסיווג והמצבים.
 *
 *  מה ששומרים עליו עכשיו הוא מה שיש: מתג אחד, בלי מצב
 *  שני שאפשר להיתקע בו.
 */

test("בקשת הסרה נרשמת לפני כל חסימה", () => {
  const detect = botFile.indexOf("detectUnsubscribe(params.text)");
  const quiet = botFile.indexOf("hours < QUIET_HOURS");
  assert.ok(detect > -1 && quiet > -1);
  assert.ok(detect < quiet, "מי שבתוך השקט יבקש הסרה ולא ייחסם");
});

test("שאלת הסינון יוצאת מהבוט", () => {
  assert.ok(botFile.includes("SUPPLIER_QUESTION"));
});

test("אין מצבים ואין מגבלת סטטוסים", () => {
  for (const gone of ["botMode", "botStatuses", "withinBotHours", "scope"]) {
    assert.ok(!botFile.includes(gone), `חזר מנגנון המצבים: ${gone}`);
  }
});

test("יש מתג אחד במסך ההגדרות, והוא נשמר", () => {
  const ui = io.readFileSync("components/BotSettings.tsx", "utf8");
  assert.ok(ui.includes("campaignBot"), "אין מתג במסך");
  assert.ok(settingsApi.includes("campaignBot"), "אי אפשר לשמור את המתג");

  /**
   * המסך לא מציג כפתורים שאינם מחוברים לכלום. כל אלה
   * היו חסימות אמיתיות בבוט הקודם, ואחרי שהוא נמחק הם
   * נשארו ככפתורים שמבטיחים שליטה שלא קיימת.
   */
  for (const dead of [
    "botMode",
    "botStatuses",
    "botFromHour",
    "replyCooldownMinutes",
    "liveChatMinutes",
    "botPauseHours",
  ]) {
    assert.ok(!ui.includes(dead), `נשאר כפתור שלא עושה כלום: ${dead}`);
  }
});


/* ---------- "למה הבוט לא שאל" ---------- */

const botCheck = io.readFileSync(
  "app/api/diagnostics/bot-check/route.ts",
  "utf8"
);

test("האבחון בודק את אותם שלושה תנאים שהבוט בודק", () => {
  /**
   * **זו הבדיקה שהצילה את עצמה.** האבחון הקודם הריץ את
   * השער שנמחק; אבחון שמדווח על חסימה שלא קיימת גרוע
   * יותר מאין אבחון.
   */
  assert.ok(botCheck.includes("settings.campaignBot"), "המתג לא נבדק");
  assert.ok(botCheck.includes("doNotContact"), "הרשימה השחורה לא נבדקת");
  assert.ok(botCheck.includes("QUIET_HOURS"), "השקט לא נבדק");
  assert.ok(
    !botCheck.includes("shouldBotReply"),
    "האבחון מריץ את השער שנמחק"
  );
});

test("האבחון מראה מה הבוט באמת עשה", () => {
  /**
   * במקום להסיק מהתנאים, האבחון מציג את ההחלטה של הבוט
   * עצמו על כל הודעה. זה מה שהיה חסר כשהכל נראה תקין
   * ושום דבר לא יצא.
   */
  assert.ok(botCheck.includes('"campaign_bot"'), "לא נקראות ההחלטות של הבוט");
  assert.ok(botCheck.includes("מה_הבוט_עשה"), "ההחלטות לא מוחזרות");

  const screen = io.readFileSync("components/DiagnosticsScreen.tsx", "utf8");
  assert.ok(screen.includes("מה_הבוט_עשה"), "ההחלטות לא מוצגות במסך");
  /**
   * זיהוי התגובה לדיוור עבר כולו ל-decideInbound, שקורא
   * ל-replyAfterBroadcast בעצמו. האבחון שקרא לשתיהן החזיק
   * שני מנגנונים לאותה שאלה - ובדיוק לכן הטבלה הציגה
   * "ענה אחרי דיוור: לא" לצד "דאטה שנטענה - הבוט שואל".
   */
  assert.ok(
    botCheck.includes("readSupplierAnswer"),
    "האבחון לא קורא את התשובה באותה פונקציה שהבוט קורא בה"
  );
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


/* ---------- המסכים באמת קיימים ---------- */

test("לכל נתיב אבחון יש מסך שמגיעים אליו", () => {
  assert.ok(io.existsSync("app/diagnostics/page.tsx"), "אין מסך אבחון");
});

test("האבחון מופיע בתפריט", () => {
  const more = io.readFileSync("app/more/page.tsx", "utf8");
  assert.ok(more.includes('href: "/diagnostics"'), "אי אפשר להגיע לאבחון");
});

test("המסך קורא לשני הנתיבים", () => {
  const screen = io.readFileSync("components/DiagnosticsScreen.tsx", "utf8");
  assert.ok(screen.includes("/api/diagnostics/trace"));
  assert.ok(screen.includes("/api/diagnostics/bot-check"));
});

test("כל מסך שהוספנו מופיע בתפריט - אחרת הוא לא קיים בפועל", () => {
  const more = io.readFileSync("app/more/page.tsx", "utf8");

  for (const route of ["/blacklist", "/broadcast-replies", "/transfers", "/diagnostics"]) {
    assert.ok(
      more.includes(`href: "${route}"`),
      `${route} נבנה אבל אי אפשר להגיע אליו מהתפריט`
    );
    assert.ok(
      io.existsSync(`app${route}/page.tsx`),
      `${route} בתפריט אבל אין לו מסך`
    );
  }
});


/* ---------- נמען דיוור נרשם במערכת ---------- */

const sendRoute = io.readFileSync(
  "app/api/broadcast/[id]/send/route.ts",
  "utf8"
);

test("הדיוור יוצר רשומה לנמען שאינו קיים", () => {
  assert.ok(
    sendRoute.includes("ensureLeadForContact"),
    "הדיוור עדיין מחפש ליד קיים בלבד - הודעות לנמענים מקובץ לא נרשמות"
  );
  assert.ok(
    !sendRoute.includes("db.lead\n      .findFirst"),
    "נשאר החיפוש הישן שדילג על נמענים שאינם לידים"
  );
});

test("ההודעה היוצאת נרשמת על הנמען", () => {
  const ensure = sendRoute.indexOf("ensureLeadForContact");
  const message = sendRoute.indexOf("db.message");
  assert.ok(ensure > -1 && message > -1);
  assert.ok(ensure < message, "ההודעה נרשמת לפני שהנמען קיים");
});

const ensureFile = io.readFileSync("lib/broadcast-lead.ts", "utf8");

test("נמען דיוור לא נכנס לרשימת הלידים", () => {
  assert.ok(ensureFile.includes("BROADCAST_ORIGIN"));

  const rule = JSON.stringify(MY_LEADS_WHERE);
  assert.ok(
    rule.includes("broadcast"),
    "נמעני דיוור יציפו את רשימת הלידים שלך"
  );
});

test("ליד קיים לא מאבד את הבעלות שלו בגלל דיוור", () => {
  assert.ok(
    ensureFile.includes("return existing.id"),
    "ליד קיים נדרס כנמען דיוור"
  );
  const existing = ensureFile.indexOf("if (existing)");
  const create = ensureFile.indexOf("db.lead\n    .create");
  assert.ok(existing > -1 && existing < create, "יצירה קודמת לבדיקת קיום");
});

test("טלפון לא תקין לא יוצר רשומה", () => {
  assert.ok(ensureFile.includes("if (!phone) return null"));
});

test("ההסבר באבחון יודע להסביר נמען דיוור", () => {
  const v = explainVisibility({ origin: "broadcast", entries: [] });
  assert.equal(v.inMyList, false);
  assert.ok(v.reason.includes("דאטה"), `ההסבר לא מכוון אותו: ${v.reason}`);
});


/* ---------- המסך מציג את מה שהאבחון בודק ---------- */

test("כל שדה שהאבחון מחזיר מופיע גם בטבלה במסך", () => {
  const api = io.readFileSync(
    "app/api/diagnostics/bot-check/route.ts",
    "utf8"
  );
  const screen = io.readFileSync("components/DiagnosticsScreen.tsx", "utf8");

  /**
   * ============================================================
   *  הרשימה נגזרת מהקוד, ולא נכתבת ביד
   * ============================================================
   *
   *  שדה שנוסף לנתונים ולא לטבלה פשוט לא נראה - וזה בדיוק
   *  מה שקרה: הוספתי "ברשימת דיוור שנשלחה" לאבחון, והמסך
   *  המשיך להציג את הרשימה הישנה.
   *
   *  **ורשימה שנכתבת ביד מתיישנת.** כשהאבחון נכתב מחדש,
   *  הבדיקה הזו נפלה על שדות שכבר לא קיימים - כלומר היא
   *  שמרה על העבר במקום על ההווה. עכשיו היא קוראת את
   *  השדות מהקוד עצמו, ולכן היא לא יכולה להתיישן.
   */
  const returned = api.slice(api.indexOf("return NextResponse.json({"));

  const fields = Array.from(
    new Set(
      (returned.match(/^\s{4}([\u0590-\u05FF][\u0590-\u05FF_]*):/gm) ?? []).map(
        (m) => m.trim().replace(":", "")
      )
    )
  );

  assert.ok(fields.length >= 5, `נמצאו רק ${fields.length} שדות - הגזירה לא עובדת`);

  for (const field of fields) {
    assert.ok(screen.includes(field), `${field} מוחזר מהאבחון אבל לא מוצג במסך`);
  }
});


/* ---------- המסקנה לא סותרת את הרשימה שנטענה ---------- */

test("האבחון לא מכריז 'הכל תקין' כשהמתג כבוי", () => {
  const api = io.readFileSync(
    "app/api/diagnostics/bot-check/route.ts",
    "utf8"
  );

  /**
   * **הסיבה שהחליפה את כל הקודמות.** האבחון הקודם מדד
   * "האם הדיוור הגיע אליו", "האם זו תגובה לדיוור" ועוד -
   * כללים שנמחקו. עכשיו הסיבה הראשונה והנפוצה ביותר
   * לשתיקה היא פשוטה: המתג כבוי. היא חייבת להופיע
   * **לפני** כל מסקנה אחרת, אחרת האבחון יחפש תקלה
   * במקום שאין בה תקלה.
   */
  const switchOff = api.indexOf("!settings.campaignBot");
  const allGood = api.indexOf("כל התנאים מתקיימים");

  assert.ok(switchOff > -1, "המתג לא נבדק במסקנה");
  assert.ok(allGood > -1, "אין מסקנה חיובית");
  assert.ok(switchOff < allGood, "האבחון יאמר 'הכל תקין' כשהמתג כבוי");
});

/* ---------- מסך ההתעניינות רואה את מי שהבוט רואה ---------- */

test("מסך ההתעניינות מריץ את ההכרעה המרכזית", () => {
  /**
   * **מה שנשבר בשקט.** אדם מרשימת דאטה אינו ליד עד
   * שהוא עונה, ולכן אין עליו רישום הודעה יוצאת. המסך
   * חיפש רק לפי הודעות רשומות - ולכן הלידים הכי חמים
   * שיש, אלה שענו לדיוור, לא הופיעו בו בכלל.
   */
  const page = io.readFileSync("app/broadcast-replies/page.tsx", "utf8");

  assert.ok(
    page.includes("decideInbound"),
    "המסך מחליט לבד במקום להריץ את ההכרעה שהבוט מריץ"
  );
  assert.ok(
    page.includes("lastListSendForMany"),
    "המסך לא בודק את הרשימה שנטענה - יפספס את מי שאין עליו הודעה יוצאת"
  );
  assert.ok(
    !page.includes("replyAfterBroadcast("),
    "נשאר זיהוי מקביל להכרעה המרכזית"
  );
  assert.ok(
    page.includes("origin: true"),
    "הבעלות לא נטענת, וההכרעה תרוץ על נתון חסר"
  );
});

test("הבדיקה של הרשימה נעשית בשאילתה אחת ולא פר ליד", () => {
  /**
   * שאילתה לכל ליד על אלף לידים הופכת את המסך לבלתי
   * שמיש - וזו בדיוק הסיבה שהבדיקה הזו לא הייתה שם
   * מלכתחילה.
   */
  const page = io.readFileSync("app/broadcast-replies/page.tsx", "utf8");
  assert.ok(
    !page.includes("lastListSendFor("),
    "קריאה פר ליד - המסך ייתקע"
  );
});

/* ---------- המסך לא סותר את ההתנהגות ---------- */

test("המסך אומר בדיוק מה המתג עושה", () => {
  /**
   * **מה שנתפס בשטח, ומה שהוסר.** המסך הציג אזהרה "לא
   * בחרת סטטוסים, ולכן הוא לא עונה לאף אחד" - גם במצב
   * שבו מגבלת הסטטוסים לא חלה בכלל. כלומר הוא אמר
   * שהבוט מושבת בדיוק כשהוא עבד, ושלח לשנות הגדרות
   * באמצע דיוור חי.
   *
   * המצבים והסטטוסים נמחקו, ואיתם האזהרה. מה שנשאר
   * חייב לומר את האמת על שני המצבים של המתג.
   */
  const screen = io.readFileSync("components/BotSettings.tsx", "utf8");

  assert.ok(
    screen.includes("כל מי שכותב מקבל תשובה"),
    "המסך לא אומר מה קורה כשהמתג דלוק"
  );
  assert.ok(
    screen.includes("שום דבר לא נשלח ללקוח אוטומטית"),
    "המסך לא אומר מה קורה כשהמתג כבוי"
  );
  assert.ok(
    screen.includes("24 שעות"),
    "המסך לא מזכיר את השקט של 24 שעות"
  );
});

/* ---------- כשל של הבוט לא נבלע ---------- */

test("כשל של הבוט משאיר עקבות", () => {
  /**
   * **הנקודה העיוורת הגדולה ביותר.** כאן ישב catch
   * ריק: הבוט נפל, הלקוח לא קיבל כלום, ולא נשאר שום
   * סימן. האבחון אמר "כל התנאים מתקיימים" ולא היה שום
   * דבר לאחוז בו.
   */
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  assert.ok(
    !/catch\s*\{\s*\n\s*\/\/[^\n]*\n\s*\}/.test(hook),
    "נשאר catch שבולע שגיאה בלי לרשום כלום"
  );
  assert.ok(hook.includes('type: "bot_failed"'), "הכשל לא נרשם על הליד");
  assert.ok(hook.includes("הבוט קרס"), "לא נפתחת התראה על כשל");
});

test("ההודעה נשמרת גם כשהבוט קורס", () => {
  /** הטיפול בכשל חייב לבוא אחרי שההודעה כבר נשמרה */
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");
  /** ההשוואה לקריאה עצמה, לא לשורת הייבוא בראש הקובץ */
  assert.ok(
    hook.indexOf('direction: "in"') < hook.indexOf("handleCampaignReply"),
    "הבוט רץ לפני שההודעה נשמרה"
  );
});

test("האבחון מצביע על הקריסה במקום לומר שהכל תקין", () => {
  const api = io.readFileSync(
    "app/api/diagnostics/bot-check/route.ts",
    "utf8"
  );
  const screen = io.readFileSync("components/DiagnosticsScreen.tsx", "utf8");

  assert.ok(api.includes('"bot_failed"'), "האבחון לא בודק קריסה");
  assert.ok(api.includes("הבוט_קרס"), "הקריסה לא מוחזרת");
  assert.ok(screen.includes("הבוט_קרס"), "הקריסה לא מוצגת במסך");

  /** והמסקנה מצביעה עליה לפני כל סיבה אחרת */
  assert.ok(
    api.indexOf("if (crashedNow)") <
      api.indexOf("} else if (!settings.campaignBot)"),
    "המסקנה בודקת קריסה אחרי סיבות אחרות"
  );
});

test("קריסה ישנה לא נחשבת תשובה להודעה חדשה", () => {
  /**
   * **תקלה באבחון עצמו.** הוא הציג את הקריסה האחרונה
   * שהייתה אי פעם. אחרי שהכשל תוקן, האבחון המשיך
   * להכריז "הבוט קרס" לנצח, ולא היה אפשר לדעת אם
   * התיקון עבד.
   */
  const api = io.readFileSync(
    "app/api/diagnostics/bot-check/route.ts",
    "utf8"
  );

  assert.ok(api.includes("crashedNow"), "הקריסה לא נבדקת מול זמן ההודעה");
  assert.ok(
    api.includes("crashed.createdAt.getTime() >= lastInbound.createdAt.getTime()"),
    "אין השוואה בין זמן הקריסה לזמן ההודעה האחרונה"
  );
  assert.ok(
    api.includes("if (crashedNow)"),
    "המסקנה עדיין נשענת על קריסה ישנה"
  );
  assert.ok(
    api.includes("כתב_לנו"),
    "אי אפשר להשוות את הזמנים במסך"
  );
});

/* ---------- בריאות המערכת ---------- */

test("כשל של המנוע נרשם ולא נשאר בקונסול", () => {
  /**
   * **הנקודה העיוורת השנייה.** המנוע כתב שגיאות
   * לקונסול בלבד. כשהוא קרס בכל סבב, שום הודעה
   * מתוזמנת לא יצאה - לא הפולואפ אחרי 6 שעות ולא
   * "אין מענה" - ובמערכת לא היה שום סימן.
   */
  const inst = io.readFileSync("instrumentation.ts", "utf8");

  assert.ok(inst.includes("engineRanAt"), "הסבב לא נרשם");
  assert.ok(inst.includes("engineError"), "הכשל לא נרשם");
  assert.ok(
    inst.indexOf("catch (err)") < inst.indexOf("engineRanAt"),
    "הרישום נעשה רק כשהסבב מצליח"
  );
});

test("מסך הבריאות עונה על השאלות שחשובות", () => {
  const api = io.readFileSync("app/api/health/system/route.ts", "utf8");

  for (const check of [
    "engineRanAt",
    "state: \"pending\", runAt",
    "bot_failed",
    "leadEntry",
  ]) {
    assert.ok(api.includes(check), `המסך לא בודק ${check}`);
  }

  /** קוראת בלבד - מסך אבחון לא משנה נתונים */
  assert.ok(
    !/db\.\w+\.(update|create|delete|updateMany)/.test(api),
    "מסך הבריאות משנה נתונים"
  );
});

test("מסך הבריאות מחובר לתפריט", () => {
  const more = io.readFileSync("app/more/page.tsx", "utf8");
  const nav = io.readFileSync("components/Nav.tsx", "utf8");
  assert.ok(more.includes("/health"), "אין דרך למסך");
  assert.ok(nav.includes("/health"));
});

console.log(`✓ visibility: ${passed} בדיקות עברו`);
