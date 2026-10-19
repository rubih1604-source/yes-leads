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
  ownerOf,
  existsIn,
  lastEntryAtIn,
  isSameSubmission,
  isStatusUpdate,
  mineOnly,
  saleOnly,
  MY_LEADS_WHERE,
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
console.log("\nהמקרה של רינת — נכנסה אצלך, ואחר כך מקמפיין של אלעד");
// ------------------------------------------------------------
{
  const rinat = [
    { isSale: false, campaign: "גאוגרפי", at: t("2026-09-27T09:00:00Z") },
    { isSale: true, campaign: "אלעד - מכירה", at: t("2026-09-28T09:00:00Z") },
  ];

  /**
   * הכלל, במילים שלו: "מה שנכנס שהוא קשור לאלעד בהגדרה
   * שייך אך ורק אליו, אין לערב עם הנתונים של מערכת
   * הלידים האישית שלי."
   *
   * כאן הייתה הטעות שחזרה: היה כתוב שליד עם כניסה אחת
   * שלך נשאר גם שלך. התוצאה בפועל - הליד נשאר ברשימה
   * שלו, עם שתי כניסות ותווית "ליד כפול".
   */
  check("הליד עובר לאלעד ויוצא מהרשימה שלך", ownerOf(rinat), "sale");

  check("אצלך היא ליד יחיד, לא כפול", entryCountIn(rinat, "mine"), 1);
  check("אצל אלעד היא ליד יחיד, לא כפול", entryCountIn(rinat, "sale"), 1);
  check(
    "התאריך שלך הוא של הכניסה שלך, לא של אלעד",
    lastEntryAtIn(rinat, "mine")?.toISOString(),
    "2026-09-27T09:00:00.000Z"
  );
  check("אצלך רואים כניסה אחת בלבד", mineOnly(rinat).length, 1);
  check("אצל אלעד רואים כניסה אחת בלבד", saleOnly(rinat).length, 1);
}

