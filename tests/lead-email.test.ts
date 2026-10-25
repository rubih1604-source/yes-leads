import assert from "node:assert/strict";
import {
  subjectFor,
  textFor,
  htmlFor,
  fullNameOf,
  shouldEmail,
  type LeadEmailInput,
} from "../lib/lead-email";

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
const ok = (v: unknown) => assert.ok(v);

const lead = (over: Partial<LeadEmailInput> = {}): LeadEmailInput => ({
  leadId: "abc123",
  firstName: "איתמר",
  lastName: "כהן",
  phone: "+972587688864",
  status: "חדש",
  extra: {
    email: "itamarcohen315@gmail.com",
    supplier_question: "סלקום",
    fb_campaign: "קמפיין לידים Yes tv",
    fb_ad: "מבצע סטינג 149",
    fb_platform: "ig",
    fb_leadid: "29020929364182468",
  },
  at: new Date("2026-10-24T17:10:00Z"),
  appUrl: "https://yes-leads.onrender.com",
  ...over,
});

/* ---------- שם ונושא ---------- */

test("שם מלא מורכב משני החלקים", () => {
  eq(fullNameOf(lead()), "איתמר כהן");
});

test("בלי שם - הטלפון משמש כשם", () => {
  eq(fullNameOf(lead({ firstName: null, lastName: null })), "+972587688864");
});

test("הנושא כולל שם וטלפון, כדי להחליט בלי לפתוח", () => {
  const s = subjectFor(lead());
  ok(s.includes("איתמר כהן"));
  ok(s.includes("+972587688864"));
});

test("ליד של קונה מסומן בנושא עם שם הערוץ", () => {
  const s = subjectFor(lead({ isSale: true, channelName: "לידים אלעד" }));
  ok(s.includes("ליד למכירה"));
  ok(s.includes("לידים אלעד"));
});

test("ליד שלך מסומן כליד חדש", () => {
  ok(subjectFor(lead()).startsWith("ליד חדש"));
});

/* ---------- גרסת הטקסט ---------- */

test("הטקסט כולל את כל מה שהגיע", () => {
  const t = textFor(lead());
  ok(t.includes("איתמר כהן"));
  ok(t.includes("+972587688864"));
  ok(t.includes("itamarcohen315@gmail.com"));
  ok(t.includes("סלקום"));
  ok(t.includes("מבצע סטינג 149"));
});

test("שדה שלא הגיע לא מופיע כשורה ריקה", () => {
  const t = textFor(lead({ extra: { email: "a@b.com" } }));
  ok(!t.includes("שאלת ספק"));
  ok(!t.includes("מודעה:"));
});

test("יש קישור לכרטיס הליד", () => {
  ok(textFor(lead()).includes("/leads/abc123"));
});

test("בלי כתובת אתר - אין קישור שבור", () => {
  const t = textFor(lead({ appUrl: null }));
  ok(!t.includes("/leads/"));
});

/* ---------- HTML ---------- */

test("העטיפה בכיוון ימין לשמאל", () => {
  ok(htmlFor(lead()).includes('dir="rtl"'));
});

test("הטלפון הוא קישור חיוג", () => {
  ok(htmlFor(lead()).includes('href="tel:972587688864"'));
});

test("שם המודעה מופיע ב-HTML", () => {
  ok(htmlFor(lead()).includes("מבצע סטינג 149"));
});

test("ליד של קונה מקבל תווית בגוף המייל", () => {
  const h = htmlFor(lead({ isSale: true, channelName: "לידים אלעד" }));
  ok(h.includes("ליד למכירה"));
  ok(h.includes("לידים אלעד"));
});

test("שדה ריק לא מייצר שורה בטבלה", () => {
  const h = htmlFor(lead({ extra: { email: "a@b.com" } }));
  ok(!h.includes("שאלת ספק"));
});

test("תווי HTML בשם לא שוברים את המייל", () => {
  const h = htmlFor(lead({ firstName: '<script>x</script>' }));
  ok(!h.includes("<script>"));
  ok(h.includes("&lt;script&gt;"));
});

test("מרכאות בערך לא שוברות תגית", () => {
  const h = htmlFor(lead({ extra: { fb_ad: 'מבצע "ענק"' } }));
  ok(h.includes("&quot;"));
});

test("התאריך מוצג בשעון ישראל", () => {
  // 17:10 UTC = 20:10 בישראל (שעון חורף +3 באוקטובר)
  ok(htmlFor(lead()).includes("20:10"));
});

test("כל התגיות שנפתחו נסגרות", () => {
  const h = htmlFor(lead());
  eq((h.match(/<div/g) ?? []).length, (h.match(/<\/div>/g) ?? []).length);
  eq((h.match(/<table/g) ?? []).length, (h.match(/<\/table>/g) ?? []).length);
  eq((h.match(/<tr>/g) ?? []).length, (h.match(/<\/tr>/g) ?? []).length);
});

/* ---------- מתי שולחים ---------- */

test("all שולח על הכל", () => {
  eq(shouldEmail("all", true), true);
  eq(shouldEmail("all", false), true);
});

test("off לא שולח כלום", () => {
  eq(shouldEmail("off", true), false);
  eq(shouldEmail("off", false), false);
});

test("sale שולח רק על לידים של קונים", () => {
  eq(shouldEmail("sale", true), true);
  eq(shouldEmail("sale", false), false);
});

test("mine שולח רק על הלידים שלך", () => {
  eq(shouldEmail("mine", false), true);
  eq(shouldEmail("mine", true), false);
});

console.log(`✓ lead-email: ${passed} בדיקות עברו`);
