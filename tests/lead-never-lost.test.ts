import assert from "node:assert/strict";
import io from "node:fs";

/**
 * ============================================================
 *  ליד לא נעלם. לעולם.
 * ============================================================
 *
 *  **במילים שלו:** "קלטתי שיש ליד שלא נכנס אלינו למרות
 *  שהוא היה ברשימת הלידים בקמפיין בפייסבוק, והפסדתי כסף
 *  עליו. זאת מערכת לידים - כל ליד שנכנס חייב להיכנס
 *  כליד."
 *
 *  **ארבע דרכים שבהן ליד נעלם, וכולן נראו ירוקות:**
 *
 *  1. הקליטה דחתה את הליד, והקולט מפייסבוק לא בדק את
 *     התשובה בכלל - וסימן את השורה כ"עובד בהצלחה".
 *  2. ליד בלי טלפון תקין נרשם ביומן ונעלם.
 *  3. שגיאה באמצע העיבוד.
 *  4. **ההתראה מפייסבוק לא הגיעה מעולם** - וזו היחידה
 *     ששום הגנה פנימית לא יכולה לתפוס, כי מבחינתנו שום
 *     דבר לא קרה.
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

const fb = io.readFileSync("app/api/webhooks/facebook/route.ts", "utf8");
const intake = io.readFileSync("app/api/webhooks/leadmanager/route.ts", "utf8");
const gap = io.readFileSync("lib/facebook-gap.ts", "utf8");
const runner = io.readFileSync("lib/runner.ts", "utf8");

/* ---------- 1. תשובת הקליטה נבדקת ---------- */

test("הקולט מפייסבוק בודק אם הליד באמת נקלט", () => {
  assert.ok(
    fb.includes("const intake = await intakeLead("),
    "התשובה לא נשמרת בכלל"
  );
  assert.ok(fb.includes("const rejected ="), "התשובה לא נבדקת");
  assert.ok(
    fb.includes("!intake.ok || Boolean(outcome.warning)"),
    "דחייה שמוחזרת כ-200 עם warning תיחשב הצלחה"
  );
});

test("ליד שנדחה פותח התראה", () => {
  assert.ok(fb.includes("ליד מפייסבוק לא נקלט!"), "אין התראה");
  assert.ok(fb.includes("leadgen_id: leadId"), "לא נשמר המזהה לשחזור");
  assert.ok(fb.includes("פרטים: details"), "הפרטים לא נשמרים - אי אפשר לשחזר");
});

test("שורת היומן לא מסומנת ירוקה כשלידים נדחו", () => {
  assert.ok(
    fb.includes("לידים לא נקלטו"),
    "השורה תיראה תקינה גם כשליד אבד"
  );
});

test("גם קריסה נחשבת ליד שאבד", () => {
  const block = fb.slice(fb.indexOf("} catch (err) {"));
  assert.ok(block.includes("failed++"), "קריסה לא נספרת");
  assert.ok(block.includes("ליד מפייסבוק לא נקלט!"), "קריסה לא מתריעה");
});

/* ---------- 2. ליד בלי טלפון ---------- */

test("ליד בלי טלפון מתריע ולא רק נרשם ביומן", () => {
  assert.ok(
    intake.includes("ליד הגיע בלי טלפון - לא נקלט!"),
    "נעלם בשורת יומן שאף אחד לא קורא"
  );
  assert.ok(
    intake.includes("אפשר להזין אותו ידנית"),
    "ההתראה לא אומרת מה לעשות"
  );
});

test("בקשה ריקה לא מייצרת התראה מיותרת", () => {
  /** בדיקות חיות של פייסבוק מגיעות ריקות - הן לא לידים */
  assert.ok(intake.includes("if (!empty) {"), "כל בדיקה ריקה תפתח התראה");
});

/* ---------- 3. ההשוואה מול פייסבוק ---------- */

test("יש השוואה ישירה מול פייסבוק", () => {
  assert.ok(gap.includes("/leads"), "לא נשלפים הלידים מהטופס");
  assert.ok(gap.includes("field_data"), "לא נקראים פרטי הליד");
});

