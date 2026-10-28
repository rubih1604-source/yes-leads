/**
 * ============================================================
 *  שני ערוצים, לא מערכת אחת מעורבבת
 * ============================================================
 *
 *  במערכת יש **שתי מערכות לידים נפרדות** שחיות זו לצד זו:
 *
 *    1. הערוץ שלך    - הלידים שאתה עובד עליהם
 *    2. ערוץ המכירה  - הלידים שנמכרים (אלעד)
 *
 *  הכלל, במשפט אחד:
 *
 *    **מה שנכנס דרך קמפיין מכירה שייך אך ורק לערוץ המכירה,
 *      ולא מתערבב עם הנתונים של מערכת הלידים האישית שלך.**
 *
 *  מה שנגזר מזה, ואסור לשבור:
 *
 *  - "כפול" נספר **בתוך הערוץ בלבד**.
 *    רינת נכנסה פעם אחת אצלך ופעם אחת אצל אלעד?
 *    זו לא כפילות. אלה שתי כניסות בשתי מערכות שונות.
 *    היא ליד רגיל אצלך, וליד רגיל אצלו.
 *    רק אם היא הייתה נכנסת **פעמיים אצל אלעד** - זה כפול
 *    אצלו. ורק אם נכנסה פעמיים אצלך - כפול אצלך.
 *
 *  - כניסה של אלעד לא משנה כלום אצלך: לא את הסטטוס,
 *    לא את התאריך, ולא את מספר הכניסות.
 *
 *  - תווית "מכירה" לא מופיעה ברשימה שלך. הרשימה שלך
 *    מציגה רק את הערוץ שלך, ולכן אין מה לתייג שם.
 *
 *  הערוץ נקבע לפי הקמפיין שממנו הכניסה הגיעה, והוא
 *  **נחתם על הכניסה עצמה** ברגע שהיא נרשמת. ככה כניסה
 *  לא משנה ערוץ בדיעבד, וכל הספירות יציבות.
 */

/**
 * שים לב: אין כאן import של המסד בראש הקובץ.
 *
 * הקובץ הזה נטען גם ממסלולים שבהם ספריות של Node לא
 * נפתרות (instrumentation), וגם מהבדיקות. כל הלוגיקה כאן
 * היא חישוב טהור, והשליפה היחידה שצריכה מסד נטענת
 * בעצלתיים בתוך הפונקציה שמשתמשת בה.
 */

import type { LeadIdentifiers } from "./campaign-match";

/** הערך שנשמר ב-origin לליד ששייך למכירה */
export const SALE_ORIGIN = "sale";

export type Channel = "mine" | "sale";

/** כניסה כפי שהיא נשמרת - רק מה שצריך כדי להחליט על ערוץ */
export type EntryLike = {
  isSale?: boolean | null;
  campaign?: string | null;
  at?: Date | string | null;
};

/**
 * הערוץ של כניסה שכבר נרשמה.
 *
 * החותמת שעל הכניסה היא הקובעת - לא הקמפיין הנוכחי של
 * הליד ולא שדה origin. כניסה שנרשמה כמכירה נשארת מכירה,
 * גם אם הקמפיין ישונה או יימחק אחר כך.
 */
export function channelOfEntry(entry: EntryLike): Channel {
  return entry.isSale === true ? "sale" : "mine";
}

/** האם הכניסה הזו שייכת לערוץ שלך */
export function isMine(entry: EntryLike): boolean {
  return channelOfEntry(entry) === "mine";
}

/** האם הכניסה הזו שייכת לערוץ המכירה */
export function isSaleEntry(entry: EntryLike): boolean {
  return channelOfEntry(entry) === "sale";
}

/**
 * הערוץ של כניסה **חדשה** שנכנסת עכשיו, לפי הקמפיין שלה.
 *
 * מחזיר גם את המחיר, כדי שהכניסה תיחתם במחיר שהיה תקף
 * ברגע שהיא נכנסה. שינוי מחיר בעתיד לא ישכתב למפרע את
 * ההכנסה של כניסות ישנות.
 */
