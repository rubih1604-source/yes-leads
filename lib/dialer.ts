/**
 * ============================================================
 *  לאיזה חייגן כפתור החיוג פונה
 * ============================================================
 *
 *  `tel:` תמיד הולך לחייגן של מערכת ההפעלה. כדי להגיע
 *  לאפליקציה אחרת צריך את "השם הפנימי" שלה - כל אפליקציה
 *  רושמת לעצמה אחד.
 *
 *  ההגדרה נשמרת כ**תבנית**: מחרוזת שבה `{phone}` מוחלף
 *  במספר. ככה אפשר להחליף אפליקציה בלי לגעת בקוד - גם
 *  אפליקציה שלא מופיעה ברשימה כאן.
 *
 *  נייד ומחשב נשמרים בנפרד, כי זו לא אותה אפליקציה.
 */

export type DialerPreset = {
  id: string;
  label: string;
  template: string;
  /** היכן האפליקציה הזו רלוונטית */
  where: "mobile" | "desktop" | "both";
  note?: string;
};

export const DIALER_PRESETS: DialerPreset[] = [
  {
    id: "system",
    label: "החייגן הרגיל של המכשיר",
    template: "tel:{phone}",
    where: "both",
    note: "ברירת המחדל. בנייד זה החייגן הסלולרי",
  },
  {
    id: "softphone",
    label: "Acrobits Softphone",
    template: "asoftphone:{phone}?dialAction=call",
    where: "mobile",
    note: "מחייג מיד עם פתיחת האפליקציה",
  },
  {
    id: "softphone-manual",
    label: "Acrobits Softphone (בלי חיוג אוטומטי)",
    template: "asoftphone:{phone}",
    where: "mobile",
    note: "פותח את האפליקציה עם המספר מוכן, ואתה לוחץ חיוג",
  },
  {
    id: "groundwire",
    label: "Groundwire",
    template: "groundwire:{phone}?dialAction=call",
    where: "mobile",
  },
  {
    id: "zoiper",
    label: "Zoiper",
    template: "callto:{phone}",
    where: "desktop",
    note: "זוהי הסכמה ש-Zoiper רושם לעצמו במחשב",
  },
  {
    id: "sip",
    label: "SIP כללי",
    template: "sip:{phone}",
    where: "both",
    note: "מתאים לרוב אפליקציות ה-SIP",
  },
  {
    id: "skype",
    label: "Skype",
    template: "skype:{phone}?call",
    where: "desktop",
  },
  {
    id: "whatsapp",
    label: "שיחת וואטסאפ",
    template: "https://wa.me/{phone}",
    where: "both",
    note: "פותח את הצ'אט בוואטסאפ",
  },
];

export const DEFAULT_DIALER = "tel:{phone}";

/**
 * בונה את הקישור בפועל.
 *
 * תבנית ריקה או שבורה (בלי {phone}) חוזרת לברירת המחדל,
 * כדי שכפתור החיוג אף פעם לא ייצא מקולקל.
 */
export function dialHref(template: string | null | undefined, phone: string): string {
  const clean = (template ?? "").trim();
  const safe = clean.includes("{phone}") ? clean : DEFAULT_DIALER;

  /**
   * יש סכמות שרוצות את המספר הבינלאומי (וואטסאפ, SIP)
   * ויש שרוצות את המקומי. הכלל: וואטסאפ תמיד בינלאומי
   * בלי פלוס, כל השאר - כמו שהמספר נמסר.
   */
  if (safe.startsWith("https://wa.me/")) {
    return safe.replace("{phone}", phone.replace(/\D/g, ""));
  }

  return safe.replace("{phone}", phone);
}

/** מאתר את ההגדרה המוכנה שמתאימה לתבנית, אם יש כזו */
export function presetFor(template: string): DialerPreset | undefined {
  const clean = (template ?? "").trim();
  return DIALER_PRESETS.find((p) => p.template === clean);
}
