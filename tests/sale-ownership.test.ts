import assert from "node:assert/strict";
import {
  isProtectedByChannel,
  ownerFromEntries,
  mayReclassifyByCampaignName,
  originFor,
  type EntryLike,
} from "../lib/sale-ownership";

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

const saleChannels = new Set(["ch-elad"]);
const mineChannels = new Set(["ch-elad"]); // ch-mine אינו בתוכו

const entry = (over: Partial<EntryLike> = {}): EntryLike => ({
  isSale: false,
  channelId: null,
  campaign: null,
  ...over,
});

/* ---------- ההגנה שחסרה וגרמה לנזק ---------- */

test("כניסה בערוץ מכירה מוגנת", () => {
  eq(isProtectedByChannel([entry({ channelId: "ch-elad" })], saleChannels), true);
});

test("כניסה בערוץ שאינו מכירה אינה מוגנת", () => {
  eq(isProtectedByChannel([entry({ channelId: "ch-mine" })], saleChannels), false);
});

test("כניסה בלי ערוץ אינה מוגנת", () => {
  eq(isProtectedByChannel([entry()], saleChannels), false);
});

test("פעולה לפי שם קמפיין לא רשאית לגעת בליד של ערוץ", () => {
  eq(
    mayReclassifyByCampaignName(
      [entry({ channelId: "ch-elad" })],
      saleChannels
    ),
    false
  );
});

test("פעולה לפי שם קמפיין כן רשאית לגעת בליד ותיק בלי ערוץ", () => {
  eq(mayReclassifyByCampaignName([entry({ isSale: true })], saleChannels), true);
});

/* ---------- הכלל של רובי ---------- */

test("כניסה אחת של מכירה מעבירה את כל הליד לקונה", () => {
  eq(
    ownerFromEntries(
      [entry({ isSale: false }), entry({ isSale: true })],
      saleChannels
    ),
    "sale"
  );
});

test("ליד בערוץ מכירה הוא של הקונה גם בלי חותמת על הכניסה", () => {
  eq(
    ownerFromEntries([entry({ channelId: "ch-elad", isSale: false })], saleChannels),
    "sale"
  );
});

test("ליד בלי שום כניסת מכירה נשאר שלך", () => {
  eq(ownerFromEntries([entry(), entry()], saleChannels), "mine");
});

test("ליד בלי כניסות בכלל נשאר שלך", () => {
  eq(ownerFromEntries([], saleChannels), "mine");
});

test("שם קמפיין לא מכריע בעלות", () => {
  eq(
    ownerFromEntries([entry({ campaign: "קמפיין שלא רשום" })], saleChannels),
    "mine"
  );
  eq(
    ownerFromEntries(
      [entry({ campaign: "קמפיין שלא רשום", channelId: "ch-elad" })],
      saleChannels
    ),
    "sale"
  );
});

/* ---------- origin ---------- */

test("וואטסאפ לא נדרס כשהליד שלך", () => {
  eq(originFor("whatsapp", "mine"), "whatsapp");
});

test("וואטסאפ כן הופך למכירה כשיש כניסת מכירה", () => {
  eq(originFor("whatsapp", "sale"), "sale");
});

test("ליד רגיל מתורגם נכון", () => {
  eq(originFor("leadmanager", "sale"), "sale");
  eq(originFor("sale", "mine"), "leadmanager");
});

/* ---------- התרחיש שקרה בפועל ---------- */

test("התרחיש של אתמול: ליד בערוץ בלי קמפיין רשום לא יוצא מהמכירה", () => {
  const entries = [
    entry({ channelId: "ch-elad", isSale: true, campaign: null }),
  ];

  // פעולה ישנה שמחליטה לפי שם קמפיין חייבת לדלג עליו
  eq(mayReclassifyByCampaignName(entries, saleChannels), false);

  // והבעלות נשארת של הקונה
  eq(ownerFromEntries(entries, saleChannels), "sale");
});

console.log(`✓ sale-ownership: ${passed} בדיקות עברו`);
