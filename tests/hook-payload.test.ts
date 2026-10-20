import assert from "node:assert/strict";
import { hookBody, hookTokens } from "../lib/hook-payload";

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

const lead = {
  firstName: "ישראל",
  lastName: "ישראלי",
  phone: "+972521234567",
  status: "הועבר לאלעד",
  extra: {
    email: "israel@example.com",
    fb_campaign: "קמפיין מכירת לידים אלעד",
    fb_leadid: "1234567890",
    supplier_question: "hot",
  },
};

const at = new Date("2026-10-20T09:00:00Z");

/* ---------- בלי תבנית ---------- */

test("בלי תבנית נשלח המטען הרגיל, עם הסטטוס", () => {
  const body = JSON.parse(hookBody({ lead, at, statusName: "הועבר לאלעד" }));

  assert.equal(body.full_name, "ישראל ישראלי");
  assert.equal(body.phone, "+972521234567");
  assert.equal(body.email, "israel@example.com");
  assert.equal(body.status, "הועבר לאלעד");
});

test("הסטטוס שנשלח הוא זה שהועבר, לא זה שעל הליד", () => {
  /**
   * הסטטוס על הליד עשוי להיות כבר מעודכן או עדיין לא -
   * מה שנשלח חייב להיות הסטטוס שבגללו הוובוק נורה.
   */
  const body = JSON.parse(hookBody({ lead, at, statusName: "אין מענה" }));
  assert.equal(body.status, "אין מענה");
});

/* ---------- עם תבנית ---------- */

test("תבנית מוחלפת בערכים ויוצאת JSON תקין", () => {
  const template =
    '{"name":"{full_name}","phone":"{phone}","state":"{status}","src":"yes-leads"}';

  const body = JSON.parse(hookBody({ lead, at, statusName: "נסגר", template }));

  assert.equal(body.name, "ישראל ישראלי");
  assert.equal(body.state, "נסגר");
  assert.equal(body.src, "yes-leads");
});

test("אסימון בלי ערך יוצא ריק ולא שובר את המבנה", () => {
  const bare = { ...lead, extra: {} };
  const template = '{"email":"{email}","phone":"{phone}"}';

  const body = JSON.parse(
    hookBody({ lead: bare, at, statusName: "חדש", template })
  );

  assert.equal(body.email, "");
  assert.equal(body.phone, "+972521234567");
});

test("שם עם גרשיים לא שובר את ה-JSON", () => {
  // זה מה שהופך תבנית תקינה לבקשה שהצד השני דוחה
  const quoted = { ...lead, firstName: 'ישראל "ישי"' };
  const template = '{"name":"{full_name}"}';

  const parsed = JSON.parse(
    hookBody({ lead: quoted, at, statusName: "חדש", template })
  );

  assert.equal(parsed.name, 'ישראל "ישי" ישראלי');
});

test("תבנית ריקה נחשבת כאין תבנית", () => {
  const body = JSON.parse(
    hookBody({ lead, at, statusName: "חדש", template: "   " })
  );

  assert.equal(body.full_name, "ישראל ישראלי");
});

/* ---------- האסימונים ---------- */

test("הסטטוס הוא אסימון זמין", () => {
  assert.ok(hookTokens().includes("status"));
});

test("כל אסימון ברשימה באמת קיים במטען", () => {
  /**
   * אסימון שמוצג במסך ואין לו ערך במטען היה יוצא ריק תמיד,
   * והמשתמש היה מאשים את הצד השני.
   */
  const body = JSON.parse(hookBody({ lead, at, statusName: "חדש" }));

  for (const token of hookTokens()) {
    assert.ok(token in body, `חסר במטען: ${token}`);
  }
});

console.log(`✓ hook-payload: ${passed} בדיקות עברו`);
