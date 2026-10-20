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
export function viewWhere(
  view: ViewDef | null,
  channels: ChannelRef[]
): { entries: { some: { channelId: { in: string[] }; isSale?: boolean } } } | null {
  if (!view) return null;

  const ids = channelsInView(view, channels);

  /**
   * תצוגה בלי אף ערוץ לא מחזירה "הכל" אלא כלום.
   *
   * זה בכוונה: תצוגה שנשמרה בטעות בלי בחירה הייתה מציגה
   * את כל הלידים, והיית חושב שהיא עובדת.
   */
  if (ids.length === 0) {
    return { entries: { some: { channelId: { in: [] } } } };
  }

  /**
   * בלי סימון מפורש, גם בתוך תצוגה לא מוצגים לידים של
   * מכירה. הפרדת הערוצים לא נשברת בגלל בחירת תצוגה.
   */
  if (view.includeSale) {
    return { entries: { some: { channelId: { in: ids } } } };
  }

  return { entries: { some: { channelId: { in: ids }, isSale: false } } };
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
