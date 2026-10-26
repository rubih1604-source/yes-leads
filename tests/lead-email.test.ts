import assert from "node:assert/strict";
import {
  subjectFor,
  textFor,
  htmlFor,
  fullNameOf,
  shouldEmail,
  threadIdFor,
  previewFor,
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

/* ---------- חוט אחד ליום ---------- */

test("הנושא אחיד לכל לידי היום, כדי שג'ימייל יקבץ אותם", () => {
  const a = subjectFor(lead({ at: new Date("2026-10-24T06:00:00Z") }));
  const b = subjectFor(
    lead({
      at: new Date("2026-10-24T17:00:00Z"),
      firstName: "אדם",
      lastName: "אחר",
      phone: "+972500000000",
    })
  );
  eq(a, b);
});

test("יום אחר - נושא אחר, כדי שלא יתערבב עם אתמול", () => {
  const a = subjectFor(lead({ at: new Date("2026-10-24T10:00:00Z") }));
  const b = subjectFor(lead({ at: new Date("2026-10-25T10:00:00Z") }));
  assert.notEqual(a, b);
});

test("מזהה החוט זהה לכל לידי אותו יום", () => {
  eq(
    threadIdFor(new Date("2026-10-24T06:00:00Z")),
    threadIdFor(new Date("2026-10-24T20:00:00Z"))
  );
});

test("מזהה החוט שונה בין ימים", () => {
  assert.notEqual(
    threadIdFor(new Date("2026-10-24T10:00:00Z")),
    threadIdFor(new Date("2026-10-25T10:00:00Z"))
  );
});

test("היום נקבע בשעון ישראל ולא בשעון השרת", () => {
  // 22:30 UTC ב-24 = 01:30 בישראל ב-25, ולכן חוט של ה-25
  const late = threadIdFor(new Date("2026-10-24T22:30:00Z"));
  const next = threadIdFor(new Date("2026-10-25T08:00:00Z"));
  eq(late, next);
});

test("מזהה החוט בפורמט תקין למייל", () => {
  const id = threadIdFor(new Date("2026-10-24T10:00:00Z"));
  ok(id.startsWith("<"));
  ok(id.endsWith(">"));
  ok(id.includes("@"));
});

/* ---------- שורת התצוגה המקדימה ---------- */

test("התצוגה המקדימה מחזירה את השם והטלפון", () => {
  const p = previewFor(lead());
  ok(p.includes("איתמר כהן"));
  ok(p.includes("+972587688864"));
});

test("ליד של קונה מסומן בתצוגה המקדימה", () => {
  const p = previewFor(lead({ isSale: true, channelName: "לידים אלעד" }));
  ok(p.includes("מכירה"));
  ok(p.includes("לידים אלעד"));
});

test("התצוגה המקדימה נמצאת בגוף ה-HTML", () => {
  const h = htmlFor(lead());
  ok(h.includes("איתמר כהן"));
  ok(h.includes("display:none"));
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
