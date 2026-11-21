/**
 * ============================================================
 *  תצוגות שמורות של רשימת הלידים
 * ============================================================
 *
 *  ברירת המחדל מציגה את הרשימה הרגילה שלך. תצוגה שמורה
 *  מצמצמת אותה לקמפיינים ולערוצים שבחרת.
 *
 *  שתי נקודות שחשוב שיישארו נכונות:
 *
 *  1. **תצוגה היא הגדרה, לא צילום.** היא מתארת ערוצים, ולכן
 *     ליד שייכנס מחר לערוץ שבתצוגה יופיע בה מעצמו.
 *
 *  2. **תצוגה לא שוברת את הפרדת הערוצים.** לידים של מכירה
 *     נכנסים לתצוגה רק אם סימנת את זה במפורש. בלי הסימון,
 *     תצוגה שכוללת ערוץ מכירה עדיין לא תערב את הלידים שלו
 *     ברשימה האישית שלך.
 *
 *  הקובץ טהור - בלי מסד - כדי שבניית התנאי תהיה מכוסה
 *  בבדיקות. תנאי שגוי כאן מסתיים בלידים שנעלמים מהמסך.
 */

export type ViewDef = {
  id: string;
  name: string;
  campaignIds: string[];
  channelIds: string[];
  includeSale: boolean;
};

/** ערוץ כפי שהוא נחוץ כדי להרחיב קמפיין לערוצים שבו */
export type ChannelRef = {
  id: string;
  campaignId: string;
  isSale: boolean;
};

/**
 * אילו ערוצים התצוגה מכסה.
 *
 * קמפיין שנבחר מתורגם לכל הערוצים שבו, ואחר כך מצטרפים
 * הערוצים הבודדים. ערוץ שנבחר פעמיים נספר פעם אחת.
 */
export function channelsInView(
  view: ViewDef,
  channels: ChannelRef[]
): string[] {
  const picked = new Set<string>();

  const campaigns = new Set(view.campaignIds);

  for (const channel of channels) {
    if (campaigns.has(channel.campaignId)) picked.add(channel.id);
  }

  for (const id of view.channelIds) {
    if (channels.some((c) => c.id === id)) picked.add(id);
  }

  return [...picked];
}

/**
 * התנאי שבו הרשימה נשלפת.
 *
 * מחזיר null כשהתצוגה לא מצמצמת כלום - ואז נשארים בתנאי
 * הרגיל של הרשימה שלך.
 */
/**
 * ============================================================
 *  שם קמפיין מנוקה, להשוואה
 * ============================================================
 *
 *  **למה בכלל צריך את זה.** אותו קמפיין מגיע מפייסבוק
 *  בכמה כתיבים: עם מקף בהתחלה, בלי, עם רווח כפול, עם
 *  גרשיים שונים. ליד מנגר והחיבור הישיר גם מעבירים את
 *  השדה קצת אחרת.
 *
 *  השוואה מילה-במילה על הכתיבים האלה מפרידה קמפיין אחד
 *  לשניים - וזה בדיוק מה שקרה: 62 לידים נכנסו, והסינון
 *  הראה 6.
 */
