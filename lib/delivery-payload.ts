/**
 * ============================================================
 *  מה בדיוק נשלח לקונה
 * ============================================================
 *
 *  לוגיקה טהורה בלבד - בלי מסד ובלי רשת - כדי שאפשר יהיה
 *  לבדוק אותה. מה שנשלח לקונה הוא מה שהוא משלם עליו, ואסור
 *  שיהיה כאן ניחוש.
 *
 *  לכל קונה יכול להיות מבנה שדות משלו. אלעד מצפה ל-phone,
 *  ספק אחר מצפה ל-telephone. המיפוי הוא מה שמאפשר לחבר
 *  קונה חדש בלי לגעת בקוד - וזה גם מה שהופך את זה למשהו
 *  שאפשר למכור.
 */

export type DeliveryLead = {
  firstName: string | null;
  lastName: string | null;
  phone: string;
  extra: unknown;
  status: string;
};

/** השדות שהמערכת יודעת לשלוח, והתווית שלהם למסך */
export const DELIVERY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "full_name", label: "שם מלא" },
  { key: "first_name", label: "שם פרטי" },
  { key: "last_name", label: "שם משפחה" },
  { key: "phone", label: "טלפון" },
  { key: "email", label: 'דוא"ל' },
  { key: "address", label: "כתובת" },
  { key: "campaign", label: "קמפיין" },
  { key: "ad", label: "מודעה" },
  { key: "form", label: "טופס" },
  { key: "supplier_question", label: "ספק נוכחי" },
  { key: "fb_leadid", label: "מזהה ליד בפייסבוק" },
  { key: "created_at", label: "מועד הכניסה" },
];

function extraOf(extra: unknown): Record<string, string> {
  return extra && typeof extra === "object" && !Array.isArray(extra)
    ? (extra as Record<string, string>)
    : {};
}

/**
 * המטען הבסיסי, לפני מיפוי.
 *
 * שדה ריק נשאר ריק ולא נעלם, כדי שהצד השני יקבל תמיד את
 * אותו מבנה. מערכת שמקבלת פעם 8 שדות ופעם 5 נשברת.
 */
export function buildPayload(
  lead: DeliveryLead,
  at: Date
): Record<string, string> {
  const extra = extraOf(lead.extra);
  const full = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();

  return {
    full_name: full,
    first_name: lead.firstName ?? "",
    last_name: lead.lastName ?? "",
    phone: lead.phone,
    email: extra.email ?? "",
    address: extra.address ?? "",
    campaign: extra.fb_campaign ?? extra.campaign ?? "",
    ad: extra.fb_ad ?? "",
    form: extra.fb_form ?? "",
    supplier_question: extra.supplier_question ?? "",
    fb_leadid: extra.fb_leadid ?? "",
    created_at: at.toISOString(),
  };
}

/**
 * משאיר רק את השדות שסומנו בערוץ.
 *
 * רשימה ריקה פירושה **הכל** ולא "כלום": ערוץ שהוגדר לפני
 * שהבחירה הזו קיימה, או ערוץ שלא נגעו בו, חייב להמשיך
 * לשלוח כמו קודם. ברירת מחדל שמפסיקה לשלוח שדות היא דרך
 * טובה לשבור קונה בלי לשים לב.
 *
 * הסדר נשמר לפי DELIVERY_FIELDS ולא לפי סדר הסימון, כדי
 * שהצד השני יקבל תמיד את אותו מבנה.
 */
export function pickFields(
  payload: Record<string, string>,
  fields: string[] | null | undefined
): Record<string, string> {
  const wanted = (fields ?? []).map((f) => f.trim()).filter(Boolean);

  if (wanted.length === 0) return { ...payload };

  const allowed = new Set(wanted);
  const out: Record<string, string> = {};

  for (const { key } of DELIVERY_FIELDS) {
    if (allowed.has(key) && key in payload) out[key] = payload[key];
  }

  /**
   * שדה שסומן אבל לא מופיע ב-DELIVERY_FIELDS (למשל נוסף
   * בעתיד) עדיין נשלח, כדי שסימון לא ייעלם בשקט.
   */
  for (const key of wanted) {
    if (!(key in out) && key in payload) out[key] = payload[key];
  }

  return out;
}

