import assert from "node:assert/strict";
import {
  combine,
  totalsOf,
  verdictOf,
  normalize,
  type SpendRow,
  type LeadRow,
} from "../lib/campaign-performance";

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

const spend: SpendRow[] = [
  { campaignId: "c1", campaignName: "מצטרפים ל-yes", spend: 1000, fbLeads: 40 },
  { campaignId: "c2", campaignName: "גאוגרפי", spend: 500, fbLeads: 10 },
];

const leads: LeadRow[] = [
  // c1: 4 לידים, 2 סגירות, 300 ₪ עמלה כל אחת
  { campaign: "מצטרפים ל-yes", closed: true, revenue: 300 },
  { campaign: "מצטרפים ל-yes", closed: true, revenue: 300 },
  { campaign: "מצטרפים ל-yes", closed: false, revenue: 0 },
  { campaign: "מצטרפים ל-yes", closed: false, revenue: 0 },
  // c2: 2 לידים, אף סגירה
  { campaign: "גאוגרפי", closed: false, revenue: 0 },
  { campaign: "גאוגרפי", closed: false, revenue: 0 },
];

/* ---------- החישוב עצמו ---------- */

test("עלות לליד ולסגירה", () => {
  const rows = combine(spend, leads);
  const c1 = rows.find((r) => r.campaignId === "c1")!;

  assert.equal(c1.leads, 4);
  assert.equal(c1.closed, 2);
  assert.equal(c1.costPerLead, 250); // 1000 / 4
  assert.equal(c1.costPerClose, 500); // 1000 / 2
  assert.equal(c1.closeRate, 50);
});

test("רווח = הכנסה פחות הוצאה", () => {
  const rows = combine(spend, leads);
  const c1 = rows.find((r) => r.campaignId === "c1")!;

  // 600 ₪ עמלות מול 1000 ₪ פרסום
  assert.equal(c1.revenue, 600);
  assert.equal(c1.profit, -400);
});

test("הגרוע ביותר ראשון - שם מתקבלות ההחלטות", () => {
  const rows = combine(spend, leads);
  assert.equal(rows[0].campaignId, "c2"); // -500
  assert.equal(rows[1].campaignId, "c1"); // -400
});

test("קמפיין עם הוצאה ובלי לידים כן מופיע", () => {
  /**
   * זה המקרה הכי יקר: כסף שנשרף בלי להחזיר כלום. אם היינו
   * מצליבים רק לפי לידים, הוא היה נעלם מהתמונה.
   */
  const rows = combine(
    [{ campaignId: "x", campaignName: "קמפיין מת", spend: 800 }],
    []
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].spend, 800);
  assert.equal(rows[0].leads, 0);
  assert.equal(rows[0].costPerLead, null); // לא 0 - אין לידים, לא "חינם"
  assert.equal(rows[0].profit, -800);
});

test("ליד בלי שם קמפיין לא נעלם", () => {
  const rows = combine([], [{ campaign: null, closed: true, revenue: 300 }]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "בלי קמפיין");
  assert.equal(rows[0].leads, 1);
  assert.equal(rows[0].revenue, 300);
});

test("עלות לליד היא null ולא אפס כשאין לידים", () => {
  // אפס היה נקרא כ"ליד בחינם" - ההיפך מהאמת
  const rows = combine([{ campaignId: "x", campaignName: "א", spend: 100 }], []);
  assert.equal(rows[0].costPerLead, null);
  assert.equal(rows[0].costPerClose, null);
});

test("אותו קמפיין בכמה ימים נצבר", () => {
  const rows = combine(
    [
      { campaignId: "c1", campaignName: "א", spend: 100, fbLeads: 5 },
      { campaignId: "c1", campaignName: "א", spend: 250, fbLeads: 7 },
    ],
    [{ campaign: "א", closed: false, revenue: 0 }]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].spend, 350);
});

test("שם עם רווחים כפולים או אותיות גדולות מצליב נכון", () => {
  const rows = combine(
    [{ campaignId: "c", campaignName: "Yes   TV", spend: 100 }],
    [{ campaign: "yes tv", closed: true, revenue: 300 }]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].leads, 1);
  assert.equal(rows[0].profit, 200);
});

