/**
 * ============================================================
 *  סינון לפי קמפיין - 62 נכנסו, 6 נספרו
 * ============================================================
 *
 *  **המקרה האמיתי.**
 *
 *  מקמפיין "מבצע 149 ש"ח 10.11.26" נכנסו 62 לידים.
 *  הסינון לפי אותו קמפיין הראה **6**.
 *
 *  **הסיבה.** הסינון הסתמך על `channelId` בלבד - מפתח
 *  שנכתב על הכניסה **רק** אם הקליטה הצליחה לקשר אותה
 *  לערוץ מוגדר במערכת. קמפיין חדש בפייסבוק שעדיין לא
 *  הוגדר כערוץ אצלנו? המפתח נשאר ריק, והליד נעלם מהסינון
 *  - למרות ששם הקמפיין שמור עליו במלואו.
 *
 *  **זו אותה משפחה של כל הבאגים הקודמים:** החלטה שנשענת
 *  על שדה אחד שאולי לא נכתב, במקום על מה שבאמת הגיע.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { campaignKey, spellingsOf, viewWhere } from "../lib/lead-views";

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
    console.error("     " + (err instanceof Error ? err.message : String(err)));
  }
}

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/* ============================================================
 *  1. הכתיבים השונים של אותו קמפיין
 * ========================================================= */
console.log("\nאותו קמפיין, כתיבים שונים");

test("**הכתיבים האמיתיים מהמטען של פייסבוק מתלכדים**", () => {
  /**
   * אלה הערכים שהגיעו בפועל באותה הגשה אחת: fb_campaign
   * נושא מקף מוביל, fb_ad ו-fb_adset בלי. השוואה
   * מילה-במילה הייתה מפרידה אותם לשלושה קמפיינים.
   */
  const spellings = [
    'קמפיין מבצע 149-ש"ח-10.11.26',
    '- קמפיין מבצע 149-ש"ח-10.11.26',
    'קמפיין מבצע 149-ש"ח-10.11.26 -',
    'קמפיין  מבצע  149 ש"ח 10.11.26',
    "קמפיין מבצע-149 שח 10.11.26-",
  ];

  const keys = new Set(spellings.map(campaignKey));

  assert.equal(
    keys.size,
    1,
    `אותו קמפיין נספר כ-${keys.size} שונים: ${[...keys].join(" | ")}`
  );
});

test("קמפיינים שונים נשארים שונים", () => {
  assert.notEqual(
    campaignKey("מבצע 149"),
    campaignKey("מבצע 199"),
    "שני קמפיינים שונים התלכדו - סינון יציג לידים זרים"
  );
});

test("ריק לא מתלכד עם כלום", () => {
  assert.equal(campaignKey(null), "");
  assert.equal(campaignKey(undefined), "");
  assert.equal(campaignKey("   "), "");
});

test("spellingsOf מחזיר את השמות כפי שהם שמורים", () => {
  /** השאילתה משווה לערך שבמסד, לא לערך המנוקה */
  const found = spellingsOf(
    ['קמפיין מבצע 149-ש"ח-10.11.26'],
    [
      { campaign: '- קמפיין מבצע 149-ש"ח-10.11.26' },
      { campaign: 'קמפיין מבצע 149-ש"ח-10.11.26' },
      { campaign: "קמפיין אחר לגמרי" },
      { campaign: null },
    ]
  );

  assert.equal(found.length, 2, "לא נמצאו כל הכתיבים");
  assert.ok(found.includes('- קמפיין מבצע 149-ש"ח-10.11.26'));
  assert.ok(!found.includes("קמפיין אחר לגמרי"), "נתפס קמפיין זר");
});

/* ============================================================
 *  2. הסינון מגיע לליד בשתי דרכים
 * ========================================================= */
console.log("\nערוץ מקושר או לא - הליד נספר");

const view = {
  id: "v1",
  name: "מבצע 149",
  campaignIds: ["c1"],
  channelIds: [],
  includeSale: false,
};

const channels = [{ id: "ch1", campaignId: "c1", name: "ערוץ", isSale: false }];

test("**ליד בלי ערוץ מקושר נספר לפי שם הקמפיין**", () => {
  /** זה הלב: 56 הלידים שנעלמו */
  const where = viewWhere(view, channels, ["קמפיין מבצע 149"]);
  const json = JSON.stringify(where);

  assert.ok(json.includes('"campaign"'), "הסינון עדיין מתעלם משם הקמפיין");
  assert.ok(json.includes('"OR"'), "אין שתי דרכים להגיע לליד");
});