/**
 * מחיל את מיפוי השדות של הקונה.
 *
 * { "phone": "telephone" } יגרום לכך ש-phone יישלח בשם
 * telephone. שדה שלא מופיע במיפוי נשלח בשמו המקורי.
 *
 * ערך ריק במיפוי פירושו "אל תשלח את השדה הזה" - ככה אפשר
 * להסתיר מידע מקונה מסוים בלי לשנות קוד.
 */
export function applyFieldMap(
  payload: Record<string, string>,
  fieldMap: unknown
): Record<string, string> {
  const map =
    fieldMap && typeof fieldMap === "object" && !Array.isArray(fieldMap)
      ? (fieldMap as Record<string, unknown>)
      : {};

  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    const renamed = map[key];

    // לא מופיע במיפוי - נשלח כמו שהוא
    if (renamed === undefined) {
      out[key] = value;
      continue;
    }

    // מופיע כריק - לא נשלח בכלל
    if (typeof renamed !== "string" || renamed.trim() === "") continue;

    out[renamed.trim()] = value;
  }

  return out;
}

/**
 * ============================================================
 *  מתי לנסות שוב
 * ============================================================
 *
 *  כישלון זמני אצל הקונה (השרת שלו נפל לדקה) לא אמור לעלות
 *  לך בליד. לכן מנסים שוב, אבל בהפרשים גדלים - כדי לא
 *  להפציץ שרת שבאמת שבור.
 *
 *  4xx פירושו שהבקשה עצמה שגויה, וניסיון חוזר ייכשל באותה
 *  צורה. היוצא מהכלל הוא 408 ו-429, שהם בקשה טובה בתזמון רע.
 */
export const MAX_ATTEMPTS = 5;

export function shouldRetry(httpStatus: number | null, attempts: number): boolean {
  if (attempts >= MAX_ATTEMPTS) return false;

  // לא הייתה תשובה בכלל - תקלת רשת, שווה לנסות שוב
  if (httpStatus === null) return true;

  if (httpStatus === 408 || httpStatus === 429) return true;
  if (httpStatus >= 400 && httpStatus < 500) return false;

  return true;
}

/** כמה דקות להמתין לפני הניסיון הבא */
export function retryDelayMinutes(attempts: number): number {
  const steps = [1, 5, 20, 60];
  return steps[Math.min(attempts, steps.length - 1)];
}

/** האם התשובה נחשבת הצלחה */
export function isSuccess(httpStatus: number): boolean {
  return httpStatus >= 200 && httpStatus < 300;
}

/**
 * ============================================================
 *  Headers חופשיים
 * ============================================================
 *
 *  לא כל קונה מאמת ב-Bearer. אלעד, למשל, דורש כותרת בשם
 *  X-API-Key - וקונה אחר ידרוש שם אחר. בלי זה השליחה
 *  נדחית באימות, והליד פשוט לא מגיע.
 *
 *  הקלט הוא שורות "שם=ערך", כמו שרשום במפרט של ליד מנגר,
 *  כדי שאפשר להעתיק משם בלי לתרגם כלום.
 */
export function parseHeaders(input: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    /**
     * מפצלים על ההופעה הראשונה בלבד.
     * מפתחות מכילים לעיתים "=" בתוך הערך, ואסור לחתוך אותם.
     */
    const at = line.indexOf("=");
    const colon = line.indexOf(":");
    const cut =
      at === -1 ? colon : colon === -1 ? at : Math.min(at, colon);

    if (cut <= 0) continue;

    const name = line.slice(0, cut).trim();
    const value = line.slice(cut + 1).trim();

    // כותרת בלי שם או בלי ערך היא שגיאת הקלדה, לא הגדרה
    if (!name || !value) continue;

    out[name] = value;
  }

  return out;
}

/** חזרה לטקסט, לעריכה במסך */
export function headersToText(
  headers: Record<string, string> | null | undefined
): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
}

