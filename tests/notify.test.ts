import assert from "node:assert/strict";
import io from "node:fs";

/**
 * ============================================================
 *  ההתראה על ליד שנכנס
 * ============================================================
 *
 *  **הכשל שנתפס.** "יש לידים שנכנסו שלא קיבלתי התראה
 *  אליהם."
 *
 *  שתי סיבות נפרדות, ושתיהן אמיתיות:
 *
 *  1. **הגעה חוזרת לא התריעה בכלל.** ההתראה נשלחה רק
 *     בענף של מספר שלא היה במערכת מעולם. מי שכבר היה
 *     אצלך ומילא טופס שוב - נרשמה לו כניסה, הוא צף לראש
 *     הרשימה, ולא יצא עליו שום דבר.
 *
 *  2. **ההתראה הייתה מייל ובלבד.** שלושה שערים לפניה
 *     (מתג, סינון, Resend), וכשאחד נכשל - `catch` ריק
 *     בלע את זה. לא התראה, לא רישום, לא שגיאה.
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

const notify = io.readFileSync("lib/notify-lead.ts", "utf8");
const hook = io.readFileSync("app/api/webhooks/leadmanager/route.ts", "utf8");
const manual = io.readFileSync("app/api/leads/route.ts", "utf8");

/* ============================================================
 *  1. הפעמון לא תלוי בשרת מיילים
 * ============================================================ */

test("נוצרת התראה בתוך המערכת, לא רק מייל", () => {
  assert.ok(notify.includes("db.alert.create"), "אין התראה בתוך המערכת");
});

test("הפעמון קודם למייל", () => {
  /**
   * אם המייל רץ ראשון ונתקע או זורק, ההתראה לא נוצרת -
   * כלומר חוזרים בדיוק למצב שבו לא ידעת על הליד.
   */
  const alert = notify.indexOf("db.alert.create");
  const email = notify.indexOf("sendEmail({");

  assert.ok(alert > -1 && email > -1);
  assert.ok(alert < email, "המייל רץ לפני ההתראה");
});