test("**שני קמפיינים עם אותו שם לא מתערבבים**", () => {
  /**
   * ============================================================
   *  המקרה שרובי הזהיר ממנו לפני שהוא קרה
   * ============================================================
   *
   *  יש שני קמפיינים עם אותו שם בדיוק: אחד שלו ואחד של
   *  הקונה. התאמה לפי שם לבדה הייתה מושכת גם את של
   *  הקונה לתצוגה שלו - והתצוגה שאמורה לסדר הייתה
   *  דווקא מערבבת.
   *
   *  לכן השם תופס **רק** כשאין ערוץ מקושר. כניסה שקושרה
   *  לערוץ נשפטת לפי הקישור בלבד, והשם לא יכול לדרוס
   *  אותו. הטופס והערוץ הם הקובעים - בדיוק כמו שביקש.
   */
  const where = viewWhere(view, channels, ["קמפיין מבצע 149"]);
  const json = JSON.stringify(where);

  assert.ok(
    json.includes('"channelId":null'),
    "התאמה לפי שם תופסת גם כניסות שקושרו לערוץ אחר - קמפיין של הקונה ידלוף פנימה"
  );

  /** ההתאמה לפי שם ולפי ערוץ חייבות להישאר שתי דרכים נפרדות */
  const parsed = where as unknown as {
    entries: { some: { OR?: Array<Record<string, unknown>> } };
  };

  const byName = parsed.entries.some.OR?.find((o) => "campaign" in o);

  assert.ok(byName, "אין בכלל התאמה לפי שם");
  assert.equal(
    byName?.channelId,
    null,
    "ההתאמה לפי שם אינה מוגבלת לכניסות בלי ערוץ"
  );
});

test("ליד עם ערוץ מקושר ממשיך להיספר כמו קודם", () => {
  const where = viewWhere(view, channels, []);
  assert.ok(
    JSON.stringify(where).includes('"channelId"'),
    "הדרך הישנה נשברה"
  );
});

test("הפרדת המכירה לא נשברת בגלל הסינון החדש", () => {
  const where = viewWhere(view, channels, ["קמפיין מבצע 149"]);
  assert.ok(
    JSON.stringify(where).includes('"isSale":false'),
    "לידים של הקונה יופיעו בתצוגה שלך"
  );

  const withSale = viewWhere({ ...view, includeSale: true }, channels, [
    "קמפיין מבצע 149",
  ]);
  assert.ok(!JSON.stringify(withSale).includes('"isSale":false'));
});

test("תצוגה ריקה עדיין מחזירה כלום, לא הכל", () => {
  /**
   * תצוגה שנשמרה בטעות בלי בחירה הייתה מציגה את **כל**
   * הלידים, והיית חושב שהיא עובדת.
   */
  const empty = viewWhere(
    { ...view, campaignIds: [], channelIds: [] },
    channels,
    []
  );
  assert.ok(
    JSON.stringify(empty).includes('"in":[]'),
    "תצוגה ריקה מציגה הכל"
  );
});

/* ============================================================
 *  3. הרשימה מציגה רק קמפיינים חיים
 * ========================================================= */
console.log("\nרשימת הקמפיינים");

const picker = read("../components/ViewPicker.tsx");
const page = read("../app/page.tsx");

test("ברירת המחדל היא קמפיינים בשימוש", () => {
  assert.ok(
    picker.includes("useState(true)") && picker.includes("onlyActive"),
    "הרשימה מציגה כברירת מחדל גם קמפיינים שנגמרו"
  );
});

test("אפשר תמיד לראות את כולם", () => {
  assert.ok(
    picker.includes("setOnlyActive(false)"),
    "אין דרך לחזור לרשימה המלאה"
  );
});

test("המתג מוסתר כשאין מה להסתיר", () => {
  assert.ok(
    picker.includes("liveCampaigns.length < campaigns.length"),
    "מתג מיותר יופיע גם כשכל הקמפיינים חיים"
  );
});

test("הספירה נעשית על חלון זמן ולא על הכל", () => {
  assert.ok(
    page.includes("60 * 24 * 60 * 60 * 1000"),
    "אין חלון זמן - קמפיין מלפני שנתיים ייחשב חי"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
