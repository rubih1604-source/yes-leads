import assert from "node:assert/strict";
import io from "node:fs";

/**
 * ============================================================
 *  נעילה על הבאג שהוציא לידים מהמכירה
 * ============================================================
 *
 *  "חשב הכל מחדש" ביטל כל כניסה שלא התאימה לקמפיין רשום -
 *  כולל כניסות שהגיעו דרך ערוץ. לחיצה אחת מחקה מהמכירה את
 *  כל הלידים החדשים ואיפסה להם את המחיר.
 *
 *  הבדיקות כאן לא מריצות את הקוד (הוא נוגע במסד), אלא נועלות
 *  את **המאפיינים** שמונעים את החזרה של הבאג. אם מישהו ימחק
 *  את ההגנה, הבדיקה תיפול.
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

const recalc = io.readFileSync(
  "app/api/maintenance/recalc-sales/route.ts",
  "utf8"
);

test("הפעולה טוענת את הערוצים, לא רק קמפיינים", () => {
  assert.ok(recalc.includes("db.channel.findMany"));
});

test("הכניסה נשלפת עם channelId", () => {
  assert.ok(/channelId:\s*true/.test(recalc));
});

test("כניסה בערוץ מכירה לא מבוטלת - יש continue לפני הביטול", () => {
  const guard = recalc.indexOf("if (channel?.isSale)");
  const unmark = recalc.indexOf("isSale: false");
  assert.ok(guard > -1, "חסרה ההגנה על ערוץ מכירה");
  assert.ok(unmark > -1, "לא נמצא הביטול");
  assert.ok(guard < unmark, "ההגנה חייבת לבוא לפני הביטול");
});

test("כניסה בערוץ כלשהו מדלגת על ההתנהגות הוותיקה", () => {
  assert.ok(recalc.includes("if (channel) {"));
});

test("מחיר מושלם רק כשהוא 0 - לא דורסים חיוב שנסגר", () => {
  assert.ok(recalc.includes("current === 0"));
});

test("יש תצוגה מקדימה שלא נוגעת בכלום", () => {
  assert.ok(recalc.includes("export async function GET"));
  const get = recalc.slice(recalc.indexOf("export async function GET"));
  const body = get.slice(0, get.indexOf("export async function POST"));
  assert.ok(
    !body.includes("leadEntry.update"),
    "לתצוגה המקדימה אסור לכתוב למסד"
  );
});

test("התצוגה המקדימה מזהירה כשעומדים לבטל כניסות", () => {
  assert.ok(recalc.includes("אזהרה"));
});

test("הפלט מדווח כמה כניסות מוגנות בזכות הערוץ", () => {
  assert.ok(recalc.includes("מוגנות כי הן בערוץ"));
});

/* ---------- מחיקת קמפיין לא גוררת לידים של ערוץ ---------- */

const delCampaign = io.readFileSync(
  "app/api/sales-campaigns/[id]/route.ts",
  "utf8"
);

test("מחיקת קמפיין מדלגת על ליד ששייך לערוץ מכירה", () => {
  assert.ok(delCampaign.includes("inSaleChannel"));
  const guard = delCampaign.indexOf("if (inSaleChannel) continue;");
  const update = delCampaign.indexOf('origin: "leadmanager"');
  assert.ok(guard > -1, "חסרה ההגנה");
  assert.ok(guard < update, "ההגנה חייבת לבוא לפני ההחזרה לרשימה");
});


/* ---------- ההגנות שנוספו ב-137 ---------- */

const fixOrigins = io.readFileSync(
  "app/api/maintenance/fix-origins/route.ts",
  "utf8"
);

test("fix-origins מדלג על ליד ששייך לערוץ מכירה", () => {
  assert.ok(fixOrigins.includes("mayReclassifyByCampaignName"));
  const guard = fixOrigins.indexOf("mayReclassifyByCampaignName(");
  const push = fixOrigins.indexOf("changes.push(");
  assert.ok(guard > -1 && push > -1);
  assert.ok(guard < push, "ההגנה חייבת לבוא לפני רישום השינוי");
});

test("fix-origins מדווח כמה לידים הוגנו", () => {
  assert.ok(fixOrigins.includes("מוגנים כי הם בערוץ"));
});

const splitChannels = io.readFileSync(
  "app/api/maintenance/split-channels/route.ts",
  "utf8"
);

test("split-channels כבר לא מקודד את הכלל ההפוך", () => {
  assert.ok(
    !splitChannels.includes("mineAfter === 0"),
    "הכלל ההפוך חזר: ליד עם כניסה אחת שלך לא אמור להישאר שלך"
  );
});

test("split-channels מכריע דרך הכלל המשותף", () => {
  assert.ok(splitChannels.includes("ownerFromEntries"));
  assert.ok(splitChannels.includes("saleChannelIds"));
});

test("split-channels שולף channelId כדי לדעת על ההגנה", () => {
  assert.ok(/channelId:\s*true/.test(splitChannels));
});

console.log(`✓ recalc-guard: ${passed} בדיקות עברו`);
