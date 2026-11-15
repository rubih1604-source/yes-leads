import assert from "node:assert/strict";
import io from "node:fs";
import {
  judgeSend,
  readDeliveryUpdate,
  statusLabel,
  reachedCustomer,
  SENT_TO_TEXTER,
  DELIVERED,
  FAILED,
  LEGACY_SENT,
} from "../lib/send-result";
import { mapInboundMessage } from "../lib/texter-mapping";

/**
 * ============================================================
 *  "המערכת מראה נשלח והלקוח לא קיבל"
 * ============================================================
 *
 *  **הבאג, במילים שלו.** "אני משנה סטטוס לנשלחה הצעת
 *  מחיר, זה מראה שההודעה נשלחה, אני נכנס לצ'אט והלקוח
 *  בכלל לא קיבל."
 *
 *  **הסיבה.** בחמישה מקומות בקוד ישבה אותה שורה:
 *
 *      status: result.ok ? "sent" : "failed"
 *
 *  ו-`ok` הוא קוד HTTP 200 מטקסטר - כלומר "קיבלתי את
 *  הבקשה". טקסטר מחזירה בגוף שדה `success`, ואף אחד לא
 *  קרא אותו: תשובה של 200 עם success: false נרשמה
 *  כהצלחה מלאה.
 *
 *  **והסכנה בתיקון.** קולט עדכוני המסירה שנוסף כאן רץ
 *  לפני הטיפול בהודעה נכנסת. אם הוא יזהה בטעות הודעה
 *  נכנסת כעדכון מסירה, **כל הודעה מלקוח תדולג** והבוט
 *  ימות. חצי מהקובץ הזה עוסק בדיוק בזה.
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

/* ============================================================
 *  ההכרעה על תשובת שליחה
 * ============================================================ */

test("200 עם success: false הוא כישלון", () => {
  /** **זה הבאג המדויק.** קודם זה נרשם כ"נשלח". */
  const v = judgeSend({
    ok: true,
    status: 200,
    raw: { success: false, error: "template is paused" },
  });

  assert.equal(v.state, "failed");
  assert.ok(v.reason?.includes("template is paused"), "הסיבה לא נשמרה");
});

test("200 עם success: true מתקבל - אבל לא נקרא 'נשלח ללקוח'", () => {
  const v = judgeSend({
    ok: true,
    status: 200,
    raw: { success: true, messageId: "abc" },
  });

  assert.equal(v.state, "accepted");
  assert.equal(v.reason, null);

  /**
   * ההבדל שמסביר את כל הבאג: accepted פירושו שטקסטר
   * לקחה את ההודעה, ולא שהיא הגיעה.
   */
  assert.equal(statusLabel(SENT_TO_TEXTER), "יצא לטקסטר");
  assert.equal(reachedCustomer(SENT_TO_TEXTER), false);
  assert.equal(reachedCustomer(DELIVERED), true);
});

test("200 עם גוף שהוא שגיאה הוא כישלון", () => {
  const v = judgeSend({
    ok: true,
    status: 200,
    raw: { error: { message: "recipient is not a WhatsApp user" } },
  });
  assert.equal(v.state, "failed");
  assert.ok(v.reason?.includes("WhatsApp user"));
});

test("200 ריק נחשב התקבל", () => {
  assert.equal(judgeSend({ ok: true, status: 200, raw: null }).state, "accepted");
  assert.equal(judgeSend({ ok: true, status: 200, raw: {} }).state, "accepted");
});

test("שגיאת HTTP היא כישלון, עם ההודעה של טקסטר", () => {
  const v = judgeSend({
    ok: false,
    status: 400,
    raw: { error: "missing template parameter" },
    error: "טקסטר החזיר שגיאה 400",
  });
  assert.equal(v.state, "failed");
  assert.ok(v.reason?.includes("400"));
  assert.ok(v.reason?.includes("missing template parameter"));
});

test("בספק - נכשל", () => {
  /**
   * הודעה שנרשמה ככשל ובעצם יצאה היא אי-נוחות. הודעה
   * שנרשמה כהצלחה ולא יצאה היא לקוח שמחכה לתשובה שלא
   * תגיע, ואתה לא יודע.
   */
  assert.equal(
    judgeSend({ ok: true, status: 200, raw: { errors: ["blocked"] } }).state,
    "failed"
  );
});

/* ============================================================
 *  המעקה: הודעה נכנסת לא נבלעת
 * ============================================================ */

