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