export async function channelForIncoming(
  incoming: string | null | undefined | LeadIdentifiers
): Promise<{
  channel: Channel;
  isSale: boolean;
  price: number;
  campaignName: string | null;
  matchedOn: string | null;
}> {
  /**
   * מקבלים גם שם בלבד וגם את כל המזהים.
   *
   * שם בלבד נשאר נתמך כדי שקוד ותיק לא יישבר, אבל הקליטה
   * מעבירה את כל המזהים - וזה מה שמונע מליד של קונה ליפול
   * לרשימה שלך כששם הקמפיין לא הגיע.
   */
  const ids: LeadIdentifiers =
    incoming === null || incoming === undefined || typeof incoming === "string"
      ? { campaign: incoming ?? null }
      : incoming;

  const { saleCampaignFor } = await import("./sales-campaigns");
  const hit = await saleCampaignFor(ids);

  return hit
    ? {
        channel: "sale",
        isSale: true,
        price: hit.price,
        campaignName: hit.name,
        matchedOn: hit.matchedOn,
      }
    : {
        channel: "mine",
        isSale: false,
        price: 0,
        campaignName: null,
        matchedOn: null,
      };
}

/** רק הכניסות של הערוץ שלך */
export function mineOnly<T extends EntryLike>(entries: T[]): T[] {
  return entries.filter(isMine);
}

/** רק הכניסות של ערוץ המכירה */
export function saleOnly<T extends EntryLike>(entries: T[]): T[] {
  return entries.filter(isSaleEntry);
}

/**
 * כמה פעמים הליד נכנס **בתוך ערוץ אחד**.
 *
 * זה המספר שמופיע בתווית "כפול·N", והוא הסיבה שהתווית
 * הזו לא תופיע יותר בגלל כניסה של אלעד.
 */
export function entryCountIn(entries: EntryLike[], channel: Channel): number {
  return entries.filter((e) => channelOfEntry(e) === channel).length;
}

/** האם הליד קיים בכלל בערוץ הזה */
export function existsIn(entries: EntryLike[], channel: Channel): boolean {
  return entries.some((e) => channelOfEntry(e) === channel);
}

/**
 * מתי הליד נכנס לאחרונה בערוץ הזה.
 *
 * זה מה שקובע את מקום הליד ברשימה. כניסה של אלעד לא
 * מקפיצה ליד לראש הרשימה שלך, כי היא לא בערוץ שלך.
 */
export function lastEntryAtIn(
  entries: EntryLike[],
  channel: Channel
): Date | null {
  let latest: Date | null = null;

  for (const e of entries) {
    if (channelOfEntry(e) !== channel) continue;
    if (!e.at) continue;

    const at = e.at instanceof Date ? e.at : new Date(e.at);
    if (Number.isNaN(at.getTime())) continue;
    if (!latest || at.getTime() > latest.getTime()) latest = at;
  }

  return latest;
}

/**
 * ============================================================
 *  "אותה הגשה" - בתוך הערוץ בלבד
 * ============================================================
 *
 *  ליד מנגר ופייסבוק רצים במקביל, ולכן אותה הגשה מגיעה
 *  פעמיים תוך שניות. בלי הבדיקה הזו כל ליד היה מסומן כפול.
 *
 *  אבל הבדיקה **חייבת להיות בתוך הערוץ**. קודם היא לא
 *  הייתה, ולכן קרה הדבר הבא: ליד נכנס אצלך, וחמש דקות
 *  אחר כך נכנס אצל אלעד - והמערכת אמרה "אותה הגשה" ובלעה
 *  את הכניסה של אלעד. שתי מערכות שונות, אי אפשר לבלוע
 *  כניסה של אחת בגלל השנייה.
 */
export const SAME_SUBMISSION_MINUTES = 15;

/**
 * ============================================================
 *  כל הגעה נספרת. נקודה.
 * ============================================================
 *
 *  הכלל שלך: **אם אותו אדם נכנס ארבע פעמים ביום, יש ארבע
 *  כניסות** - והליד מופיע ברשימה עם תווית "ליד כפול",
 *  בכל ערוץ לפי הכניסות שלו.
 *
 *  כאן עשיתי טעות שעלתה לך ביום עבודה: שמתי חלון של 24
 *  שעות על הגעה שאין לה מזהה הגשה, בהנחה ש"אדם שממלא את
 *  אותו טופס פעמיים ביום הוא מקרה נדיר". זו הייתה החלטה
 *  עסקית שלי במקומך, והיא גרמה לכך שהגעה אמיתית של היום
 *  נבלעה והליד לא הופיע.
 *
 *  מעכשיו החלון קיים רק למה שהוא נועד לו באמת: **אותה
 *  הגשה אחת שמגיעה משתי דלתות** - פייסבוק ישירות וליד
 *  מנגר - בהפרש של שניות עד דקות. עשר דקות מכסות את זה
 *  בשפע, כולל עיכוב של ליד מנגר. כל דבר מעבר לזה הוא
 *  הגעה חדשה שנרשמת ומופיעה ברשימה.
 */
export const SAME_SUBMISSION_MINUTES_NO_ID = 10;

