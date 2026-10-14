/**
 * בדיקות לשליחת לידים לקונים.
 * הרצה:  npx tsx tests/delivery.test.ts
 */

import {
  buildPayload,
  applyFieldMap,
  shouldRetry,
  retryDelayMinutes,
  isSuccess,
  MAX_ATTEMPTS,
} from "../lib/delivery-payload";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`      ציפינו: ${JSON.stringify(expected)}`);
    console.log(`      קיבלנו: ${JSON.stringify(actual)}`);
  }
}

const at = new Date("2026-10-13T09:00:00Z");

const lead = {
  firstName: "דנה",
  lastName: "כהן",
  phone: "+972521234567",
  status: "חדש",
  extra: {
    email: "dana@gmail.com",
    fb_campaign: "גאוגרפי דרום",
    fb_ad: "מודעה א",
    fb_leadid: "1139510082091369",
    supplier_question: "hot",
    address: "הרצל 5",
  },
};

console.log("\nהמטען הבסיסי");
{
  const p = buildPayload(lead, at);
  check("שם מלא מורכב משני החלקים", p.full_name, "דנה כהן");
  check("טלפון", p.phone, "+972521234567");
  check("מייל", p.email, "dana@gmail.com");
  check("קמפיין", p.campaign, "גאוגרפי דרום");
  check("מזהה פייסבוק", p.fb_leadid, "1139510082091369");
  check("שאלת ספק", p.supplier_question, "hot");
  check("מועד", p.created_at, "2026-10-13T09:00:00.000Z");
}

console.log("\nשדות חסרים לא מעלימים שדות");
{
  const bare = {
    firstName: null,
    lastName: null,
    phone: "+972500000000",
    status: "חדש",
    extra: null,
  };
  const p = buildPayload(bare, at);

  check("מספר השדות קבוע", Object.keys(p).length, 12);
  check("שם ריק ולא חסר", p.full_name, "");
  check("מייל ריק ולא חסר", p.email, "");
  check("טלפון עדיין שם", p.phone, "+972500000000");
}

console.log("\nמיפוי שדות לכל קונה");
{
  const p = buildPayload(lead, at);

  check(
    "בלי מיפוי - הכל כמו שהוא",
    applyFieldMap(p, null).phone,
    "+972521234567"
  );

  const renamed = applyFieldMap(p, { phone: "telephone", full_name: "name" });
  check("שם שדה הוחלף", renamed.telephone, "+972521234567");
  check("השם הישן נעלם", renamed.phone, undefined);
  check("שדה אחר לא נפגע", renamed.email, "dana@gmail.com");
  check("שדה שני הוחלף", renamed.name, "דנה כהן");

  const hidden = applyFieldMap(p, { email: "", address: "   " });
  check("ערך ריק = השדה לא נשלח", hidden.email, undefined);
  check("רווחים בלבד = גם לא נשלח", hidden.address, undefined);
  check("השאר נשאר", hidden.phone, "+972521234567");
}

console.log("\nמתי מנסים שוב");
{
  check("שרת נפל (500) - מנסים", shouldRetry(500, 1), true);
  check("אין תשובה בכלל - מנסים", shouldRetry(null, 1), true);
  check("עומס (429) - מנסים", shouldRetry(429, 1), true);
  check("פסק זמן (408) - מנסים", shouldRetry(408, 1), true);
  check("בקשה שגויה (400) - לא מנסים", shouldRetry(400, 1), false);
  check("אין הרשאה (401) - לא מנסים", shouldRetry(401, 1), false);
  check("לא נמצא (404) - לא מנסים", shouldRetry(404, 1), false);
  check(
    "אחרי מספר הניסיונות המרבי - עוצרים",
    shouldRetry(500, MAX_ATTEMPTS),
    false
  );
}

console.log("\nההמתנה גדלה בין ניסיונות");
{
  const delays = [0, 1, 2, 3, 4, 5].map(retryDelayMinutes);
  check("ההמתנות", delays, [1, 5, 20, 60, 60, 60]);

  const rising = delays.every((d, i) => i === 0 || d >= delays[i - 1]);
  check("אף פעם לא מתקצר", rising, true);
}

console.log("\nמה נחשב הצלחה");
{
  check("200", isSuccess(200), true);
  check("201", isSuccess(201), true);
  check("204", isSuccess(204), true);
  check("302 - לא הצלחה", isSuccess(302), false);
  check("400 - לא", isSuccess(400), false);
  check("500 - לא", isSuccess(500), false);
}

console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