test("לידים שפייסבוק דיווחה ולא נקלטו", () => {
  // פייסבוק: 40, נקלטו: 4 → 36 חסרים. פער קבוע = לידים לא מגיעים.
  const rows = combine(spend, leads);
  assert.equal(rows.find((r) => r.campaignId === "c1")!.missing, 36);
});

test("פער שלילי לא מוצג כמספר שלילי", () => {
  // נקלטו יותר ממה שפייסבוק דיווחה (ליד מנגר במקביל) - לא "מינוס חסרים"
  const rows = combine(
    [{ campaignId: "c", campaignName: "א", spend: 10, fbLeads: 1 }],
    [
      { campaign: "א", closed: false, revenue: 0 },
      { campaign: "א", closed: false, revenue: 0 },
      { campaign: "א", closed: false, revenue: 0 },
    ]
  );

  assert.equal(rows[0].missing, 0);
});

test("בלי דיווח מפייסבוק הפער הוא null ולא אפס", () => {
  const rows = combine(
    [{ campaignId: "c", campaignName: "א", spend: 10 }],
    [{ campaign: "א", closed: false, revenue: 0 }]
  );

  assert.equal(rows[0].missing, null);
});

test("מכירת לידים: ההכנסה היא המחיר לקונה", () => {
  const rows = combine(
    [{ campaignId: "c", campaignName: "אלעד", spend: 300 }],
    Array.from({ length: 20 }, () => ({
      campaign: "אלעד",
      closed: false,
      revenue: 35,
    }))
  );

  assert.equal(rows[0].revenue, 700);
  assert.equal(rows[0].profit, 400);
  assert.equal(rows[0].costPerLead, 15);
});

/* ---------- סכומים ---------- */

test("סכום כולל", () => {
  const t = totalsOf(combine(spend, leads));

  assert.equal(t.spend, 1500);
  assert.equal(t.leads, 6);
  assert.equal(t.closed, 2);
  assert.equal(t.revenue, 600);
  assert.equal(t.profit, -900);
  assert.equal(t.costPerClose, 750);
});

test("סכום של רשימה ריקה לא מפיל כלום", () => {
  const t = totalsOf([]);
  assert.equal(t.spend, 0);
  assert.equal(t.costPerLead, null);
  assert.equal(t.closeRate, 0);
});

/* ---------- המסקנה ---------- */

test("קמפיין ששורף בלי לידים", () => {
  const rows = combine([{ campaignId: "x", campaignName: "א", spend: 800 }], []);
  assert.equal(verdictOf(rows[0]), "שורף כסף בלי להביא לידים");
});

test("לידים בלי אף סגירה", () => {
  const rows = combine(
    [{ campaignId: "x", campaignName: "א", spend: 500 }],
    [{ campaign: "א", closed: false, revenue: 0 }]
  );

  assert.ok(verdictOf(rows[0]).includes("אף סגירה"));
});

test("קמפיין מרוויח", () => {
  const rows = combine(
    [{ campaignId: "x", campaignName: "א", spend: 100 }],
    [{ campaign: "א", closed: true, revenue: 300 }]
  );

  assert.ok(verdictOf(rows[0]).startsWith("מרוויח 200"));
});

test("קמפיין מפסיד מוצג בערך חיובי, בלי מינוס מבלבל", () => {
  const rows = combine(
    [{ campaignId: "x", campaignName: "א", spend: 500 }],
    [{ campaign: "א", closed: true, revenue: 300 }]
  );

  assert.ok(verdictOf(rows[0]).startsWith("מפסיד 200"));
});

test("לידים בלי הוצאה רשומה", () => {
  const rows = combine([], [{ campaign: "א", closed: false, revenue: 0 }]);
  assert.ok(verdictOf(rows[0]).includes("בלי הוצאה רשומה"));
});

test("נרמול", () => {
  assert.equal(normalize("  Yes   TV "), "yes tv");
});

console.log(`✓ campaign-performance: ${passed} בדיקות עברו`);