/** המבנה האמיתי של הודעה נכנסת מטקסטר */
const INCOMING = {
  eventName: "newIncomingMessage",
  eventData: {
    chat: { id: "chat-1", channel: { name: "whatsapp", id: "972501234567" } },
    message: { id: "msg-1", text: "מה המחיר?", direction: "incoming" },
  },
};

test("הודעה נכנסת אינה עדכון מסירה", () => {
  /**
   * **הבדיקה שמגנה על כל הבוט.** אם זה יזוהה כעדכון
   * מסירה, הוובוק יחזיר תשובה ויצא - וכל הודעה מלקוח
   * תדולג בשקט.
   */
  assert.equal(readDeliveryUpdate(INCOMING), null);
});

test("ההודעה הנכנסת עדיין נקראת כרגיל", () => {
  const mapped = mapInboundMessage(INCOMING);
  assert.equal(mapped.text, "מה המחיר?");
  assert.equal(mapped.phone, "972501234567");
});

const NOT_DELIVERY = [
  ["הודעה נכנסת", INCOMING],
  ["הודעה יוצאת שלך", {
    eventName: "newOutgoingMessage",
    eventData: { message: { id: "m2", text: "שלום" } },
  }],
  ["אירוע עם status: received", {
    eventName: "newIncomingMessage",
    eventData: { message: { id: "m3", text: "היי", status: "received" } },
  }],
  ["אירוע בלי מזהה", { eventName: "messageStatus", eventData: { status: "delivered" } }],
  ["אירוע בלי מצב", { eventName: "messageStatus", eventData: { messageId: "m4" } }],
  ["אובייקט ריק", {}],
  ["טקסט", "hello"],
];

for (const [name, payload] of NOT_DELIVERY) {
  test(`לא עדכון מסירה: ${name}`, () => {
    assert.equal(
      readDeliveryUpdate(payload),
      null,
      "זוהה בטעות כעדכון מסירה - הודעות נכנסות יידלגו"
    );
  });
}

/* ============================================================
 *  עדכוני מסירה אמיתיים
 * ============================================================ */

test("אישור מסירה נקלט", () => {
  const update = readDeliveryUpdate({
    eventName: "messageStatusChanged",
    eventData: { messageId: "abc123", status: "delivered" },
  });

  assert.ok(update, "אישור מסירה לא נקלט");
  assert.equal(update!.messageId, "abc123");
  assert.equal(update!.status, DELIVERED);
});

test("נקרא נקלט", () => {
  const update = readDeliveryUpdate({
    eventName: "messageStatus",
    eventData: { message_id: "abc123", status: "read" },
  });
  assert.equal(update?.status, "read");
});

test("כישלון מסירה נקלט עם הסיבה", () => {
  const update = readDeliveryUpdate({
    eventName: "messageDeliveryStatus",
    eventData: {
      messageId: "abc123",
      status: "failed",
      error: { message: "re-engagement message outside 24h window" },
    },
  });

  assert.equal(update?.status, FAILED);
  assert.ok(update?.reason?.includes("24h"), "הסיבה אבדה");
});

/* ============================================================
 *  החיווט
 * ============================================================ */

const sites: Array<[string, string]> = [
  ["lib/runner.ts", "המנוע - זה ששולח את הפולואפ של נשלחה הצעת מחיר"],
  ["lib/campaign-bot.ts", "בוט הדיוור"],
  ["app/api/leads/[id]/send/route.ts", "שליחה ידנית מהכרטיס"],
  ["app/api/leads/[id]/send-knowledge/route.ts", "שליחת תשובה ממאגר הידע"],
  ["app/api/broadcast/[id]/send/route.ts", "דיוור"],
];

for (const [file, what] of sites) {
  test(`${what} לא קובע לפי קוד HTTP`, () => {
    const src = io.readFileSync(file, "utf8");

    assert.ok(src.includes("judgeSend("), `${file} לא מריץ את ההכרעה`);
    assert.ok(
      !/status: result\.ok \? "sent"/.test(src),
      `${file} עדיין רושם "נשלח" לפי קוד HTTP`
    );
  });
}