/**
 * עדכון סטטוס הוא לא הגעה.
 *
 *  ליד מנגר שולחת webhook גם כששינית סטטוס, ולא רק כשנכנס
 *  ליד. פנייה כזו אסור שתיספר כהגעה - אחרת כל שינוי סטטוס
 *  היה מקפיץ את הליד לתאריך של היום ומסמן אותו כפול.
 *
 *  ההבחנה היא **לפי תוכן הפנייה ולא לפי שעון**: הגשה חדשה
 *  מגיעה בלי סטטוס, או עם סטטוס התחלתי. פנייה שנושאת
 *  סטטוס מתקדם על ליד שכבר קיים היא עדכון, לא הגעה.
 */
const INITIAL_STATUSES = ["חדש", "לקוח קיים"];

export function isStatusUpdate(args: {
  /** הסטטוס שהגיע בפנייה, אם הגיע */
  incomingStatus: string | null;
  /** האם יש מזהה הגשה של פייסבוק בפנייה */
  hasSubmissionId: boolean;
  /** האם הליד כבר קיים במערכת */
  leadExists: boolean;
}): boolean {
  // הגשה עם מזהה היא תמיד הגשה אמיתית
  if (args.hasSubmissionId) return false;

  if (!args.leadExists) return false;
  if (!args.incomingStatus) return false;

  return !INITIAL_STATUSES.includes(args.incomingStatus);
}

export function isSameSubmission(args: {
  /** מזהה ההגשה של פייסבוק בכניסה הנכנסת */
  incomingFbId: string | null;
  /** מזהה ההגשה שנשמר על הליד */
  knownFbId: string | null;
  /** הערוץ של הכניסה הנכנסת */
  channel: Channel;
  /** הכניסות שכבר נרשמו לליד */
  entries: EntryLike[];
  /** עכשיו - פרמטר כדי שאפשר יהיה לבדוק את זה */
  now?: Date;
}): boolean {
  // אותו מזהה הגשה של פייסבוק = ודאות מוחלטת שזו אותה הגשה
  if (args.incomingFbId && args.knownFbId === args.incomingFbId) return true;

  const now = args.now ?? new Date();

  /**
   * יש מזהה הגשה ושונה מהקודם -> זו באמת הגשה חדשה,
   * ואין צורך בחלון זמן בכלל.
   */
  const minutes = args.incomingFbId
    ? SAME_SUBMISSION_MINUTES
    : SAME_SUBMISSION_MINUTES_NO_ID;

  const window = minutes * 60 * 1000;

  // אחרת: כניסה **באותו ערוץ** מהזמן האחרון
  return args.entries.some((e) => {
    if (channelOfEntry(e) !== args.channel) return false;
    if (!e.at) return false;

    const at = e.at instanceof Date ? e.at : new Date(e.at);
    if (Number.isNaN(at.getTime())) return false;

    const gap = now.getTime() - at.getTime();
    return gap >= 0 && gap < window;
  });
}

/**
 * ============================================================
 *  מי נחשב "ליד שלי" - הגדרה אחת לכל המערכת
 * ============================================================
 *
 *  לפני זה כל מסך הגדיר לעצמו מי נכנס לרשימה, וההגדרות
 *  נפרדו זו מזו. ככה קרה שאנשים שרק שלחו הודעת וואטסאפ
 *  התחילו להופיע כלידים: מסך אחד עודכן והאחר לא.
 *
 *  מעכשיו יש הגדרה **אחת**, והיא נמצאת כאן. כל מסך שמציג
 *  לידים משתמש בה. שינוי במקום הזה משנה את כל המערכת יחד,
 *  ואי אפשר שמסך אחד "ישכח".
 *
 *  שלושת התנאים, לפי סדר חשיבות:
 *
 *   1. **וואטסאפ אף פעם לא ליד.** מי שכתב לך בוואטסאפ בלי
 *      שהגיע מליד מנגר יושב במסך השיחות בלבד. תמיד.
 *
 *   2. יש לו לפחות כניסה אחת **בערוץ שלך**. ליד שקיים רק
 *      אצל אלעד לא מופיע כאן.
 *
 *   3. ליד ותיק שנוצר לפני שהתחלנו לרשום כניסות בנפרד -
 *      נכנס לפי הבעלות, כדי ששום ליד ישן לא ייעלם.
 */