/**
 * ============================================================
 *  תבנית גוף השידור
 * ============================================================
 *
 *  בליד מנגר אתה כותב את ה-JSON בעצמך ומשתמל אסימונים.
 *  אותו דבר כאן, עם השמות של המערכת:
 *
 *    { "name": "{full_name}", "phone": "{phone}" }
 *
 *  למה תבנית ולא רק מיפוי שמות: המפרט שלך כולל גם שדות
 *  קבועים שלא באים מהליד - engagement_score ו-notes.
 *  מיפוי שמות לא יודע לייצר אותם.
 */

/** אסימון שלא מוכר מוחלף במחרוזת ריקה, כדי שה-JSON יישאר תקין */
export function renderTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) return "";

    /**
     * בריחה של תווים שישברו JSON.
     *
     * שם עם מרכאות או ירידת שורה הוא מה שהופך תבנית תקינה
     * לבקשה שהצד השני דוחה כ-malformed.
     */
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, "\\n")
      .replace(/\t/g, "\\t");
  });
}

/**
 * בדיקת תקינות התבנית, כמו "בדוק תקינות תבנית" בליד מנגר.
 *
 * מריצים אותה על ליד לדוגמה ומוודאים שהתוצאה JSON תקין.
 * עדיף לגלות את זה כאן מאשר מליד אמיתי שנדחה.
 */
export function checkTemplate(template: string): {
  ok: boolean;
  error?: string;
  tokens: string[];
} {
  const tokens = [
    ...new Set(
      [...template.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)].map((m) => m[1])
    ),
  ];

  if (!template.trim()) {
    return { ok: false, error: "התבנית ריקה", tokens };
  }

  const sample: Record<string, string> = {};
  for (const token of tokens) sample[token] = "בדיקה";

  const rendered = renderTemplate(template, sample);

  try {
    JSON.parse(rendered);
  } catch (err) {
    return {
      ok: false,
      error: `ה-JSON לא תקין: ${
        err instanceof Error ? err.message : "שגיאה"
      }`,
      tokens,
    };
  }

  const unknown = tokens.filter(
    (t) => !DELIVERY_FIELDS.some((f) => f.key === t)
  );

  if (unknown.length > 0) {
    return {
      ok: false,
      error: `אסימונים שהמערכת לא מכירה, הם יישלחו ריקים: ${unknown.join(", ")}`,
      tokens,
    };
  }

  return { ok: true, tokens };
}

/**
 * ============================================================
 *  האם השליחה באמת הצליחה
 * ============================================================
 *
 *  במפרט שלך יש "בדיקת הצלחת שליחה" ו"בדיקת כשלון שליחה",
 *  וזה לא קישוט: יש מערכות שמחזירות 200 גם כשהליד נדחה,
 *  ואומרות את זה בגוף התשובה.
 *
 *  בלי הבדיקה הזו היינו מסמנים "נשלח" לליד שלא נכנס אצל
 *  הקונה - וזו בדיוק הטענה שאי אפשר לענות עליה אחר כך.
 *
 *  סדר ההכרעה: סימן כשלון גובר על סימן הצלחה, ואם לא
 *  הוגדר כלום - קוד ה-HTTP מכריע, כמו עד היום.
 */
export function deliveryVerdict(args: {
  httpStatus: number;
  body: string;
  successContains?: string | null;
  failureContains?: string | null;
}): { ok: boolean; reason: string | null } {
  const body = args.body ?? "";

  const failure = args.failureContains?.trim();
  if (failure && body.includes(failure)) {
    return { ok: false, reason: `התשובה הכילה "${failure}"` };
  }

  const success = args.successContains?.trim();
  if (success) {
    return body.includes(success)
      ? { ok: true, reason: null }
      : { ok: false, reason: `התשובה לא הכילה "${success}"` };
  }

  return isSuccess(args.httpStatus)
    ? { ok: true, reason: null }
    : { ok: false, reason: `השרת החזיר ${args.httpStatus}` };
}
