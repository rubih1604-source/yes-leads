import assert from "node:assert/strict";
import {
  channelsInView,
  viewWhere,
  viewIsEmpty,
  describeView,
  type ViewDef,
  type ChannelRef,
} from "../lib/lead-views";

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

const channels: ChannelRef[] = [
  { id: "ch-elad", campaignId: "cmp-sale", isSale: true },
  { id: "ch-other", campaignId: "cmp-sale", isSale: true },
  { id: "ch-geo", campaignId: "cmp-mine", isSale: false },
  { id: "ch-tv", campaignId: "cmp-mine", isSale: false },
  { id: "ch-easy", campaignId: "cmp-easy", isSale: false },
];

const view = (over: Partial<ViewDef> = {}): ViewDef => ({
  id: "v1",
  name: "תצוגה",
  campaignIds: [],
  channelIds: [],
  includeSale: false,
  ...over,
});

/* ---------- אילו ערוצים נכללים ---------- */

test("קמפיין שנבחר מתרגם לכל הערוצים שבו", () => {
  const ids = channelsInView(view({ campaignIds: ["cmp-mine"] }), channels);
  assert.deepEqual(ids.sort(), ["ch-geo", "ch-tv"]);
});

test("ערוץ בודד שנבחר", () => {
  const ids = channelsInView(view({ channelIds: ["ch-easy"] }), channels);
  assert.deepEqual(ids, ["ch-easy"]);
});

test("קמפיין וערוץ יחד, בלי כפילות", () => {
  const ids = channelsInView(
    view({ campaignIds: ["cmp-mine"], channelIds: ["ch-geo", "ch-easy"] }),
    channels
  );

  assert.deepEqual(ids.sort(), ["ch-easy", "ch-geo", "ch-tv"]);
});

test("ערוץ שלא קיים יותר לא נכנס לתנאי", () => {
  // ערוץ שנמחק אחרי שהתצוגה נשמרה
  const ids = channelsInView(view({ channelIds: ["ch-gone"] }), channels);
  assert.deepEqual(ids, []);
});

/* ---------- התנאי ---------- */

test("בלי תצוגה - אין תנאי, נשארים ברשימה הרגילה", () => {
  assert.equal(viewWhere(null, channels), null);
});

test("תצוגה של ערוצים שלך - דורשת כניסה באותם ערוצים", () => {
  const where = viewWhere(view({ campaignIds: ["cmp-mine"] }), channels);

  assert.deepEqual(where?.entries.some.channelId.in.sort(), [
    "ch-geo",
    "ch-tv",
  ]);
});

test("בלי סימון מפורש, לידים של מכירה לא נכנסים גם בתצוגה", () => {
  /**
   * זה הכלל שלו: מה שקשור לקונה שייך אך ורק אליו. בחירת
   * תצוגה לא אמורה לשבור את זה בדלת האחורית.
   */
  const where = viewWhere(view({ campaignIds: ["cmp-sale"] }), channels);
  assert.equal(where?.entries.some.isSale, false);
});

test("עם סימון מפורש, לידים של מכירה כן נכנסים", () => {
  const where = viewWhere(
    view({ campaignIds: ["cmp-sale"], includeSale: true }),
    channels
  );

  assert.equal(where?.entries.some.isSale, undefined);
  assert.deepEqual(where?.entries.some.channelId.in.sort(), [
    "ch-elad",
    "ch-other",
  ]);
});

test("תצוגה ריקה מציגה כלום, לא הכל", () => {
  /**
   * תצוגה שנשמרה בטעות בלי בחירה הייתה מציגה את כל הלידים,
   * והוא היה חושב שהיא עובדת.
   */
  const where = viewWhere(view(), channels);
  assert.deepEqual(where?.entries.some.channelId.in, []);
});

test("תצוגה שכל הערוצים שבה נמחקו מציגה כלום", () => {
  const where = viewWhere(view({ channelIds: ["ch-gone"] }), channels);
  assert.deepEqual(where?.entries.some.channelId.in, []);
});

/* ---------- עזר ---------- */

test("זיהוי תצוגה בלי בחירה", () => {
  assert.equal(viewIsEmpty(view()), true);
  assert.equal(viewIsEmpty(view({ channelIds: ["ch-geo"] })), false);
});

test("תיאור התצוגה", () => {
  const text = describeView(
    view({ campaignIds: ["cmp-mine"], channelIds: ["ch-easy"] }),
    [{ id: "cmp-mine", name: "לידים רובי" }],
    [{ id: "ch-easy", name: "איזי פיזי" }]
  );

  assert.equal(text, "לידים רובי · איזי פיזי");
});

test("תיאור מציין כשהתצוגה כוללת מכירה", () => {
  const text = describeView(
    view({ campaignIds: ["cmp-sale"], includeSale: true }),
    [{ id: "cmp-sale", name: "מכירת לידים" }],
    []
  );

  assert.ok(text.includes("כולל מכירה"));
});

test("תיאור של תצוגה ריקה אומר את זה במפורש", () => {
  assert.equal(describeView(view(), [], []), "לא נבחר כלום");
});

console.log(`✓ lead-views: ${passed} בדיקות עברו`);
