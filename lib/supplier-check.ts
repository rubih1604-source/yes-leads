/**
 * ============================================================
 *  שאלת הסינון שאחרי הדיוור
 * ============================================================
 *
 *  מי שענה לדיוור מקבל שאלה אחת לפני שאתה מתקשר אליו:
 *  האם הוא כבר לקוח של yes או סטינג.
 *
 *  **למה זה חוסך לך זמן.** לקוח קיים שמגיב למבצע הוא שיחה
 *  מבוזבזת - אין מה למכור לו, והוא בכלל צריך שירות. השאלה
 *  מסננת אותם לפני שהרמת טלפון, והתשובה גם מעדכנת את
 *  הסטטוס שלו לבד.
 *
 *  הקובץ טהור בכוונה: קריאת התשובה היא ההכרעה שקובעת אם
 *  אדם מסומן "לקוח קיים" ומוצא מהרשימה החמה, וטעות כאן
 *  שקולה לליד שנזרק.
 */

import { normalizeText } from "./unsubscribe";

/** השאלה שנשלחת */
export const SUPPLIER_QUESTION =
  "רגע לפני שאני יוצר איתכם קשר, האם אתם כיום לקוחות של yes/sting?";

/** התשובה למי שכן */
export const REPLY_IF_CUSTOMER =
  "אנא פנו ל*2080 לקבלת שירות";

/** התשובה למי שלא */
export const REPLY_IF_NOT_CUSTOMER =
  "אוקיי, מתפנה וחוזר אליכם:)";

export type SupplierAnswer = "yes" | "no" | null;

/**
 * ניסוחים של "כן".
 *
 * כולל את המקרה שבו הלקוח עונה בשם החברה במקום בכן/לא -
 * "יס", "סטינג", "yes" הם תשובה חיובית לשאלה הזו.
 */
const YES_WORDS = [
  "כנ",
  "בטח",
  "נכונ",
  "אני לקוח",
  "אנחנו לקוחות",
  "יש לי",
  "כבר יש",
];

/**
 * שמות הספקים.
 *
 * מופרדים כי לפניהם מותרת **תחילית עברית צמודה** - "אני
 * ביס", "הסטינג", "בהוט". בלי זה "ביס" לא היה נקרא כתשובה
 * בכלל, וזו תשובה נפוצה לגמרי.
 *
 * התחילית מוגבלת לאות אחת מרשימה סגורה, ולכן "פיסיקה"
 * עדיין לא נתפס: פ אינה תחילית.
 */
const YES_PROVIDERS = ["yes", "סטינג", "sting", "יס"];

/** ניסוחים של "לא" */
const NO_WORDS = ["לא", "אני לא", "אנחנו לא", "איננו", "no"];

/** ספק אחר = תשובה שלילית לשאלה */
const NO_PROVIDERS = [
  "הוט",
  "hot",
  "פרטנר",
  "partner",
  "סלקומ",
  "cellcom",
  "פלאפונ",
  "בזק",
  "גולנ",
  "רמי לוי",
  "פרי טיוי",
  "free tv",
  "free_tv",
];

/**
 * השוואה על גבול מילה.
 *
 * בלי הגבול "לא" היה נמצא בתוך "אלא" ו"יס" בתוך "פיסיקה",
 * וכל תשובה הייתה נקראת שגוי. זו בדיוק הטעות שכבר קרתה
 * בזיהוי לקוח קיים.
 */
const LETTER = "a-zA-Z\\u0590-\\u05FF";

/** תחיליות עברית שמותר שיידבקו לשם ספק */
const PREFIX = "\u05d1\u05dc\u05de\u05d4\u05d5\u05e9\u05db";

function containsWord(
  text: string,
  word: string,
  allowPrefix = false
): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = allowPrefix
    ? `(^|[^${LETTER}])[${PREFIX}]?`
    : `(^|[^${LETTER}])`;

  return new RegExp(`${head}${escaped}([^${LETTER}]|$)`, "i").test(text);
}

function matchesAny(
  text: string,
  words: string[],
  providers: string[]
): boolean {
  if (words.some((w) => containsWord(text, w))) return true;
  return providers.some((w) => containsWord(text, w, true));
}

/**
 * קורא את התשובה לשאלת הספק.
 *
 * מחזיר null כשאי אפשר להכריע - ואז לא נעשה כלום אוטומטית
 * והליד נשאר לך. **זו ברירת המחדל הנכונה:** ניחוש שגוי
 * כאן מסמן לקוח אמיתי כלקוח קיים ומוציא אותו מהרשימה.
 */
export function readSupplierAnswer(text: string): SupplierAnswer {
  const clean = normalizeText(text);
  if (!clean) return null;

  /**
   * שלילה מפורשת גוברת.
   *
   * "לא, אני בהוט" מכיל גם "לא" וגם שם של ספק אחר - שניהם
   * מצביעים על אותה תשובה. אבל "לא yes" מכיל גם "yes",
   * ובלי העדיפות הזו הוא היה נקרא כתשובה חיובית.
   */
  const saysNo = matchesAny(clean, NO_WORDS, NO_PROVIDERS);
  const saysYes = matchesAny(clean, YES_WORDS, YES_PROVIDERS);

  if (saysNo && !saysYes) return "no";
  if (saysYes && !saysNo) return "yes";

  /**
   * שניהם יחד - כמו "לא yes אלא הוט" - נקראים כשלילה,
   * כי המילה "לא" מופיעה במפורש.
   */
  if (saysNo && saysYes) return "no";

  return null;
}

/** מה לענות לפי התשובה */
export function replyForAnswer(answer: SupplierAnswer): string | null {
  if (answer === "yes") return REPLY_IF_CUSTOMER;
  if (answer === "no") return REPLY_IF_NOT_CUSTOMER;
  return null;
}

/** סוג האירוע שמסמן שהשאלה נשאלה */
export const ASKED_EVENT = "supplier_check_asked";

/**
 * ============================================================
 *  הצהרה מפורשת שהוא כבר אצלנו
 * ============================================================
 *
 *  **הבאג שזה מתקן, והוא עלה בליד.**
 *
 *  לקוח קיבל דיוור שנגמר ב"אם אתם מעוניינים תרשמו לי",
 *  וכתב "כן". הבוט קרא את ה"כן" כתשובה לשאלת הסינון -
 *  שאלה שמעולם לא נשאלה - וענה לו "פנו ל*2080 לקבלת
 *  שירות". לקוח שרצה לקנות נשלח לשירות.
 *
 *  **הכלל, במילים שלך:** תמיד לשאול את שאלת הסינון, אלא
 *  אם הוא כתב במפורש שהוא כבר אצלנו.
 *
 *  ולכן כאן, בניגוד ל-readSupplierAnswer, **"כן" אינו
 *  מספיק.** צריך שם של ספק: יס, סטינג, yes, sting.
 *  readSupplierAnswer נשארה רחבה כי היא קוראת תשובה
 *  לשאלה שכן נשאלה - ושם "כן" באמת אומר כן.
 */
export function statesExistingCustomer(text: string): boolean {
  const clean = normalizeText(text);
  if (!clean) return false;

  /**
   * שלילה גוברת: "אני לא ביס" אינה הצהרה שהוא אצלנו.
   */
  if (NO_WORDS.some((w) => containsWord(clean, w))) return false;

  return YES_PROVIDERS.some((w) => containsWord(clean, w, true));
}
