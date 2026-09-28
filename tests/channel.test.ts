/**
 * ============================================================
 *  בדיקות ההפרדה בין שתי מערכות הלידים
 * ============================================================
 *
 *  הבדיקות האלה מתארות בדיוק את המקרים שקרו בפועל.
 *  אם מישהו ישבור את ההפרדה בעתיד - אחת מהן תיפול.
 *
 *  הרצה:  npx tsx tests/channel.test.ts
 */

import {
  channelOfEntry,
  entryCountIn,
  existsIn,
  lastEntryAtIn,
  isSameSubmission,
  mineOnly,
  saleOnly,
} from "../lib/channel";

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

const t = (iso: string) => new Date(iso);

// ------------------------------------------------------------
console.log("\nהמקרה של רינת — כניסה אחת אצלך, כניסה אחת אצל אלעד");
// ------------------------------------------------------------
{
  const rinat = [
    { isSale: false, campaign: "גאוגרפי", at: t("2026-09-27T09:00:00Z") },
    { isSale: true, campaign: "אלעד - מכירה", at: t("2026-09-28T09:00:00Z") },
  ];

  check("אצלך היא ליד יחיד, לא כפול", entryCountIn(rinat, "mine"), 1);
  check("אצל אלעד היא ליד יחיד, לא כפול", entryCountIn(rinat, "sale"), 1);
  check("היא קיימת ברשימה שלך", existsIn(rinat, "mine"), true);
  check("היא קיימת גם אצל אלעד", existsIn(rinat, "sale"), true);
  check(
    "התאריך שלך הוא של הכניסה שלך, לא של אלעד",
    lastEntryAtIn(rinat, "mine")?.toISOString(),
    "2026-09-27T09:00:00.000Z"
  );
  check("אצלך רואים כניסה אחת בלבד", mineOnly(rinat).length, 1);
  check("אצל אלעד רואים כניסה אחת בלבד", saleOnly(rinat).length, 1);
}

// ------------------------------------------------------------
console.log("\nכפול אמיתי — פעמיים באותו ערוץ");
// ------------------------------------------------------------
{
  const twiceMine = [
    { isSale: false, campaign: "גאוגרפי", at: t("2026-09-01T09:00:00Z") },
    { isSale: false, campaign: "גאוגרפי", at: t("2026-09-20T09:00:00Z") },
  ];
  check("פעמיים אצלך = כפול 2 אצלך", entryCountIn(twiceMine, "mine"), 2);
  check("ואצל אלעד אין כלום", entryCountIn(twiceMine, "sale"), 0);
  check("לא מופיע אצל אלעד בכלל", existsIn(twiceMine, "sale"), false);

  const twiceSale = [
    { isSale: true, campaign: "אלעד - מכירה", at: t("2026-09-01T09:00:00Z") },
    { isSale: true, campaign: "אלעד - מכירה", at: t("2026-09-20T09:00:00Z") },
  ];
  check("פעמיים אצל אלעד = כפול 2 אצלו", entryCountIn(twiceSale, "sale"), 2);
  check("ואצלך הוא לא מופיע בכלל", existsIn(twiceSale, "mine"), false);
}

// ------------------------------------------------------------
console.log("\nכניסה אצל אלעד לא מזיזה כלום אצלך");
// ------------------------------------------------------------
{
  const before = [
    { isSale: false, campaign: "גאוגרפי", at: t("2026-09-10T08:00:00Z") },
  ];
  const after = [
    ...before,
    { isSale: true, campaign: "אלעד - מכירה", at: t("2026-09-28T08:00:00Z") },
  ];

  check(
    "מספר הכניסות שלך לא השתנה",
    entryCountIn(after, "mine"),
    entryCountIn(before, "mine")
  );
  check(
    "תאריך הכניסה שלך לא השתנה",
    lastEntryAtIn(after, "mine")?.toISOString(),
    lastEntryAtIn(before, "mine")?.toISOString()
  );
}

// ------------------------------------------------------------
console.log('\n"אותה הגשה" — בתוך הערוץ בלבד');
// ------------------------------------------------------------
{
  const now = t("2026-09-28T10:00:00Z");

  // ליד מנגר ופייסבוק מביאים את אותה הגשה תוך דקות
  check(
    "אותה הגשה שלך תוך דקות = לא נספרת פעמיים",
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      entries: [
        { isSale: false, campaign: "גאוגרפי", at: t("2026-09-28T09:55:00Z") },
      ],
      now,
    }),
    true
  );

  // זה המקרה ששבר: כניסה אצלך ואז כניסה אצל אלעד
  check(
    "כניסה אצל אלעד אחרי כניסה שלך = כניסה חדשה, לא נבלעת",
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "sale",
      entries: [
        { isSale: false, campaign: "גאוגרפי", at: t("2026-09-28T09:55:00Z") },
      ],
      now,
    }),
    false
  );

  check(
    "כניסה שלך אחרי כניסה של אלעד = כניסה חדשה, לא נבלעת",
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      entries: [
        {
          isSale: true,
          campaign: "אלעד - מכירה",
          at: t("2026-09-28T09:55:00Z"),
        },
      ],
      now,
    }),
    false
  );

  check(
    "אותו מזהה הגשה של פייסבוק = אותה הגשה, תמיד",
    isSameSubmission({
      incomingFbId: "fb-123",
      knownFbId: "fb-123",
      channel: "mine",
      entries: [],
      now,
    }),
    true
  );

  check(
    "כניסה אמיתית חדשה אחרי שעות = לא אותה הגשה",
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      entries: [
        { isSale: false, campaign: "גאוגרפי", at: t("2026-09-28T06:00:00Z") },
      ],
      now,
    }),
    false
  );
}

// ------------------------------------------------------------
console.log("\nחותמת הערוץ היא הקובעת");
// ------------------------------------------------------------
{
  check(
    "כניסה מסומנת = מכירה",
    channelOfEntry({ isSale: true, campaign: "משהו" }),
    "sale"
  );
  check(
    "כניסה לא מסומנת = שלך",
    channelOfEntry({ isSale: false, campaign: "משהו" }),
    "mine"
  );
  check(
    "כניסה ישנה בלי חותמת = שלך, לא נעלמת",
    channelOfEntry({ campaign: "משהו" }),
    "mine"
  );
  check("ליד בלי שום כניסה לא קיים באף ערוץ", existsIn([], "mine"), false);
  check("ואין לו תאריך", lastEntryAtIn([], "mine"), null);
}

// ------------------------------------------------------------
console.log(
  `\n${passed} בדיקות עברו, ${failed} נכשלו\n`
);

if (failed > 0) process.exit(1);