export function campaignKey(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/["'`\u05F3\u05F4]/g, "")
    .replace(/[-–—_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type EntryCampaign = { campaign: string | null };

/**
 * כל הכתיבים שבפועל קיימים במסד עבור הקמפיינים שנבחרו.
 *
 * מחפשים לפי השם המנוקה, ומחזירים את השמות **כפי שהם
 * שמורים**, כי זה מה שהשאילתה צריכה להשוות אליו.
 */
export function spellingsOf(
  wantedNames: string[],
  seen: EntryCampaign[]
): string[] {
  const keys = new Set(wantedNames.map(campaignKey).filter(Boolean));

  const out = new Set<string>();

  for (const row of seen) {
    if (!row.campaign) continue;
    if (keys.has(campaignKey(row.campaign))) out.add(row.campaign);
  }

  return [...out];
}

export type ViewFilter = {
  entries: {
    some: Record<string, unknown>;
  };
} | null;

/**
 * ============================================================
 *  התנאי שבו הרשימה נשלפת
 * ============================================================
 *
 *  **הבאג שתוקן כאן, וזו אותה משפחה של כל השאר.**
 *
 *  הסינון הסתמך על `channelId` **בלבד** - מפתח שנכתב רק
 *  כשהקליטה הצליחה לקשר את הכניסה לערוץ מוגדר. קמפיין
 *  חדש בפייסבוק שעדיין לא הוגדר כערוץ אצלנו? `channelId`
 *  נשאר ריק, והליד **נעלם מהסינון** - למרות ששם הקמפיין
 *  שמור עליו במלואו.
 *
 *  לכן 62 לידים נכנסו ורק 6 נספרו: ל-6 במקרה נמצאה
 *  התאמה לערוץ, ול-56 לא.
 *
 *  מהיום הסינון שואל גם את מה שבאמת הגיע: **שם הקמפיין
 *  שרשום על הכניסה**. ערוץ מקושר או לא - הליד נספר.
 */
export function viewWhere(
  view: ViewDef | null,
  channels: ChannelRef[],
  /** הכתיבים שנמצאו במסד לשמות הקמפיינים שנבחרו */
  campaignNames: string[] = []
): ViewFilter {
  if (!view) return null;

  const ids = channelsInView(view, channels);

  /**
   * תצוגה בלי אף ערוץ **ובלי אף שם** לא מחזירה "הכל" אלא
   * כלום. תצוגה שנשמרה בטעות בלי בחירה הייתה מציגה את כל
   * הלידים, והיית חושב שהיא עובדת.
   */
  if (ids.length === 0 && campaignNames.length === 0) {
    return { entries: { some: { channelId: { in: [] } } } };
  }

  /** שתי דרכים להגיע לאותו קמפיין, ומספיק שאחת תתפוס */
  const reach: Record<string, unknown>[] = [];

  /** 1. כניסה שקושרה לערוץ שלך - הדרך המדויקת והעדיפה */
  if (ids.length > 0) reach.push({ channelId: { in: ids } });

  /**
   * ============================================================
   *  2. התאמה לפי שם - **רק לכניסה שלא קושרה לאף ערוץ**
   * ============================================================
   *
   *  **למה הצמצום הזה קריטי.**
   *
   *  יכולים להיות שני קמפיינים עם **אותו שם בדיוק** - אחד
   *  שלך ואחד של הקונה. התאמה לפי שם לבדה הייתה מושכת גם
   *  את שלו לתצוגה שלך, ואז התצוגה שאמורה לסדר דווקא
   *  מערבבת. זו הייתה חוזרת להיות אותה טעות: החלטה
   *  שנשענת על שדה אחד שאינו ייחודי.
   *
   *  לכן השם תופס **רק** כשאין ערוץ מקושר. כניסה שקושרה
   *  לערוץ - של מי שזה לא יהיה - נשפטת לפי הקישור בלבד,
   *  והשם לא יכול לדרוס אותו.
   *
   *  זה בדיוק מה שצריך: 56 הלידים שנעלמו הם אלה שלא
   *  קושרו לשום ערוץ. הם ייספרו. ליד שקושר לקונה -
   *  לעולם לא.
   */
  if (campaignNames.length > 0) {
    reach.push({ channelId: null, campaign: { in: campaignNames } });
  }

  const match = reach.length === 1 ? reach[0] : { OR: reach };

  /**
   * בלי סימון מפורש, גם בתוך תצוגה לא מוצגים לידים של
   * מכירה. הפרדת הערוצים לא נשברת בגלל בחירת תצוגה.
   */
  /**
   * גם כאן - הקישור לערוץ הוא הקובע. "כולל מכירה" מרחיב
   * את מה שמוצג, והוא לא הופך את ההתאמה לפי שם למדויקת
   * יותר, ולכן הצמצום לכניסות בלי ערוץ נשאר גם כאן.
   */
  if (view.includeSale) {
    return { entries: { some: match } };
  }

  return { entries: { some: { ...match, isSale: false } } };
}

/** האם התצוגה בכלל מצמצמת משהו */
export function viewIsEmpty(view: ViewDef): boolean {
  return view.campaignIds.length === 0 && view.channelIds.length === 0;
}

/** תיאור קצר של התצוגה, להצגה במסך */
export function describeView(
  view: ViewDef,
  campaigns: Array<{ id: string; name: string }>,
  channels: Array<{ id: string; name: string }>
): string {
  const parts: string[] = [];

  for (const id of view.campaignIds) {
    const found = campaigns.find((c) => c.id === id);
    if (found) parts.push(found.name);
  }

  for (const id of view.channelIds) {
    const found = channels.find((c) => c.id === id);
    if (found) parts.push(found.name);
  }

  if (parts.length === 0) return "לא נבחר כלום";

  const text = parts.join(" · ");
  return view.includeSale ? `${text} · כולל מכירה` : text;
}