// ------------------------------------------------------------
console.log("\nשל מי הליד");
// ------------------------------------------------------------
{
  check(
    "כניסה אחת של מכירה מספיקה כדי שהליד יהיה של הקונה",
    ownerOf([{ isSale: true, at: t("2026-10-01T09:00:00Z") }]),
    "sale"
  );

  check(
    "ליד שכל כניסותיו שלך נשאר שלך",
    ownerOf([
      { isSale: false, at: t("2026-10-01T09:00:00Z") },
      { isSale: false, at: t("2026-10-02T09:00:00Z") },
    ]),
    "mine"
  );

  check(
    "סדר הכניסות לא משנה - גם אם המכירה ראשונה",
    ownerOf([
      { isSale: true, at: t("2026-10-01T09:00:00Z") },
      { isSale: false, at: t("2026-10-02T09:00:00Z") },
    ]),
    "sale"
  );

  check("ליד בלי כניסות נשאר שלך", ownerOf([]), "mine");
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

  /**
   * כאן הייתה הטעות היקרה: החלון היה 24 שעות, ולכן הגעה
   * אמיתית של אותו אדם באותו יום נבלעה והליד לא הופיע
   * ברשימה. החלון קיים רק לאותה הגשה שמגיעה משתי דלתות
   * בהפרש של דקות.
   */
  check(
    "בלי מזהה הגשה, הפרש של שעות = הגעה חדשה",
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

  check(
    "אותה הגשה משתי דלתות, בהפרש של דקה = לא כפול",
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      entries: [
        { isSale: false, campaign: "גאוגרפי", at: t("2026-09-28T11:59:00Z") },
      ],
      now: t("2026-09-28T12:00:00Z"),
    }),
    true
  );

  check(
    "הגעה 40 דקות אחר כך כבר נספרת",
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      entries: [
        { isSale: false, campaign: "גאוגרפי", at: t("2026-09-28T11:20:00Z") },
      ],
      now: t("2026-09-28T12:00:00Z"),
    }),
    false
  );

  check(
    "אבל עם מזהה הגשה שונה — הגעה חדשה, גם אחרי שעות",
    isSameSubmission({
      incomingFbId: "fb-222",
      knownFbId: "fb-111",
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
console.log("\nכל הגעה נספרת — גם ארבע פעמים ביום");
// ------------------------------------------------------------
{
  /**
   * הכלל שלו, במילים שלו: "גם אם נכנס ביום 4 פעמים אותו
   * ליד — הוא יופיע ברשימה עם תווית ליד כפול".
   *
   * כאן נבלעה בדיוק ההגעה שקרתה: חלון של 24 שעות שקבעתי
   * גרם לכך שהליד לא הופיע ביום שבו נכנס.
   */
  const day = "2026-10-19";
  const arrivals = [
    t(`${day}T06:00:00Z`),
    t(`${day}T09:30:00Z`),
    t(`${day}T13:00:00Z`),
  ];

  const entries = arrivals.map((at) => ({
    isSale: false,
    campaign: "גאוגרפי",
    at,
  }));

  check(
    "הגעה רביעית באותו יום היא הגעה, לא כפילות",
    isSameSubmission({
      incomingFbId: null,
      knownFbId: null,
      channel: "mine",
      entries,
      now: t(`${day}T17:00:00Z`),
    }),
    false
  );

  check(
    "ארבע הגעות = ארבע כניסות אצלך",
    entryCountIn(
      [
        ...entries,
        { isSale: false, campaign: "גאוגרפי", at: t(`${day}T17:00:00Z`) },
      ],
      "mine"
    ),
    4
  );

  check(
    "ואותו דבר בערוץ המכירה",
    entryCountIn(
      arrivals.map((at) => ({ isSale: true, campaign: "אלעד", at })),
      "sale"
    ),
    3
  );
}

// ------------------------------------------------------------
console.log("\nעדכון סטטוס אינו הגעה — לפי תוכן, לא לפי שעון");
// ------------------------------------------------------------
{
  /**
   * ליד מנגר שולחת webhook גם כששינית סטטוס. ההבחנה נעשית
   * לפי **מה שהגיע** ולא לפי כמה זמן עבר: הגשה חדשה באה
   * בלי סטטוס או עם סטטוס התחלתי, ועדכון נושא סטטוס מתקדם
   * על ליד שכבר קיים.
   */
  check(
    "סטטוס מתקדם על ליד קיים = עדכון, לא הגעה",
    isStatusUpdate({
      incomingStatus: "אין מענה",
      hasSubmissionId: false,
      leadExists: true,
    }),
    true
  );

  check(
    "סטטוס התחלתי = הגעה אמיתית",
    isStatusUpdate({
      incomingStatus: "חדש",
      hasSubmissionId: false,
      leadExists: true,
    }),
    false
  );

  check(
    "לקוח קיים הוא גם סטטוס התחלתי",
    isStatusUpdate({
      incomingStatus: "לקוח קיים",
      hasSubmissionId: false,
      leadExists: true,
    }),
    false
  );

  check(
    "בלי סטטוס בכלל = הגעה",
    isStatusUpdate({
      incomingStatus: null,
      hasSubmissionId: false,
      leadExists: true,
    }),
    false
  );

  check(
    "ליד חדש לגמרי הוא תמיד הגעה",
    isStatusUpdate({
      incomingStatus: "אין מענה",
      hasSubmissionId: false,
      leadExists: false,
    }),
    false
  );

  check(
    "הגשה עם מזהה פייסבוק היא תמיד הגעה, גם עם סטטוס",
    isStatusUpdate({
      incomingStatus: "אין מענה",
      hasSubmissionId: true,
      leadExists: true,
    }),
    false
  );
}

// ------------------------------------------------------------

console.log("\nמי נכנס לרשימת הלידים — וואטסאפ אף פעם לא");
// ------------------------------------------------------------
{
  /**
   * הבדיקה הזו נולדה מתקלה אמיתית: אנשים ששלחו הודעת
   * וואטסאפ בלבד התחילו להופיע כלידים, כי אחד הענפים
   * בסינון נשאר בלי תנאי בעלות.
   *
   * במקום לבדוק מסך, בודקים את ההגדרה עצמה: **בכל ענף**
   * חייב להיות תנאי בעלות, ובשום ענף אסור שוואטסאפ יתקבל.
   */
  const where = MY_LEADS_WHERE as Record<string, any>;

  // --- וואטסאפ לא נכנס ---
  check(
    "ההגדרה פוסלת וואטסאפ במפורש",
    where.origin?.not === "whatsapp",
    true
  );

  // --- ליד של הקונה לא נכנס ---
  check(
    "ההגדרה דורשת שלא תהיה אף כניסת מכירה",
    where.entries?.none?.isSale === true,
    true
  );

  /**
   * ההגדרה חייבת לפסול **כל** ליד שיש לו כניסת מכירה, לא
   * רק ליד שכולו מכירה. זה הכלל שנשבר שוב ושוב.
   */
  check(
    "אין בהגדרה תנאי שמחזיר ליד עם כניסת מכירה",
    JSON.stringify(where).includes('"isSale":false'),
    false
  );

  check(
    "ההגדרה לא מכילה ענפי OR שיכולים לעקוף את התנאי",
    where.OR === undefined,
    true
  );
}

// ------------------------------------------------------------
console.log(
  `\n${passed} בדיקות עברו, ${failed} נכשלו\n`
);

if (failed > 0) process.exit(1);
