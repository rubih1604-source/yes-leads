/**
 * מנרמל מספר טלפון ישראלי לפורמט בינלאומי אחיד: +9725XXXXXXXX
 * זהו מפתח הזיהוי הייחודי של ליד במערכת.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  // משאירים רק ספרות ואת הסימן +
  let s = String(input).trim().replace(/[^\d+]/g, "");
  if (!s) return null;

  // 00972... -> +972...
  if (s.startsWith("00")) s = "+" + s.slice(2);

  // אם כבר בפורמט בינלאומי
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    if (!/^\d{9,15}$/.test(digits)) return null;
    return "+" + digits;
  }

  // 972521234567 (בלי פלוס)
  if (s.startsWith("972")) {
    const rest = s.slice(3).replace(/^0+/, "");
    if (!/^\d{8,9}$/.test(rest)) return null;
    return "+972" + rest;
  }

  // 0521234567 -> +972521234567
  if (s.startsWith("0")) {
    const rest = s.slice(1);
    if (!/^\d{8,9}$/.test(rest)) return null;
    return "+972" + rest;
  }

  // 521234567
  if (/^\d{8,9}$/.test(s)) return "+972" + s;

  return null;
}

/** מציג מספר בצורה נוחה לקריאה: 052-123-4567 */
export function displayPhone(phone: string): string {
  if (phone.startsWith("+972")) {
    const rest = "0" + phone.slice(4);
    if (rest.length === 10) {
      return `${rest.slice(0, 3)}-${rest.slice(3, 6)}-${rest.slice(6)}`;
    }
    return rest;
  }
  return phone;
}

/**
 * מחזיר מספר לחיוג בפורמט מקומי: 0501234567
 *
 * למה לא הפורמט הבינלאומי: חלק מהחייגנים בישראל חוסמים
 * מספרים עם +972 ומסרבים לחייג. הפורמט המקומי תמיד עובד.
 */
export function dialPhone(phone: string): string {
  if (phone.startsWith("+972")) return "0" + phone.slice(4);
  if (phone.startsWith("972")) return "0" + phone.slice(3);
  return phone.replace(/[^\d+]/g, "");
}

/**
 * ============================================================
 *  חיפוש לפי טלפון
 * ============================================================
 *
 *  המספרים נשמרים בפורמט בינלאומי: +972521234567 - בלי האפס.
 *  מי שמחפש מקליד בדרך כלל 052-123-4567, ואז החיפוש נכשל
 *  כי הוא מחפש "0521234567" במחרוזת שאין בה אפס.
 *
 *  כאן מיישרים את שני הצדדים לאותו פורמט לפני ההשוואה,
 *  כך שכל צורת כתיבה תמצא: עם מקפים, בלי, עם אפס, עם +972.
 */

/** מחזיר את הספרות המשמעותיות להשוואה */
export function phoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");

  // 972521234567 -> 521234567
  if (digits.startsWith("972")) digits = digits.slice(3);

  // 0521234567 -> 521234567
  if (digits.startsWith("0")) digits = digits.slice(1);

  return digits;
}

/**
 * האם המספר השמור מתאים למה שהוקלד.
 * מספיקות 3 ספרות כדי להתחיל לסנן.
 */
export function phoneMatches(stored: string, query: string): boolean {
  const q = phoneDigits(query);
  if (q.length < 3) return false;
  return phoneDigits(stored).includes(q);
}