test("אף מקום במערכת לא רושם 'sent' לפי result.ok", () => {
  /**
   * הבדיקה סורקת את כל הקוד, ולא רשימה שנכתבה ביד -
   * מקום שישי שייווצר מחר ייתפס כאן.
   */
  const roots = ["lib", "app"];
  const bad: string[] = [];

  function walk(dir: string) {
    for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith(".ts") && !full.endsWith(".tsx")) continue;

      const src = io.readFileSync(full, "utf8");
      /** המודול עצמו מתעד את הבאג בהערה */
      if (full.endsWith("lib/send-result.ts")) continue;

      if (/result\.ok \? "sent"/.test(src)) bad.push(full);
    }
  }

  for (const root of roots) walk(root);

  assert.deepEqual(bad, [], `חזרה ההכרעה לפי HTTP ב: ${bad.join(", ")}`);
});

test("הוובוק קולט עדכוני מסירה לפני הטיפול בהודעה", () => {
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  assert.ok(hook.includes("readDeliveryUpdate(raw)"), "עדכוני מסירה לא נקלטים");
  assert.ok(
    hook.indexOf("readDeliveryUpdate(raw)") <
      hook.indexOf("mapInboundMessage(raw)"),
    "עדכון מסירה נבדק אחרי שהוא כבר טופל כהודעה"
  );
});

test("כישלון מסירה פותח התראה", () => {
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");
  assert.ok(
    hook.includes("הודעה לא הגיעה ללקוח"),
    "הלקוח מחכה לתשובה שלא הגיעה ואתה לא יודע"
  );
});

test("אישור מאוחר לא מוחק כישלון", () => {
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");
  assert.ok(
    hook.includes('delivery.status !== "failed"'),
    "אישור שמגיע אחרי כישלון יסתיר אותו"
  );
});

test("המילה 'נשלח' כבר לא מתארת הודעה שלא אושרה", () => {
  assert.equal(statusLabel(LEGACY_SENT), "יצא לטקסטר");
  assert.equal(statusLabel(DELIVERED), "נמסר ללקוח");
  assert.equal(statusLabel(FAILED), "נכשל");
});


/* ============================================================
 *  "רק הסטטוס הזה לא שולח"
 * ============================================================
 *
 *  סטטוס עם בנק של שלוש תבניות מתחלף ביניהן בסבב שווה.
 *  **תבנית אחת שבורה מתוך שלוש = שליש מהלידים בלי הודעה**,
 *  וזה נראה אקראי לגמרי ובלתי ניתן לאיתור.
 *
 *  האבחון כאן משווה את מה שהחוק מבקש מול מה שקיים בטקסטר
 *  ברגע זה - ולא מול הטבלה המקומית, שיכולה להיות מיושנת.
 */

const diag = io.readFileSync(
  "app/api/diagnostics/status-templates/route.ts",
  "utf8"
);

test("האבחון בודק מול טקסטר ולא רק מול הטבלה המקומית", () => {
  assert.ok(diag.includes("listTemplates()"), "לא נקראת רשימת התבניות מטקסטר");
  assert.ok(diag.includes("parseTemplates("), "התשובה לא מפוענחת");
  assert.ok(diag.includes("db.template"), "לא מושווה מול הטבלה המקומית");
});

test("האבחון בודק את כל הבנק ולא רק את התבנית הראשית", () => {
  assert.ok(diag.includes("parsePool(rule.templatePool)"), "הבנק לא נפרק");
  assert.ok(
    diag.includes("[rule.templateName]"),
    "חוק בלי בנק לא נבדק בכלל"
  );
});

test("כל כשל אפשרי מקבל שם ופעולה", () => {
  for (const problem of [
    "לא קיימת בטקסטר",
    "לא מאושרת",
    "לא קיימת בטבלה המקומית",
    "החוק כבוי",
  ]) {
    assert.ok(diag.includes(problem), `לא נבדק המצב: ${problem}`);
  }
  assert.ok(diag.includes("מה_לעשות"), "האבחון אומר מה שבור ולא מה לעשות");
});

test("האבחון לא שולח כלום", () => {
  for (const forbidden of ["sendTemplate(", "db.message.create", "db.rule.update"]) {
    assert.ok(!diag.includes(forbidden), `האבחון משנה מצב: ${forbidden}`);
  }
});

test("כישלון בקריאה מטקסטר לא מוצג כ'הכל תקין'", () => {
  /**
   * אחרת האבחון היה אומר "כל התבניות קיימות" בדיוק
   * כשהוא לא הצליח לבדוק אף אחת מהן.
   */
  assert.ok(diag.includes("!live.ok"), "כשל בקריאה לא נבדק");
  assert.ok(
    diag.indexOf("!live.ok\n      ?") < diag.indexOf("problems.length === 0"),
    "המסקנה החיובית קודמת לבדיקה אם בכלל הצלחנו לקרוא"
  );
});