export const MY_LEADS_WHERE = {
  /**
   * ============================================================
   *  הבעלות היא מצב נוכחי, לא היסטוריה
   * ============================================================
   *
   *  **שתי גרסאות קודמות נכשלו, כל אחת מהצד השני:**
   *
   *  1. `entries: { none: { isSale: true } }` - ליד שנגע
   *     פעם אחת בקמפיין של אלעד נעלם מהרשימה שלך **לנצח**,
   *     גם כשמילא חודש אחר כך את הטופס שלך. זה הבאג שעלה
   *     לך בלידים במשך חודשים.
   *
   *  2. `entries: { some: { isSale: false } }` - התיקון
   *     שלי, והוא קלע לצד השני: כל מי שהעברת לאלעד המשיך
   *     להופיע אצלך, כי יש לו גם כניסה שלך.
   *
   *  **שתיהן שאלו על ההיסטוריה. השאלה הנכונה היא "של מי
   *  הליד עכשיו".**
   *
   *  והתשובה כבר שמורה: השדה origin מתעדכן בכל נקודה -
   *  הגעה חדשה שלך כותבת "leadmanager", הגעה דרך אלעד
   *  והעברה לפי סטטוס כותבות "sale". הכניסות נשארות
   *  להיסטוריה, לספירה ולתשלום, אבל הן כבר לא מכריעות
   *  מי מופיע איפה.
   *
   *  מה שזה נותן, בדיוק כמו שביקשת:
   *   - העברת ליד לאלעד -> יוצא מהרשימה שלך מיד
   *   - אותו אדם מילא שוב את הטופס שלך -> חוזר אליך
   *   - ליד שהגיע מקמפיין של אלעד -> אצלו בלבד
   */
  origin: { notIn: ["whatsapp", SALE_ORIGIN] },
};

export function ownerOf(origin: string): Channel {
  /**
   * אותו שדה בדיוק שהרשימה מסננת לפיו.
   *
   * קודם זה קרא את הכניסות והרשימה קראה משהו אחר, ולכן
   * כרטיס הליד יכול היה להגיד "שלך" על ליד שלא הופיע
   * ברשימה שלך. שתי הכרעות על אותה שאלה הן תמיד שתי
   * תשובות בסוף.
   */
  return origin === SALE_ORIGIN ? "sale" : "mine";
}

/**
 * ============================================================
 *  למה הליד הזה לא ברשימה שלך
 * ============================================================
 *
 *  **הסבר שחי ליד הכלל עצמו, בכוונה.**
 *
 *  עד היום הכלל היה ב-MY_LEADS_WHERE ואף אחד לא יכול היה
 *  להסביר אותו על ליד מסוים. התוצאה: כל פעם שליד לא הופיע,
 *  זה הפך לחקירה של שעה - שליפת יומן, צילומי מסך, וניחושים.
 *
 *  הפונקציה הזו עונה על השאלה הזו ישירות, והיא כאן ולא
 *  בקובץ אחר כדי שמי שישנה את הכלל יראה מיד שההסבר צמוד
 *  אליו וחייב להשתנות איתו.
 */
export type VisibilityEntry = {
  isSale: boolean;
  campaign?: string | null;
  channelName?: string | null;
};

export function explainVisibility(args: {
  origin: string;
  entries: VisibilityEntry[];
}): { inMyList: boolean; reason: string } {
  if (args.origin === "whatsapp") {
    return {
      inMyList: false,
      reason:
        "הגיע מוואטסאפ בלבד ולכן הוא איש קשר ולא ליד. נמצא במסך השיחות.",
    };
  }

  const saleEntries = args.entries.filter((e) => e.isSale);

  const where = [
    ...new Set(
      saleEntries.map(
        (e) => e.channelName || e.campaign || "ערוץ מכירה לא מזוהה"
      )
    ),
  ];

  if (args.origin === SALE_ORIGIN) {
    return {
      inMyList: false,
      reason: where.length
        ? `הבעלות הנוכחית שלו היא מכירה (${where.join(
            ", "
          )}) - או שהוא נכנס משם, או שהעברת אותו לשם לפי סטטוס. לכן הוא במסך מכירה ולא ברשימה שלך. הגעה חדשה שלו דרך קמפיין שלך תחזיר אותו אליך אוטומטית.`
        : "הבעלות הנוכחית שלו היא מכירה. לכן הוא במסך מכירה ולא ברשימה שלך.",
    };
  }

  const mine = args.entries.filter((e) => !e.isSale).length;

  return {
    inMyList: true,
    reason: saleEntries.length
      ? `מופיע ברשימה שלך. יש לו גם ${saleEntries.length} כניסות מכירה בהיסטוריה (${where.join(
          ", "
        )}) - הן נספרות ומשולמות, אבל הבעלות הנוכחית שלו שלך.`
      : `מופיע ברשימה שלך${mine ? ` · ${mine} כניסות` : ""}.`,
  };
}
