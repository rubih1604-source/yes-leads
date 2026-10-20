import assert from "node:assert/strict";
import {
  planManualLead,
  duplicateAction,
  originFor,
  MANUAL_SOURCE,
} from "../lib/manual-lead";
import { pickFields, DELIVERY_FIELDS } from "../lib/delivery-payload";

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


/* ---------- ליד ידני ---------- */

test("בלי טלפון - שגיאה בעברית", () => {
  const r = planManualLead({ firstName: "אלעד" });
  eq(r.ok, false);
  if (!r.ok) eq(r.error, "חייב טלפון");
});

test("טלפון לא תקין - שגיאה", () => {
  const r = planManualLead({ phone: "123" });
  eq(r.ok, false);
});

test("טלפון ישראלי מנורמל", () => {
  const r = planManualLead({ phone: "052-123-4567" });
  ok(r.ok);
  if (r.ok) eq(r.phone, "+972521234567");
});

test("אותו מספר בשתי צורות נותן אותו טלפון", () => {
  const a = planManualLead({ phone: "0521234567" });
  const b = planManualLead({ phone: "+972-52-123-4567" });
  ok(a.ok && b.ok);
  if (a.ok && b.ok) eq(a.phone, b.phone);
});

test("שם לא חובה - ליד אמיתי מגיע לפעמים בלי שם", () => {
  const r = planManualLead({ phone: "0521234567" });
  ok(r.ok);
  if (r.ok) {
    eq(r.firstName, null);
    eq(r.lastName, null);
  }
});

test("רווחים בלבד בשם נחשבים לריק", () => {
  const r = planManualLead({ phone: "0521234567", firstName: "   " });
  ok(r.ok);
  if (r.ok) eq(r.firstName, null);
});

test("extra נשמר באותם מפתחות שהוובוק מייצר", () => {
  const r = planManualLead({
    phone: "0521234567",
    email: "a@b.com",
    campaign: "מצטרפים ל-yes",
    supplier: "הוט",
  });
  ok(r.ok);
  if (r.ok) {
    eq(r.extra.email, "a@b.com");
    eq(r.extra.fb_campaign, "מצטרפים ל-yes");
    eq(r.extra.supplier_question, "הוט");
  }
});

test("ליד ידני מסומן כידני", () => {
  const r = planManualLead({ phone: "0521234567" });
  ok(r.ok);
  if (r.ok) eq(r.extra.manual, "1");
});

test("שדות ריקים לא נכנסים ל-extra", () => {
  const r = planManualLead({ phone: "0521234567", email: "  " });
  ok(r.ok);
  if (r.ok) eq("email" in r.extra, false);
});

test("ערוץ ריק = הליד נשאר שלך", () => {
  const r = planManualLead({ phone: "0521234567", channelId: "  " });
  ok(r.ok);
  if (r.ok) eq(r.channelId, null);
});

/* ---------- הכלל שנשבר כל גרסה ---------- */

test("טלפון קיים = כניסה נוספת, לא דריסה ולא איחוד", () => {
  eq(duplicateAction(true), "add_entry");
  eq(duplicateAction(false), "create");
});

test("ליד ידני לערוץ מכירה הוא של הקונה בלבד", () => {
  eq(originFor(true), "sale");
});

test("ליד ידני אישי מקבל leadmanager כדי לא להיעלם מדוחות", () => {
  eq(originFor(false), "leadmanager");
});

test("יש סימון מקור לליד ידני", () => {
  ok(MANUAL_SOURCE.length > 0);
});

/* ---------- בחירת שדות ---------- */

const full: Record<string, string> = {
  full_name: "אלעד מור יוסף",
  first_name: "אלעד",
  last_name: "מור יוסף",
  phone: "+972521234567",
  email: "a@b.com",
  address: "תל אביב",
  campaign: "קמפיין",
  ad: "מודעה",
  form: "טופס",
  supplier_question: "הוט",
  fb_leadid: "123",
  created_at: "2026-10-20T00:00:00.000Z",
};

test("רשימה ריקה = שולח הכל, לא כלום", () => {
  eq(Object.keys(pickFields(full, [])).length, Object.keys(full).length);
  eq(Object.keys(pickFields(full, null)).length, Object.keys(full).length);
  eq(Object.keys(pickFields(full, undefined)).length, Object.keys(full).length);
});

test("רק מה שסומן נשלח", () => {
  const out = pickFields(full, ["full_name", "phone"]);
  eq(Object.keys(out).length, 2);
  eq(out.full_name, "אלעד מור יוסף");
  eq(out.phone, "+972521234567");
  eq("email" in out, false);
});

test("הסדר קבוע לפי DELIVERY_FIELDS ולא לפי סדר הסימון", () => {
  const a = Object.keys(pickFields(full, ["phone", "full_name"]));
  const b = Object.keys(pickFields(full, ["full_name", "phone"]));
  eq(a.join(","), b.join(","));
  eq(a[0], "full_name");
});

test("סימון של שדה שלא קיים במטען לא ממציא אותו", () => {
  const out = pickFields({ phone: "1" }, ["phone", "email"]);
  eq(Object.keys(out).length, 1);
});

test("רווחים בסימון לא מפילים את הבחירה", () => {
  const out = pickFields(full, [" phone ", ""]);
  eq(Object.keys(out).length, 1);
  eq(out.phone, "+972521234567");
});

test("כל 12 השדות ניתנים לבחירה", () => {
  const keys = DELIVERY_FIELDS.map((f) => f.key);
  const out = pickFields(full, keys);
  eq(Object.keys(out).length, keys.length);
});

test("אין שדה בלי תווית בעברית", () => {
  for (const f of DELIVERY_FIELDS) ok(f.label.trim().length > 0);
});

console.log(`✓ manual-lead: ${passed} בדיקות עברו`);