test("הבדיקה מחוברת למסך", () => {
  const screen = io.readFileSync("components/DiagnosticsScreen.tsx", "utf8");
  assert.ok(screen.includes("status-templates"), "אין קריאה לאבחון");
  assert.ok(screen.includes("fromTemplates("), "התשובה לא מוצגת");
  assert.ok(screen.includes("למה סטטוס לא שולח"), "אין כפתור");
  assert.ok(
    screen.includes("שם הסטטוס, למשל"),
    "השדה עדיין מבקש טלפון במקום סטטוס"
  );
});


/* ============================================================
 *  "הגדרתי דקה והגיע אחרי 7-8 דקות"
 * ============================================================
 *
 *  שתי סיבות נראות זהות מבחוץ ודורשות טיפול הפוך:
 *
 *  · הטיימר נרדם  → הפתרון הוא מתזמן חיצוני
 *  · הטיימר רץ והמשימה נדחתה → הפתרון בקוד
 *
 *  בלי למדוד את שניהם אי אפשר להבדיל, וכל תיקון הוא ניחוש.
 */

test("המרווח בין סבבים נמדד ונשמר", () => {
  const inst = io.readFileSync("instrumentation.ts", "utf8");

  assert.ok(inst.includes("engineGapSeconds"), "המרווח לא נמדד");
  assert.ok(inst.includes("engineWorstGap"), "המרווח הגרוע לא נשמר");
  assert.ok(
    inst.includes("previous?.engineRanAt"),
    "המדידה לא מול הסבב הקודם"
  );
});

test("המדד הגרוע מתאפס ולא נתקע על מקרה חד פעמי", () => {
  const inst = io.readFileSync("instrumentation.ts", "utf8");
  assert.ok(inst.includes("worstIsOld"), "תקלה אחת תישאר על המסך לנצח");
});

test("כל משימה רושמת מתי באמת רצה", () => {
  const runner = io.readFileSync("lib/runner.ts", "utf8");
  assert.ok(runner.includes("ranAt: new Date()"), "אין מדידת איחור");

  const schema = io.readFileSync("prisma/schema.prisma", "utf8");
  assert.ok(/ranAt\s+DateTime\?/.test(schema), "השדה לא אופציונלי");
});

test("בריאות המערכת מפרידה בין טיימר שנרדם למשימה שנדחתה", () => {
  const api = io.readFileSync("app/api/health/system/route.ts", "utf8");

  assert.ok(api.includes("timerAsleep"), "לא נבדק אם הטיימר נרדם");
  assert.ok(api.includes("האיחור_הגדול_שניות"), "האיחור לא נמדד");
  assert.ok(
    api.includes("העיכוב אינו בטיימר"),
    "שתי הסיבות מוצגות כאותה בעיה"
  );
});

test("כשהטיימר נרדם - מוצגת הפקודה המדויקת לתיקון", () => {
  const api = io.readFileSync("app/api/health/system/route.ts", "utf8");
  const screen = io.readFileSync("components/SystemHealth.tsx", "utf8");

  assert.ok(api.includes("/api/cron/run?token="), "לא נאמר מה להגדיר");
  assert.ok(screen.includes("הפעלה_חיצונית"), "ההנחיה לא מוצגת");
});

test("האיחור מחושב רק על משימות שבאמת רצו", () => {
  /** אחרת משימה שבוטלה הייתה נספרת כאיחור אינסופי */
  const api = io.readFileSync("app/api/health/system/route.ts", "utf8");
  assert.ok(api.includes('state: "done"'), "משימות שלא רצו נספרות");
  assert.ok(api.includes("ranAt: { not: null"), "משימות בלי זמן ריצה נספרות");
});

/* ============================================================
 *  הקוד המספרי של טקסטר
 * ============================================================
 *
 *  **מה שהתברר מהתמיכה שלהם.** הם שולחים
 *  `messageStatus: 2` - מספר, לא מילה. הקוד חיפש
 *  "delivered" כטקסט, ולכן התעלם מהאישורים לחלוטין: הם
 *  הגיעו, ואף אחד לא קרא אותם.
 */

const TEXTER = (status: number, extra: Record<string, unknown> = {}) => ({
  eventName: "messageStatusUpdate",
  eventData: { messageId: "m1", messageStatus: status, ...extra },
});

