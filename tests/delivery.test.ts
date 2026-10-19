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
  parseHeaders,
  headersToText,
  renderTemplate,
  checkTemplate,
  deliveryVerdict,
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

function group(title: string) {
  console.log(`\n${title}`);
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


/* ============================================================
   Headers חופשיים — המפרט האמיתי של אלעד
   ============================================================ */

group("Headers");

{
  const parsed = parseHeaders("X-API-Key=af_b376e16ec3e42469851c");

  check(
    "כותרת בשם מותאם נקראת נכון",
    parsed["X-API-Key"],
    "af_b376e16ec3e42469851c"
  );
}

{
  // מפתחות API מכילים לעיתים "=" בתוך הערך
  const parsed = parseHeaders("X-API-Key=abc=def==");
  check("פיצול רק על ההופעה הראשונה", parsed["X-API-Key"], "abc=def==");
}

{
  const parsed = parseHeaders("Authorization: Bearer xyz");
  check("גם בסגנון נקודתיים", parsed["Authorization"], "Bearer xyz");
}

{
  const parsed = parseHeaders(
    "X-API-Key=one\n\n# הערה\nX-Account=two\nשורה-בלי-ערך=\n=בלי-שם"
  );

  check("שתי כותרות נקראו", Object.keys(parsed).length, 2);
  check("כותרת ראשונה", parsed["X-API-Key"], "one");
  check("כותרת שנייה", parsed["X-Account"], "two");
}

{
  check("קלט ריק לא מייצר כותרות", Object.keys(parseHeaders("")).length, 0);
}

{
  const text = headersToText({ "X-API-Key": "k", "X-Account": "a" });
  check("חזרה לטקסט לעריכה", text, "X-API-Key=k\nX-Account=a");
  check("הלוך וחזור שומר על הערכים", parseHeaders(text)["X-API-Key"], "k");
}

/* ============================================================
   תבנית גוף השידור
   ============================================================ */

group("תבנית השידור");

{
  /** בדיוק המבנה מהמפרט של אלעד */
  const template = `{
  "name": "{full_name}",
  "phone": "{phone}",
  "email": "{email}",
  "engagement_score": "90",
  "notes": "leadmanager"
}`;

  const body = renderTemplate(template, {
    full_name: "ישראל ישראלי",
    phone: "+972521234567",
    email: "a@b.com",
  });

  const parsed = JSON.parse(body);

  check("השם הוחלף", parsed.name, "ישראל ישראלי");
  check("הטלפון הוחלף", parsed.phone, "+972521234567");
  check('הדוא"ל הוחלף', parsed.email, "a@b.com");
  check("שדה קבוע נשמר", parsed.engagement_score, "90");
  check("הערה קבועה נשמרה", parsed.notes, "leadmanager");
}

{
  // שדה חסר לא שובר את ה-JSON
  const body = renderTemplate('{"name":"{full_name}","email":"{email}"}', {
    full_name: "דני",
  });

  check("שדה חסר נשלח ריק", JSON.parse(body).email, "");
  check("והשם נשאר", JSON.parse(body).name, "דני");
}

{
  /**
   * שם עם מרכאות הוא מה שהופך תבנית תקינה לבקשה שנדחית.
   * חייב לצאת JSON תקין.
   */
  const body = renderTemplate('{"name":"{full_name}"}', {
    full_name: 'דני "הגדול"',
  });

  check("מרכאות בשם לא שוברות את ה-JSON", JSON.parse(body).name, 'דני "הגדול"');
}

{
  const body = renderTemplate('{"notes":"{full_name}"}', {
    full_name: "שורה\nשנייה",
  });

  check("ירידת שורה לא שוברת", JSON.parse(body).notes, "שורה\nשנייה");
}

{
  const body = renderTemplate('{"p":"{phone}"}', { phone: "C:\\path" });
  check("לוכסן הפוך לא שובר", JSON.parse(body).p, "C:\\path");
}

group("בדיקת תקינות התבנית");

{
  const good = checkTemplate('{"name":"{full_name}","phone":"{phone}"}');
  check("תבנית תקינה עוברת", good.ok, true);
  check("האסימונים זוהו", good.tokens.join(","), "full_name,phone");
}

{
  const broken = checkTemplate('{"name":"{full_name}",}');
  check("JSON שבור נתפס", broken.ok, false);
  check("יש הסבר", Boolean(broken.error), true);
}

{
  const unknown = checkTemplate('{"x":"{no_such_field}"}');
  check("אסימון לא מוכר נתפס", unknown.ok, false);
  check(
    "ההודעה מציינת את האסימון",
    unknown.error?.includes("no_such_field"),
    true
  );
}

{
  check("תבנית ריקה נתפסת", checkTemplate("   ").ok, false);
}

// ------------------------------------------------------------
console.log("\nהאם השליחה באמת הצליחה");
// ------------------------------------------------------------
{
  // בלי סימנים מוגדרים - קוד HTTP מכריע, כמו עד היום
  check(
    "200 בלי סימנים = הצליח",
    deliveryVerdict({ httpStatus: 200, body: "OK" }).ok,
    true
  );
  check(
    "500 בלי סימנים = נכשל",
    deliveryVerdict({ httpStatus: 500, body: "" }).ok,
    false
  );

  /**
   * המקרה האמיתי שבגללו זה נבנה: הקונה מחזיר 200 ואומר
   * בגוף התשובה שהליד נדחה. בלי הבדיקה היינו מסמנים
   * "נשלח" לליד שלא נכנס אצלו.
   */
  check(
    "200 עם סימן כשלון = נכשל",
    deliveryVerdict({
      httpStatus: 200,
      body: '{"status":"error","message":"duplicate"}',
      failureContains: '"status":"error"',
    }).ok,
    false
  );

  check(
    "סיבת הכשלון נרשמת, כדי שתדע למה",
    deliveryVerdict({
      httpStatus: 200,
      body: '{"status":"error"}',
      failureContains: '"status":"error"',
    }).reason?.includes("error"),
    true
  );

  check(
    "סימן הצלחה שמופיע = הצליח",
    deliveryVerdict({
      httpStatus: 200,
      body: '{"success":true,"id":912}',
      successContains: '"success":true',
    }).ok,
    true
  );

  check(
    "סימן הצלחה שלא מופיע = נכשל, גם ב-200",
    deliveryVerdict({
      httpStatus: 200,
      body: '{"ok":false}',
      successContains: '"success":true',
    }).ok,
    false
  );

  check(
    "סימן כשלון גובר על סימן הצלחה",
    deliveryVerdict({
      httpStatus: 200,
      body: '{"success":true,"warning":"rejected"}',
      successContains: '"success":true',
      failureContains: "rejected",
    }).ok,
    false
  );

  check(
    "סימן ריק נחשב כאין סימן",
    deliveryVerdict({ httpStatus: 200, body: "x", successContains: "   " }).ok,
    true
  );

  check(
    "201 נחשב הצלחה",
    deliveryVerdict({ httpStatus: 201, body: "" }).ok,
    true
  );

  check(
    "גוף תשובה ריק עם דרישת סימן = נכשל ולא מסומן בטעות",
    deliveryVerdict({ httpStatus: 200, body: "", successContains: "ok" }).ok,
    false
  );
}

console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
