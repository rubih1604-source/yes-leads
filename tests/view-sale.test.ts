import assert from "node:assert/strict";
import io from "node:fs";
import { MY_LEADS_WHERE, leadsWhere } from "../lib/channel";
import { viewWhere, type ViewDef, type ChannelRef } from "../lib/lead-views";

/**
 * ============================================================
 *  נעילה על "כולל מכירה"
 * ============================================================
 *
 *  **הבאג:** לתצוגה היה סימון "כולל מכירה", והוא לא עשה
 *  כלום. התצוגה הרחיבה את התנאי שלה, ומיד אחר כך הכלל
 *  הכללי סינן את אותם לידים החוצה.
 *
 *  התוצאה: סימנת קמפיין עם 24 הגעות וראית 8, בלי שום דרך
 *  לדעת לאן נעלמו ה-16.
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

/* ---------- הכלל עצמו ---------- */

test("ברירת המחדל מסננת מכירה החוצה", () => {
  const rule = JSON.stringify(leadsWhere(false));
  assert.ok(rule.includes("sale"));
});

test("'כולל מכירה' באמת מפסיק לסנן אותה", () => {
  const rule = JSON.stringify(leadsWhere(true));
  assert.ok(
    !rule.includes('"sale"'),
    "הסימון לא עושה כלום - לידים שעברו לאלעד עדיין נעלמים"
  );
});

test("וואטסאפ ונמען דיוור לא נכנסים בשום מצב", () => {
  for (const includeSale of [true, false]) {
    const rule = JSON.stringify(leadsWhere(includeSale));
    assert.ok(rule.includes("whatsapp"), "וואטסאפ הפך לליד");
    assert.ok(rule.includes("broadcast"), "נמעני דיוור הציפו את הרשימה");
  }
});

test("ברירת המחדל זהה לכלל הרגיל - אין שני כללים", () => {
  assert.equal(JSON.stringify(leadsWhere(false)), JSON.stringify(MY_LEADS_WHERE));
});

/* ---------- התצוגה ---------- */

const channels: ChannelRef[] = [
  { id: "ch-mine", campaignId: "camp-1", isSale: false },
  { id: "ch-elad", campaignId: "camp-1", isSale: true },
];

const view = (over: Partial<ViewDef> = {}): ViewDef => ({
  id: "v1",
  name: "לוק אלייק",
  campaignIds: ["camp-1"],
  channelIds: [],
  includeSale: false,
  ...over,
});

test("בלי הסימון - התצוגה דורשת כניסה שאינה מכירה", () => {
  const where = JSON.stringify(viewWhere(view(), channels));
  assert.ok(where.includes('"isSale":false'));
});

test("עם הסימון - התצוגה לא דורשת את זה", () => {
  const where = JSON.stringify(viewWhere(view({ includeSale: true }), channels));
  assert.ok(!where.includes('"isSale":false'));
});

test("התצוגה מכסה את שני הערוצים של הקמפיין", () => {
  const where = JSON.stringify(viewWhere(view({ includeSale: true }), channels));
  assert.ok(where.includes("ch-mine"));
  assert.ok(where.includes("ch-elad"), "ערוץ המכירה של הקמפיין לא נכלל");
});

/* ---------- שני הצדדים מחוברים ---------- */

const page = io.readFileSync("app/page.tsx", "utf8");

test("הרשימה מעבירה את הסימון של התצוגה לכלל", () => {
  assert.ok(
    page.includes("leadsWhere(activeView?.includeSale === true)"),
    "הכלל עדיין קבוע, ולכן הסימון בתצוגה חסר משמעות"
  );
});

test("ליד שעבר לאלעד מסומן ברשימה", () => {
  const list = io.readFileSync("components/LeadList.tsx", "utf8");
  assert.ok(list.includes('lead.origin === "sale"'));
  assert.ok(list.includes("עבר לאלעד"));
});

test("הבעלות באמת מועברת לשורה", () => {
  assert.ok(
    page.includes("origin: l.origin"),
    "התווית לא תופיע לעולם - השדה לא מגיע לשורה"
  );
});

test("ברשימה הרגילה שום דבר לא השתנה", () => {
  assert.ok(
    page.includes(": MY_LEADS_WHERE"),
    "הרשימה בלי תצוגה כבר לא משתמשת בכלל הרגיל"
  );
});

console.log(`✓ view-sale: ${passed} בדיקות עברו`);
