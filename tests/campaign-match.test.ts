import assert from "node:assert/strict";
import {
  normalizeKey,
  identifiersOf,
  matchKeysOf,
  buildLookup,
  findSaleCampaign,
  parseMatchKeys,
  planEntries,
  type CampaignRule,
} from "../lib/campaign-match";

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

/** קמפיין המכירה של אלעד, מזוהה גם לפי מזהה הטופס */
const elad: CampaignRule = {
  id: "c-elad",
  name: "מצטרפים ל-yes",
  pricePerLead: 35,
  matchKeys: ["998877665544332", "120254104380610184"],
};

/** קמפיין נוסף, לספק אחר - כדי לוודא שאין דליפה בין קונים */
const other: CampaignRule = {
  id: "c-other",
  name: "ספק ב",
  pricePerLead: 20,
  matchKeys: ["555000111"],
};

const lookup = buildLookup([elad, other]);

/* ---------- הבאג עצמו ---------- */

test("ליד של הקונה בלי שם קמפיין - מזוהה לפי מזהה הטופס", () => {
  /**
   * זה הכשל שחזר בכל עדכון: החיבור הישיר לפייסבוק לא
   * קיבל שם קמפיין (חסרה הרשאה לחשבון המודעות), השם הגיע
   * ריק, ולכן הליד נחשב "שלך" ונכנס לרשימה שלך.
   */
  const hit = findSaleCampaign({ formId: "998877665544332" }, lookup);

  assert.notEqual(hit, null);
  assert.equal(hit?.campaignId, "c-elad");
  assert.equal(hit?.price, 35);
});

test("שם קמפיין שהשתנה לא מפיל את ההתאמה", () => {
  const hit = findSaleCampaign(
    { campaign: "מצטרפים ל-yes - גרסה ב", formId: "998877665544332" },
    lookup
  );

  assert.equal(hit?.campaignId, "c-elad");
});

test("מזהה מודעה לבד מספיק", () => {
  const hit = findSaleCampaign({ adId: "120254104380610184" }, lookup);
  assert.equal(hit?.campaignId, "c-elad");
});

test("ליד בלי שום מזהה מוכר נשאר שלך", () => {
  // חשוב: קמפיין שלך לא נגרר בטעות למכירה
  assert.equal(findSaleCampaign({ campaign: "קמפיין שלי" }, lookup), null);
  assert.equal(findSaleCampaign({}, lookup), null);
  assert.equal(findSaleCampaign({ formId: "000" }, lookup), null);
});

test("לא מתבלבל בין שני ספקים", () => {
  assert.equal(findSaleCampaign({ formId: "555000111" }, lookup)?.campaignId, "c-other");
  assert.equal(findSaleCampaign({ formId: "998877665544332" }, lookup)?.campaignId, "c-elad");
});

test("ההתאמה מדווחת לפי מה היא נמצאה", () => {
  const hit = findSaleCampaign({ formId: "998877665544332" }, lookup);
  assert.equal(hit?.matchedOn, "998877665544332");
});

/* ---------- שם עדיין עובד ---------- */

test("התאמה לפי שם ממשיכה לעבוד, עם סלחנות לרווחים ואותיות", () => {
  assert.equal(
    findSaleCampaign({ campaign: "  מצטרפים   ל-YES " }, lookup)?.campaignId,
    "c-elad"
  );
});

test("השם של הקמפיין נכנס לטבלה גם בלי מזהים", () => {
  const simple = buildLookup([{ id: "x", name: "קמפיין יחיד", pricePerLead: 10 }]);
  assert.equal(findSaleCampaign({ campaign: "קמפיין יחיד" }, simple)?.campaignId, "x");
});

test("matchKeys חסר או null לא מפיל את הבנייה", () => {
  const safe = buildLookup([
    { id: "a", name: "א", pricePerLead: 1, matchKeys: null },
    { id: "b", name: "ב", pricePerLead: 2 },
  ]);

  assert.equal(safe.size, 2);
});

test("אותו מפתח בשני קמפיינים - הראשון גובר, בלי הכרעה שקטה", () => {
  const clash = buildLookup([
    { id: "first", name: "ראשון", pricePerLead: 1, matchKeys: ["111"] },
    { id: "second", name: "שני", pricePerLead: 2, matchKeys: ["111"] },
  ]);

  assert.equal(findSaleCampaign({ formId: "111" }, clash)?.campaignId, "first");
});