test("כשל בפעמון לא מונע את המייל, ולהיפך", () => {
  /** שני try נפרדים, אחרת כשל באחד בולע את השני */
  const tries = notify.match(/try \{/g) ?? [];
  assert.ok(tries.length >= 2, "הפעמון והמייל באותו try");
});

test("הפעמון לא תלוי במתג המייל ולא בסינון שלו", () => {
  /**
   * **זה הלב של התיקון.** שני השערים האלה חלים על
   * המייל בלבד. אם הם היו חלים על הפעמון, כיבוי המייל
   * היה מכבה את ההתראות - וזה בדיוק מה שקרה.
   */
  const alert = notify.indexOf("db.alert.create");

  for (const gate of ["settings.notifyEmail", "shouldEmail("]) {
    const at = notify.indexOf(gate);
    assert.ok(at > -1, `נעלם שער המייל: ${gate}`);
    assert.ok(at > alert, `${gate} חל גם על ההתראה בתוך המערכת`);
  }
});

/* ============================================================
 *  2. כשל משאיר עקבות
 * ============================================================ */

test("כשל במייל נרשם על הליד", () => {
  assert.ok(notify.includes('type: "notify_failed"'), "הכשל נבלע");
  assert.ok(notify.includes("emailReason"), "אין סיבה לכשל");
});

test("אין catch ריק שבולע הכל", () => {
  assert.ok(
    !/catch\s*\{\s*return false;\s*\}/.test(notify),
    "חזר ה-catch שבלע כל כשל של התראה"
  );
});

test("כל סיבה לאי-שליחה מקבלת שם", () => {
  for (const reason of [
    "מתג המייל כבוי",
    "סינון המייל",
    "שליחת המייל נכשלה",
  ]) {
    assert.ok(notify.includes(reason), `אין הסבר למצב: ${reason}`);
  }
});

/* ============================================================
 *  3. הגעה חוזרת מתריעה
 * ============================================================ */

test("הגעה חוזרת מתריעה, לא רק מספר חדש", () => {
  /**
   * שתי קריאות: אחת בענף של ליד חדש, אחת בענף של ליד
   * שכבר קיים. קודם הייתה רק הראשונה.
   */
  const calls = hook.match(/notifyNewLead\(\{/g) ?? [];
  assert.equal(calls.length, 2, "יש ענף הגעה שלא מתריע");
});

test("ההתראה החוזרת מסומנת כחוזרת", () => {
  assert.ok(hook.includes("returning: true"), "לא רואים שזו הגעה חוזרת");
  assert.ok(notify.includes('input.returning ? "ליד נכנס שוב" : "ליד חדש"'));
});

test("אותה הגשה משתי הדלתות לא מתריעה פעמיים", () => {
  /**
   * ליד מנגר והחיבור הישיר מביאים את אותו ליד בהפרש
   * שניות. בלי התנאי כל ליד היה מתריע פעמיים.
   */
  const at = hook.indexOf("if (!sameSubmission && !channel.isSale) {");
  assert.ok(at > -1, "אין הגנה מפני התראה כפולה");
});

test("עדכון סטטוס מליד מנגר אינו הגעה ואינו מתריע", () => {
  /**
   * statusOnly נכנס ל-sameSubmission, ולכן התנאי שלמעלה
   * מכסה גם אותו. הבדיקה כאן היא שהקשר הזה לא נשבר.
   */
  assert.ok(
    /const sameSubmission =\s*\n\s*statusOnly \|\|/.test(hook),
    "עדכון סטטוס יתריע כאילו הליד נכנס שוב"
  );
});

test("ליד של אלעד לא מתריע לך", () => {
  /** בדיוק כמו שהאוטומציות לא רצות עליו */
  assert.ok(notify.includes("input.isSale !== true"), "הבוט מתריע על ליד מכירה");
  assert.ok(hook.includes("!channel.isSale"), "הגעה חוזרת של מכירה מתריעה");
});

/* ============================================================
 *  4. ליד שאתה הזנת לא מצלצל לך
 * ============================================================ */

test("ליד שהזנת ידנית לא פותח התראה", () => {
  assert.ok(manual.includes("manual: true"), "מקבל התראה על מה שהרגע הקליד");
  assert.ok(notify.includes("!input.manual"), "הדגל לא נבדק");
});

test("אבל המייל עליו עדיין נשלח", () => {
  const alert = notify.indexOf("!input.manual");
  const email = notify.indexOf("sendEmail({");
  assert.ok(alert < email, "הדגל חוסם גם את המייל");
});

/* ============================================================
 *  5. ההתראה אומרת מי זה
 * ============================================================ */

test("ההתראה נושאת שם, ערוץ וסטטוס", () => {
  assert.ok(notify.includes("input.firstName"), "אין שם");
  assert.ok(notify.includes("input.channelName"), "אין ערוץ");
  assert.ok(notify.includes("input.status"), "אין סטטוס");
  assert.ok(notify.includes("input.phone"), "אין טלפון כגיבוי לשם");
});

test("ההתראה קשורה לליד, כדי שהלחיצה תוביל אליו", () => {
  assert.ok(notify.includes("leadId: input.leadId"));
});

/* ============================================================
 *  6. ההתראה לא מעכבת את הקליטה
 * ============================================================ */

test("הקליטה לא מחכה להתראה", () => {
  /** void ולא await - ליד שנכנס חשוב יותר מהתראה עליו */
  const calls = hook.match(/void notifyNewLead\(\{/g) ?? [];
  assert.equal(calls.length, 2, "הקליטה מחכה לשליחת ההתראה");
});

test("ההתראה נוצרת אחרי שהליד נשמר", () => {
  const save = hook.indexOf("await db.lead.update({");
  const notifyAt = hook.lastIndexOf("void notifyNewLead({");
  assert.ok(save > -1 && notifyAt > save, "ההתראה נוצרת לפני שהליד נשמר");
});


/* ============================================================
 *  7. הגעה חוזרת היא ליד חדש לכל דבר
 * ============================================================
 *
 *  **הכלל, בניסוח שלו:** "הוא ליד רגיל לחלוטין חדש, רק
 *  עם תווית של כפול כי הוא נכנס בעבר."
 *
 *  שלושה חסמים הפרו את הכלל, וכולם היו בענף של ליד קיים:
 *  לא יצאה התראה, לא רצו אוטומציות, והכרטיס הציג את
 *  נתוני הקמפיין הקודם.
 */

const card = io.readFileSync("app/leads/[id]/page.tsx", "utf8");
const schema = io.readFileSync("prisma/schema.prisma", "utf8");

test("הגעה חוזרת מריצה את אותן אוטומציות", () => {
  /**
   * קודם scheduleForStatus נקרא רק בענף של מספר חדש.
   * אדם שמילא את הטופס בפעם השנייה לא קיבל שום הודעה
   * פותחת ושום רצף - הוא נכנס לרשימה בשקט מוחלט.
   */
  /** שני ענפים, שתי קריאות: ליד חדש וליד שחוזר */
  const calls = hook.match(/scheduleForStatus\(/g) ?? [];
  assert.equal(
    calls.length,
    2,
    `scheduleForStatus נקרא ${calls.length} פעמים - ענף ההגעה החוזרת לא מריץ אוטומציות`
  );
  assert.ok(
    hook.includes("scheduleForStatus(lead.id"),
    "ליד חדש לא מקבל אוטומציה"
  );
  assert.ok(
    /scheduleForStatus\(\s*\n?\s*existing\.id/.test(hook),
    "הגעה חוזרת לא מקבלת אוטומציה"
  );
});

test("אוטומציה על הגעה חוזרת לא רצה על ליד של אלעד", () => {
  const at = hook.indexOf("await scheduleForStatus(\n          existing.id");
  assert.ok(at > -1, "האוטומציה על הגעה חוזרת לא קיימת");

  const before = hook.slice(Math.max(0, at - 400), at);
  assert.ok(
    before.includes("!channel.isSale"),
    "ליד של אלעד יקבל ממך אוטומציה"
  );
  assert.ok(
    before.includes("!sameSubmission"),
    "אותה הגשה משתי הדלתות תריץ את האוטומציה פעמיים"
  );
});

test("כל כניסה נושאת את השדות שלה", () => {
  assert.ok(
    /extra\s+Json\?/.test(schema),
    "אין שדה לשמירת נתוני ההגעה על הכניסה עצמה"
  );

  /** בשני הענפים: ליד חדש וליד שחוזר */
  const entries = hook.match(/extra: Object\.keys\(extra\)\.length/g) ?? [];
  assert.ok(
    entries.length >= 4,
    `נמצאו ${entries.length} - יש כניסה שנרשמת בלי השדות שהגיעו איתה`
  );
});

test("הכרטיס מציג את ההגעה האחרונה ולא תערובת", () => {
  /**
   * **הבאג כפי שהוא נראה.** השדות נשמרו במיזוג על הליד:
   * כל הגעה דרסה את מה שהגיע איתה והשאירה את מה שלא.
   * המודעה והטופס של הקמפיין הקודם נשארו על הכרטיס.
   */
  assert.ok(card.includes("const latestEntry = lead.entries[0]"), "לא נקראת ההגעה האחרונה");
  assert.ok(card.includes("fieldsOf(latestEntry?.extra)"), "לא נקראים השדות שלה");

  const entryFirst = card.indexOf("Object.keys(entryFields).length > 0 ? entryFields");
  assert.ok(entryFirst > -1, "השדות של ההגעה האחרונה לא קודמים לשדות הליד");
});

test("ליד ותיק לא מאבד את הנתונים שלו", () => {
  /**
   * ליד שנכנס לפני התיקון לא נושא שדות על הכניסה. בלי
   * נפילה חזרה לשדות הליד, הכרטיס שלו היה מתרוקן -
   * תיקון שמוחק נתונים הוא לא תיקון.
   */
  assert.ok(card.includes("fieldsOf(lead.extra)"), "אין נפילה חזרה לשדות הליד");
  assert.ok(card.includes(": leadFields"), "השדות הישנים לא בשימוש כגיבוי");
});

test("ההיסטוריה מראה לכל כניסה את הקמפיין שלה", () => {
  assert.ok(card.includes("fieldsOf(entry.extra)"), "הכניסות לא מציגות את השדות שלהן");
});

test("הליד עצמו עדיין מחזיק את השדות - קוד אחר קורא אותם", () => {
  /**
   * lead.extra משמש לשאלת הספק, לזיהוי לקוח קיים ולמייל.
   * התיקון מוסיף נתונים לכניסה, ולא מוריד מהליד.
   */
  assert.ok(
    hook.includes("...(typeof existing.extra === \"object\" && existing.extra"),
    "המיזוג על הליד הוסר - קוד אחר שקורא אותו יישבר"
  );
});

console.log(`✓ notify: ${passed} בדיקות עברו`);
