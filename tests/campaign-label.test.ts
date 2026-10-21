import assert from "node:assert/strict";
import { campaignLabel, isRealCampaignName } from "../lib/campaign-label";

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

test("שם קמפיין מפייסבוק מנצח הכל", () => {
  eq(
    campaignLabel({
      fbCampaign: "קמפיין אלעד",
      campaign: "אחר",
      formName: "טופס",
    }),
    "קמפיין אלעד"
  );
});

test("בלי שם מפייסבוק - שם הקמפיין הרגיל", () => {
  eq(campaignLabel({ campaign: "מצטרפים ל-yes", formName: "טופס" }), "מצטרפים ל-yes");
});

test("בלי שום שם קמפיין - נופל לשם הטופס", () => {
  eq(
    campaignLabel({ formName: "טופס לידים-יצירת לידים-24.9.26" }),
    "טופס לידים-יצירת לידים-24.9.26"
  );
});

test("אין כלום - null, והתצוגה תיפול לשם הערוץ", () => {
  eq(campaignLabel({}), null);
  eq(campaignLabel({ fbCampaign: null, campaign: null, formName: null }), null);
});

test("רווחים בלבד נחשבים לריק", () => {
  eq(campaignLabel({ fbCampaign: "   ", formName: "טופס" }), "טופס");
});

test("רווחים מסביב לשם נחתכים", () => {
  eq(campaignLabel({ fbCampaign: "  קמפיין  " }), "קמפיין");
});

test("שם טופס אינו שם קמפיין אמיתי", () => {
  eq(isRealCampaignName({ formName: "טופס" }), false);
});

test("שם מפייסבוק הוא שם אמיתי", () => {
  eq(isRealCampaignName({ fbCampaign: "קמפיין אלעד" }), true);
});

test("שם רגיל הוא שם אמיתי", () => {
  eq(isRealCampaignName({ campaign: "מצטרפים ל-yes" }), true);
});

test("כלום אינו שם אמיתי", () => {
  eq(isRealCampaignName({}), false);
});

console.log(`✓ campaign-label: ${passed} בדיקות עברו`);