/* ---------- סדר העדיפויות ---------- */

test("מזהה גובר על שם", () => {
  /**
   * ליד שהשם שלו מצביע על קמפיין אחד והמזהה על אחר:
   * המזהה הוא האמת, כי הוא לא ניתן לשינוי.
   */
  const rules = buildLookup([
    { id: "by-name", name: "שם", pricePerLead: 1 },
    { id: "by-form", name: "טופס", pricePerLead: 2, matchKeys: ["777"] },
  ]);

  const hit = findSaleCampaign({ campaign: "שם", formId: "777" }, rules);
  assert.equal(hit?.campaignId, "by-form");
});

test("סדר המפתחות: טופס, קמפיין, קבוצה, מודעה, שם", () => {
  assert.deepEqual(
    matchKeysOf({
      campaign: "שם",
      campaignId: "c1",
      adsetId: "s1",
      adId: "a1",
      formId: "f1",
    }),
    ["f1", "c1", "s1", "a1", "שם"]
  );
});

test("מפתחות ריקים לא נכנסים", () => {
  assert.deepEqual(matchKeysOf({ campaign: "  ", formId: null }), []);
});

test("אותו ערך בשני שדות נספר פעם אחת", () => {
  assert.deepEqual(matchKeysOf({ campaign: "abc", formId: "ABC" }), ["abc"]);
});

/* ---------- שליפה מהשדות של הליד ---------- */

test("המזהים נשלפים מהשדות שהקליטה שומרת", () => {
  const ids = identifiersOf({
    fb_campaign: "מצטרפים ל-yes",
    fb_campaign_id: "120111",
    fb_ad_id: "120222",
    fb_adset_id: "120333",
    fb_form: "998877",
    phone: "+972521234567",
  });

  assert.equal(ids.campaign, "מצטרפים ל-yes");
  assert.equal(ids.campaignId, "120111");
  assert.equal(ids.adId, "120222");
  assert.equal(ids.adsetId, "120333");
  assert.equal(ids.formId, "998877");
});

test("ליד מליד מנגר ששולחת campaign ולא fb_campaign", () => {
  assert.equal(identifiersOf({ campaign: "קמפיין" }).campaign, "קמפיין");
});

test("fb_campaign גובר על campaign כשיש שניהם", () => {
  const ids = identifiersOf({ fb_campaign: "מפייסבוק", campaign: "מליד מנגר" });
  assert.equal(ids.campaign, "מפייסבוק");
});

test("שדות חסרים לא מפילים את השליפה", () => {
  assert.deepEqual(identifiersOf(null), {
    campaign: null,
    campaignId: null,
    adId: null,
    adsetId: null,
    formId: null,
  });

  assert.equal(identifiersOf({ fb_form: 12345 }).formId, null);
  assert.equal(identifiersOf({ fb_form: "   " }).formId, null);
});

test("ליד אמיתי מפייסבוק בלי שם קמפיין מזוהה נכון מקצה לקצה", () => {
  // בדיוק המצב שקרה: הגיע מזהה מודעה, לא הגיע שם קמפיין
  const extra = {
    full_name: "ישראל ישראלי",
    phone_number: "+972521234567",
    fb_leadid: "1234567890",
    fb_ad_id: "120254104380610184",
    fb_form: "998877665544332",
  };

  const hit = findSaleCampaign(identifiersOf(extra), lookup);
  assert.equal(hit?.campaignId, "c-elad");
});

/* ---------- הקלדת המזהים ---------- */

test("פירוק שורות ופסיקים", () => {
  assert.deepEqual(parseMatchKeys("111\n222, 333"), ["111", "222", "333"]);
});

test("ריקים וכפילויות נזרקים", () => {
  assert.deepEqual(parseMatchKeys("111\n\n111\n , \n222"), ["111", "222"]);
});

test("קלט ריק מחזיר רשימה ריקה", () => {
  assert.deepEqual(parseMatchKeys(""), []);
  assert.deepEqual(parseMatchKeys("  \n , "), []);
});

test("כפילות שנבדלת רק ברווחים נזרקת גם היא", () => {
  assert.deepEqual(parseMatchKeys("abc\n  ABC  "), ["abc"]);
});