test("ההשוואה מזהה לפי מזהה הליד לפני טלפון", () => {
  /**
   * מזהה הוא ודאי. טלפון יכול להיות של ליד אחר לגמרי
   * שנכנס מערוץ אחר, וזיהוי לפיו בלבד היה מחמיץ לידים.
   */
  const byId = gap.indexOf('path: ["fb_leadid"]');
  /**
   * הבדיקה לפי טלפון היא עכשיו **בתוך הערוץ שלך**.
   * בדיקה על הטלפון בלבד הייתה אומרת "כבר קיים" על ליד
   * של המכירה, והליד שלך לא היה מיובא לעולם.
   */
  const byPhone = gap.indexOf("mineKey(phone)");

  assert.ok(byId > -1, "לא מחפשים לפי מזהה הליד");
  assert.ok(byPhone > -1, "לא מחפשים לפי טלפון כגיבוי");
  assert.ok(byId < byPhone, "הטלפון נבדק לפני המזהה");
});

test("הייבוא עובר במסלול הקליטה הרגיל", () => {
  /**
   * ליד שנכנס בדרך צדדית היה מפספס את האוטומציות, את
   * ההתראה ואת השיוך לערוץ - כלומר ניצל חצי.
   */
  assert.ok(gap.includes("webhooks/leadmanager/route"), "נוצר ליד בדרך צדדית");
  assert.ok(!gap.includes("db.lead.create"), "הייבוא יוצר ליד בעצמו");
});

test("ליד שהושלם מסומן ככזה", () => {
  assert.ok(gap.includes("fb_recovered"), "אי אפשר לדעת שהוא הושלם בדיעבד");
});

test("כישלון בקריאה מפייסבוק לא מוצג כ'אין פער'", () => {
  const route = io.readFileSync(
    "app/api/maintenance/facebook-gap/route.ts",
    "utf8"
  );
  assert.ok(route.includes("gap.error"), "שגיאה לא נבדקת");
  assert.ok(
    route.indexOf("gap.error\n      ?") < route.indexOf("gap.missing.length === 0"),
    "נאמר 'אין פער' גם כשלא הצלחנו לבדוק"
  );
});

/* ---------- 4. רץ לבד ---------- */

test("המנוע בודק פערים לבד ומייבא", () => {
  assert.ok(runner.includes("checkFacebookGap"), "הבדיקה תלויה בלחיצה שלך");
  assert.ok(runner.includes("importMissing(gap.missing)"), "רק מתריע, לא משלים");
  assert.ok(
    runner.includes("GAP_CHECK_EVERY_MINUTES"),
    "אין מרווח - הבדיקה תרוץ בכל סבב"
  );
});

test("הבדיקה האוטומטית לא עוצרת את המנוע כשהיא נכשלת", () => {
  assert.ok(
    runner.includes("checkFacebookGap().catch(() => null)"),
    "כשל בבדיקה יעצור את כל האוטומציות"
  );
});

test("המנוע מתריע על מה שהושלם", () => {
  assert.ok(runner.includes("לידים חסרו מפייסבוק"), "ההשלמה שקטה");
  assert.ok(
    runner.includes("ההתראה מפייסבוק עליהם מעולם לא הגיעה"),
    "לא מוסבר למה הם חסרו"
  );
});

test("אין שתי גרסאות של ההשוואה", () => {
  const route = io.readFileSync(
    "app/api/maintenance/facebook-gap/route.ts",
    "utf8"
  );
  assert.ok(route.includes("findGap"), "הנתיב לא משתמש במשותף");
  assert.ok(!route.includes("graph.facebook.com"), "הנתיב פונה לפייסבוק בעצמו");
});

test("הפעולה מופיעה במסך התחזוקה", () => {
  const screen = io.readFileSync("components/MaintenanceScreen.tsx", "utf8");
  assert.ok(screen.includes("facebook-gap"), "אין דרך להריץ ידנית");
});

console.log(`✓ lead-never-lost: ${passed} בדיקות עברו`);