test("messageStatus 2 הוא נמסר ללקוח", () => {
  const r = readDeliveryUpdate(TEXTER(2));
  assert.equal(r?.status, DELIVERED, "האישור של טקסטר לא נקרא");
  assert.equal(r?.messageId, "m1");
});

test("messageStatus 3 הוא נקרא", () => {
  assert.equal(readDeliveryUpdate(TEXTER(3))?.status, "read");
});

test("messageStatus שלילי הוא כישלון, עם הסיבה", () => {
  const r = readDeliveryUpdate(TEXTER(-1, { error: "number not on whatsapp" }));
  assert.equal(r?.status, FAILED);
  assert.ok(r?.reason?.includes("whatsapp"), "הסיבה אבדה");
});

test("messageStatus 0 ו-1 לא משנים כלום", () => {
  /**
   * הם אומרים בדיוק מה שכבר ידענו - שטקסטר קיבלה את
   * ההודעה. עדכון לפיהם היה דורס מידע טוב יותר שכבר
   * הגיע.
   */
  assert.equal(readDeliveryUpdate(TEXTER(0)), null);
  assert.equal(readDeliveryUpdate(TEXTER(1)), null);
});

test("שדה מצב מפורש מספיק גם בלי שם אירוע מתאים", () => {
  /**
   * **זה מה שהיה חוסם את טקסטר.** הם שולחים את העדכון
   * כחלק מאירוע על הודעה יוצאת, ולא באירוע ששמו
   * "status". דרישה לשם אירוע בלבד הייתה דוחה את כל
   * האישורים שלהם.
   */
  const r = readDeliveryUpdate({
    eventName: "newOutgoingMessage",
    eventData: { message: { id: "m2", text: "שלום" }, messageStatus: 2 },
  });

  assert.equal(r?.status, DELIVERED, "אישור שמגיע עם טקסט נדחה");
});

test("הודעה נכנסת לעולם לא נקראת כעדכון מסירה", () => {
  /**
   * **המעקה שמגן על כל הבוט.** אם אירוע של הודעה מלקוח
   * ייתפס כעדכון מסירה, הוובוק יצא מוקדם וכל הודעה
   * מלקוח תדולג בשקט.
   *
   * נבדק גם כשהאירוע נושא שדה status משלו.
   */
  assert.equal(readDeliveryUpdate(INCOMING), null);

  assert.equal(
    readDeliveryUpdate({
      eventName: "newIncomingMessage",
      eventData: { message: { id: "m4", text: "היי", messageStatus: 2 } },
    }),
    null,
    "הודעה נכנסת עם שדה מצב נבלעה - הבוט ימות"
  );
});

test("ההודעה הנכנסת עדיין נקראת במלואה", () => {
  const mapped = mapInboundMessage(INCOMING);
  assert.equal(mapped.text, "מה המחיר?");
  assert.equal(mapped.phone, "972501234567");
});

test("הטלפון נשלף מהעדכון, כגיבוי לזיהוי", () => {
  /**
   * המזהה שטקסטר שולחת בעדכון אינו בהכרח המזהה ששמרנו
   * בשליחה. בלי גיבוי, אי-התאמה אחת פירושה שאף אישור
   * מסירה לא נקלט.
   */
  const r = readDeliveryUpdate({
    eventName: "messageStatusUpdate",
    eventData: {
      messageId: "m1",
      messageStatus: 2,
      channel: { id: "972506224115" },
    },
  });

  assert.equal(r?.phone, "972506224115", "הטלפון לא נשלף");
});

test("מזהה שאינו טלפון לא נחשב טלפון", () => {
  const r = readDeliveryUpdate({
    eventName: "messageStatusUpdate",
    eventData: { messageId: "abc-123", messageStatus: 2 },
  });
  assert.equal(r?.phone, null, "מזהה פנימי זוהה כטלפון");
});

test("הוובוק מחפש לפי טלפון כשהמזהה לא נמצא", () => {
  const hook = io.readFileSync("app/api/webhooks/texter/route.ts", "utf8");

  assert.ok(hook.includes("delivery.phone"), "אין גיבוי לפי טלפון");
  assert.ok(
    hook.includes('status: { in: ["accepted", "sent"] }'),
    "הגיבוי ידרוס גם הודעות שכבר אושרו"
  );
  assert.ok(
    hook.includes("orderBy: { createdAt: \"desc\" }"),
    "הגיבוי לא לוקח את ההודעה האחרונה"
  );
});

console.log(`✓ send-result: ${passed} בדיקות עברו`);
