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
  campaign: string | null | undefined
): Promise<{ channel: Channel; isSale: boolean; price: number }> {
  const { salesPriceFor } = await import("./sales-campaigns");
  const price = await salesPriceFor(campaign);
  return price === null
    ? { channel: "mine", isSale: false, price: 0 }
    : { channel: "sale", isSale: true, price };
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
 * כשאין מזהה הגשה של פייסבוק, החלון ארוך בהרבה.
 *
 * ליד מנגר שולח webhook גם כשמשתנה **סטטוס**, לא רק
 * כשנכנס ליד חדש. בלי מזהה הגשה אין איך להבדיל, וחלון של
 * 15 דקות אומר שכל שינוי סטטוס שעשית נרשם ככניסה חדשה:
 * הליד קיבל תאריך של היום, נספר כ"כפול", וסינון לפי
 * תקופה הפסיק להיות אמין.
 *
 * אדם שבאמת ממלא את אותו טופס פעמיים באותו יום הוא מקרה
 * נדיר, ולספור אותו כאחד מזיק הרבה פחות מלהפוך כל עדכון
 * סטטוס לכניסה.
 */
export const SAME_SUBMISSION_MINUTES_NO_ID = 24 * 60;

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
  OR: [
    {
      // הדרך הרגילה: ליד אמיתי עם כניסה בערוץ שלך
      origin: { in: ["leadmanager", "sale"] },
      entries: { some: { isSale: false } },
    },
    {
      // ליד ותיק בלי אף כניסה רשומה
      origin: "leadmanager",
      entries: { none: {} },
    },
  ],
};
