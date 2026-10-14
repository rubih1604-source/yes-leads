import assert from "node:assert/strict";
import {
  doorOf,
  doors,
  addDoor,
  doorLabel,
  cameFromFacebook,
  leadIdsInLog,
  DOOR_FACEBOOK,
  DOOR_LEADMANAGER,
} from "../lib/via";

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

/* ---------- doorOf ---------- */

test("החיבור הישיר מזוהה לפי הסימון שלו", () => {
  assert.equal(doorOf({ _source: "facebook", phone: "0521234567" }), "facebook");
});

test("בלי סימון - ליד מנגר, כי זו הדלת הקיימת", () => {
  assert.equal(doorOf({ phone: "0521234567" }), DOOR_LEADMANAGER);
});

test("גוף ריק או לא אובייקט לא מפיל כלום", () => {
  assert.equal(doorOf(null), DOOR_LEADMANAGER);
  assert.equal(doorOf("text"), DOOR_LEADMANAGER);
  assert.equal(doorOf([{ _source: "facebook" }]), DOOR_LEADMANAGER);
});

test("סימון ריק נחשב כאין סימון", () => {
  assert.equal(doorOf({ _source: "   " }), DOOR_LEADMANAGER);
  assert.equal(doorOf({ _source: 7 }), DOOR_LEADMANAGER);
});

test("רווחים מסביב לסימון לא יוצרים דלת שלישית", () => {
  assert.equal(doorOf({ _source: " facebook " }), "facebook");
});

/* ---------- doors ---------- */

test("פירוק רשימת דלתות", () => {
  assert.deepEqual(doors("facebook,leadmanager"), ["facebook", "leadmanager"]);
  assert.deepEqual(doors("facebook"), ["facebook"]);
});

test("ערך חסר מחזיר רשימה ריקה ולא נופל", () => {
  assert.deepEqual(doors(null), []);
  assert.deepEqual(doors(undefined), []);
  assert.deepEqual(doors(""), []);
});

test("פסיקים מיותרים לא יוצרים דלתות ריקות", () => {
  assert.deepEqual(doors("facebook,,leadmanager,"), [
    "facebook",
    "leadmanager",
  ]);
});

/* ---------- addDoor ---------- */

test("דלת ראשונה נרשמת", () => {
  assert.equal(addDoor(null, DOOR_FACEBOOK), "facebook");
});

test("דלת שנייה נוספת בסדר שבו הגיעה", () => {
  assert.equal(addDoor("facebook", "leadmanager"), "facebook,leadmanager");
  assert.equal(addDoor("leadmanager", "facebook"), "leadmanager,facebook");
});

test("אותה דלת שוב לא כותבת לבסיס הנתונים", () => {
  // null = אין מה לשנות. התראה חוזרת מפייסבוק לא תייצר עדכון מיותר.
  assert.equal(addDoor("facebook", "facebook"), null);
  assert.equal(addDoor("facebook,leadmanager", "leadmanager"), null);
});

test("דלת ריקה לא נרשמת", () => {
  assert.equal(addDoor("facebook", "  "), null);
});

test("שתי דלתות נשמרות פעם אחת גם בהתראות חוזרות", () => {
  let via: string | null = null;

  for (const door of ["facebook", "leadmanager", "facebook", "leadmanager"]) {
    const next = addDoor(via, door);
    if (next) via = next;
  }

  assert.equal(via, "facebook,leadmanager");
});

/* ---------- doorLabel ---------- */

test("תווית בעברית", () => {
  assert.equal(doorLabel("facebook"), "ישירות מפייסבוק");
  assert.equal(doorLabel("leadmanager"), "ליד מנגר");
});

test("שתי דלתות מוצגות יחד - זו ההוכחה שהחיבור הישיר עובד", () => {
  assert.equal(doorLabel("facebook,leadmanager"), "ישירות מפייסבוק + ליד מנגר");
});

test("ליד ותיק בלי דלת לא מציג כלום במקום להמציא", () => {
  assert.equal(doorLabel(null), "");
  assert.equal(doorLabel(""), "");
});

test("דלת לא מוכרת מוצגת כמו שהיא ולא נעלמת", () => {
  assert.equal(doorLabel("zapier"), "zapier");
});

/* ---------- cameFromFacebook ---------- */

test("זיהוי הגעה מהחיבור הישיר", () => {
  assert.equal(cameFromFacebook("facebook"), true);
  assert.equal(cameFromFacebook("leadmanager,facebook"), true);
  assert.equal(cameFromFacebook("leadmanager"), false);
  assert.equal(cameFromFacebook(null), false);
});

/* ---------- leadIdsInLog ---------- */

/** המבנה האמיתי שנשמר ביומן: ההתראה של פייסבוק + הפרטים שנמשכו */
const realLog = {
  התראה_מפייסבוק: {
    object: "page",
    entry: [
      {
        id: "102938475610293",
        time: 1760000000,
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: "1234567890123456",
              page_id: "102938475610293",
              form_id: "998877665544332",
            },
          },
        ],
      },
    ],
  },
  פרטי_הליד_שנמשכו: {
    full_name: "ישראל ישראלי",
    phone_number: "+972521234567",
    fb_leadid: "1234567890123456",
    _source: "facebook",
  },
};

test("מזהה הליד נשלף מהמבנה האמיתי של היומן", () => {
  assert.deepEqual(leadIdsInLog(realLog), ["1234567890123456"]);
});

test("אותו מזהה בשני מקומות נספר פעם אחת", () => {
  // leadgen_id ו-fb_leadid הם אותו מזהה. אסור שייחשבו כשני לידים.
  assert.equal(leadIdsInLog(realLog).length, 1);
});

test("שורה בלי מזהה לא מחזירה כלום במקום להמציא", () => {
  assert.deepEqual(leadIdsInLog({ object: "page", entry: [] }), []);
  assert.deepEqual(leadIdsInLog(null), []);
  assert.deepEqual(leadIdsInLog("text"), []);
});

test("מזהה שהוא לא טקסט לא נכנס", () => {
  assert.deepEqual(leadIdsInLog({ leadgen_id: 12345 }), []);
  assert.deepEqual(leadIdsInLog({ fb_leadid: "   " }), []);
});

test("שני לידים בהתראה אחת - שניהם נשלפים", () => {
  const two = {
    entry: [
      { changes: [{ value: { leadgen_id: "111" } }] },
      { changes: [{ value: { leadgen_id: "222" } }] },
    ],
  };

  assert.deepEqual(leadIdsInLog(two).sort(), ["111", "222"]);
});

test("מבנה עמוק מדי לא תוקע את הסריקה", () => {
  // הגנה על עומק: שורת יומן פגומה לא אמורה להפיל את התחזוקה
  let deep: Record<string, unknown> = { fb_leadid: "999" };
  for (let i = 0; i < 50; i++) deep = { nested: deep };

  assert.doesNotThrow(() => leadIdsInLog(deep));
});

console.log(`✓ via: ${passed} בדיקות עברו`);