test("קלט ענק לא מתפח בלי גבול", () => {
  const many = Array.from({ length: 200 }, (_, i) => String(i)).join("\n");
  assert.equal(parseMatchKeys(many).length, 50);
});

test("מפתח ארוך נחתך ולא נשמר כמו שהוא", () => {
  assert.equal(parseMatchKeys("x".repeat(500))[0].length, 200);
});

/* ---------- תוכנית הכניסות: כלל הזהירות ---------- */

test("ליד של הקונה בלי שם קמפיין - כל הכניסות מסומנות, הבעלות עוברת", () => {
  const plan = planEntries(
    [{ id: "e1", campaign: null, isSale: false }],
    { formId: "998877665544332" },
    lookup
  );

  assert.equal(plan.stamp.length, 1);
  assert.equal(plan.stamp[0].price, 35);
  assert.equal(plan.mineLeft, 0);
  assert.equal(plan.hit?.campaignId, "c-elad");
});

test("כניסה אחת שלך - הליד נשאר גם שלך", () => {
  // הכלל שקבעת: ליד רגיל אצלך וליד רגיל אצלו, במקביל
  const plan = planEntries(
    [
      { id: "mine", campaign: "קמפיין שלי", isSale: false },
      { id: "sale", campaign: "מצטרפים ל-yes", isSale: false },
    ],
    {},
    lookup
  );

  assert.deepEqual(plan.stamp.map((e) => e.id), ["sale"]);
  assert.equal(plan.mineLeft, 1);
});

test("כניסה בלי שם אצל ליד שיש לו שמות - לא מסומנת בטעות", () => {
  /**
   * זו ההגנה על הכיס: אם היינו נופלים למזהים של הליד,
   * הכניסה הוותיקה שלך הייתה נחתמת כמכירה והקונה היה
   * מחויב על ליד שלא קיבל.
   */
  const plan = planEntries(
    [
      { id: "old", campaign: null, isSale: false },
      { id: "named", campaign: "קמפיין שלי", isSale: false },
    ],
    { formId: "998877665544332" },
    lookup
  );

  assert.deepEqual(plan.stamp, []);
  assert.equal(plan.hit, null);
  assert.equal(plan.mineLeft, 2);
});

test("כניסה שכבר חתומה לא נחתמת שוב", () => {
  const plan = planEntries(
    [{ id: "e1", campaign: "מצטרפים ל-yes", isSale: true }],
    {},
    lookup
  );

  assert.deepEqual(plan.stamp, []);
  assert.equal(plan.mineLeft, 0);
});

test("ליד שכולו שלך לא נוגעים בו", () => {
  const plan = planEntries(
    [{ id: "e1", campaign: "קמפיין שלי", isSale: false }],
    {},
    lookup
  );

  assert.equal(plan.hit, null);
  assert.deepEqual(plan.stamp, []);
  assert.equal(plan.mineLeft, 1);
});

test("ליד בלי כניסות בכלל לא מפיל כלום", () => {
  const plan = planEntries([], { formId: "998877665544332" }, lookup);
  assert.equal(plan.hit?.campaignId, "c-elad");
  assert.equal(plan.mineLeft, 0);
  assert.deepEqual(plan.stamp, []);
});

test("שתי כניסות של הקונה בלי שם - שתיהן מסומנות", () => {
  const plan = planEntries(
    [
      { id: "a", campaign: null, isSale: false },
      { id: "b", campaign: null, isSale: false },
    ],
    { adId: "120254104380610184" },
    lookup
  );

  assert.deepEqual(plan.stamp.map((e) => e.id), ["a", "b"]);
  assert.equal(plan.mineLeft, 0);
});

test("ליד של שני ספקים שונים - כל כניסה במחיר שלה", () => {
  const plan = planEntries(
    [
      { id: "a", campaign: "מצטרפים ל-yes", isSale: false },
      { id: "b", campaign: "ספק ב", isSale: false },
    ],
    {},
    lookup
  );

  assert.deepEqual(
    plan.stamp.map((e) => e.price).sort((x, y) => x - y),
    [20, 35]
  );
});

/* ---------- נרמול ---------- */

test("נרמול מפתח", () => {
  assert.equal(normalizeKey("  Yes   TV  "), "yes tv");
});

console.log(`✓ campaign-match: ${passed} בדיקות עברו`);
