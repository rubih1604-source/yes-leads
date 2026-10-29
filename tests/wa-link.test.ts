import assert from "node:assert/strict";
import io from "node:fs";
import { waLink, waDigits } from "../lib/phone";

/**
 * ============================================================
 *  נעילה על פתיחת צ'אט בוואטסאפ
 * ============================================================
 *
 *  wa.me מצפה לספרות בינלאומיות בלי פלוס ובלי אפס מוביל.
 *  כל צורה אחרת פותחת וואטסאפ על מספר שגוי - כלומר הודעה
 *  לאדם הלא נכון, או מסך ריק.
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

test("כל צורות הכתיבה מגיעות לאותו קישור", () => {
  const forms = [
    "+972521234567",
    "972521234567",
    "0521234567",
    "052-123-4567",
    "052 123 4567",
  ];

  const links = new Set(forms.map((f) => waLink(f)));
  assert.equal(links.size, 1, `התפצל ל-${links.size} קישורים`);
  assert.equal([...links][0], "https://wa.me/972521234567");
});

test("אין פלוס בקישור", () => {
  assert.ok(!waLink("+972521234567")!.includes("+"));
});

test("אין אפס מוביל אחרי קידומת המדינה", () => {
  assert.ok(!waDigits("0521234567").startsWith("9720"));
});

test("מספר קווי עובד גם הוא", () => {
  assert.equal(waLink("03-7654321"), "https://wa.me/97237654321");
});

test("מספר לא תקין לא מייצר קישור שבור", () => {
  assert.equal(waLink("123"), null);
  assert.equal(waLink(""), null);
  assert.equal(waLink(null), null);
  assert.equal(waLink(undefined), null);
});

test("שני מספרים שונים לא מתנגשים", () => {
  assert.notEqual(waLink("0521234567"), waLink("0521234568"));
});

/* ---------- המסכים באמת מציגים את זה ---------- */

const card = io.readFileSync("app/leads/[id]/page.tsx", "utf8");
const list = io.readFileSync("components/LeadList.tsx", "utf8");

test("כרטיס הליד מציג את הקישור", () => {
  assert.ok(card.includes("waLink(lead.phone)"));
});

test("רשימת הלידים מציגה את הקישור בכל שורה", () => {
  assert.ok(list.includes("waLink(lead.phone)"));
});

test("הקישור לא מופיע כשאין מספר תקין", () => {
  assert.ok(card.includes("waLink(lead.phone) && ("));
  assert.ok(list.includes("waLink(lead.phone) && ("));
});

test("לחיצה ברשימה לא פותחת את הליד במקביל", () => {
  const at = list.indexOf('href={waLink(lead.phone)!}');
  const guard = list.lastIndexOf("stopPropagation", at);
  assert.ok(guard > -1 && at - guard < 400, "חסר stopPropagation על הקישור");
});

test("הקישור נפתח בלשונית נפרדת ולא מוציא אותך מהמערכת", () => {
  assert.ok(card.includes('target="_blank"'));
  assert.ok(list.includes('target="_blank"'));
});

console.log(`✓ wa-link: ${passed} בדיקות עברו`);
