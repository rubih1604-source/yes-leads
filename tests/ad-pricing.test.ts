import assert from "node:assert/strict";
import {
  readAdPrices,
  priceForAd,
  checkAdPrices,
  type AdPriceRule,
} from "../lib/ad-pricing";

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

const eq = assert.equal;

const rules: AdPriceRule[] = [
  { match: "מודעה א", price: 80 },
  { match: "120252145864180541", price: 95 },
];

/* ---------- קריאת הכללים ---------- */

test("צורה לא צפויה לא מפילה - מחזיר רשימה ריקה", () => {
  eq(readAdPrices(null).length, 0);
  eq(readAdPrices("לא מערך").length, 0);
  eq(readAdPrices({}).length, 0);
});

test("כלל בלי שם נזרק", () => {
  eq(readAdPrices([{ match: "  ", price: 50 }]).length, 0);
});

test("מחיר שלילי או לא מספרי נזרק", () => {
  eq(readAdPrices([{ match: "א", price: -5 }]).length, 0);
  eq(readAdPrices([{ match: "א", price: "abc" }]).length, 0);
});

test("כלל תקין נקרא", () => {
  const out = readAdPrices([{ match: " מודעה ב ", price: "70" }]);
  eq(out.length, 1);
  eq(out[0].match, "מודעה ב");
  eq(out[0].price, 70);
});

/* ---------- ההכרעה ---------- */

test("בלי כללים - מחיר הערוץ", () => {
  const r = priceForAd({ adName: "משהו", rules: [], fallback: 65 });
  eq(r.price, 65);
  eq(r.matchedBy, null);
});

test("התאמה לפי שם מודעה", () => {
  eq(priceForAd({ adName: "מודעה א", rules, fallback: 65 }).price, 80);
});

test("התאמה לפי מזהה מודעה", () => {
  eq(
    priceForAd({ adId: "120252145864180541", rules, fallback: 65 }).price,
    95
  );
});

test("מזהה גובר על שם - השם משתנה בפייסבוק, המזהה לא", () => {
  const r = priceForAd({
    adName: "מודעה א",
    adId: "120252145864180541",
    rules,
    fallback: 65,
  });
  eq(r.price, 95);
});

test("אין התאמה - נופל למחיר הערוץ", () => {
  eq(priceForAd({ adName: "מודעה ג", rules, fallback: 65 }).price, 65);
});

test("רישיות ורווחים לא מפילים התאמה", () => {
  eq(
    priceForAd({
      adName: "  MODAA  ",
      rules: [{ match: "modaa", price: 42 }],
      fallback: 65,
    }).price,
    42
  );
});

test("התאמה חלקית עובדת", () => {
  eq(
    priceForAd({
      adName: "מבצע סוכות 2026",
      rules: [{ match: "מבצע", price: 55 }],
      fallback: 65,
    }).price,
    55
  );
});

test("התאמה מדויקת גוברת על חלקית", () => {
  const r = priceForAd({
    adName: "מבצע",
    rules: [
      { match: "מבצע סוכות", price: 55 },
      { match: "מבצע", price: 99 },
    ],
    fallback: 65,
  });
  eq(r.price, 99);
});

test("מדווח לפי מה הותאם, כדי שאפשר יהיה לבדוק", () => {
  eq(priceForAd({ adName: "מודעה א", rules, fallback: 65 }).matchedBy, "מודעה א");
});

test("שם ריק לא מתאים לכלום", () => {
  eq(priceForAd({ adName: "", rules, fallback: 65 }).price, 65);
  eq(priceForAd({ rules, fallback: 65 }).price, 65);
});

/* ---------- בדיקת שפיות ---------- */

test("כלל כפול מסומן", () => {
  const p = checkAdPrices([
    { match: "א", price: 10 },
    { match: "א", price: 20 },
  ]);
  eq(p.length, 1);
});

test("מחיר 0 מסומן", () => {
  eq(checkAdPrices([{ match: "א", price: 0 }]).length, 1);
});

test("כללים תקינים - בלי הערות", () => {
  eq(checkAdPrices(rules).length, 0);
});

console.log(`✓ ad-pricing: ${passed} בדיקות עברו`);
