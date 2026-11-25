/**
 * ============================================================
 *  טופס לידים משלנו, לכל פלטפורמת פרסום
 * ============================================================
 *
 *  **מה שזה פותר.** בפייסבוק יש טופס לידים מובנה. בפרסום
 *  ב-ChatGPT, בגוגל, בטיקטוק - אין, וצריך דף נחיתה משלנו.
 *
 *  **והדבר החשוב בבדיקה הזו:** דף ציבורי הוא הדלת הכי
 *  מסוכנת במערכת. הוא פתוח לאינטרנט כולו, הוא יוצר לידים,
 *  והוא קורא לאותו קוד שפייסבוק קוראת לו. כל אחד מהשלושה
 *  האלה הוא מקום שבו טעות עולה ביוקר.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeExistingCustomer } from "../lib/leadmanager-mapping";
import { checkLogo, isEmbeddedLogo, LOGO_MAX_CHARS } from "../lib/logo-image";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error("     " + (err instanceof Error ? err.message : String(err)));
  }
}

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const api = read("../app/api/public-form/[id]/route.ts");
const form = read("../components/PublicLeadForm.tsx");
const mw = read("../middleware.ts");
const schema = read("../prisma/schema.prisma");

/* ============================================================
 *  1. אין מסלול שני ליצירת לידים
 * ========================================================= */
console.log("\nאותה דלת קליטה, לא דלת שנייה");

test("**הטופס לא יוצר לידים בעצמו**", () => {
  /**
   * זו הטעות שעלתה הכי ביוקר במערכת הזו: שני מסלולים
   * שיוצרים לידים, שמתחילים זהים ונפרדים עם כל עדכון.
   *
   * הטופס בונה מטען ודופק על אותה דלת שפייסבוק דופקת
   * עליה - ולכן ההפרדה, ההתראות, הבוט והחוקים עובדים
   * עליו ביום הראשון בלי שורת קוד אחת.
   */
  assert.ok(
    !/db\.lead\.create|db\.leadEntry\.create/.test(api),
    "הטופס יוצר לידים ישירות - זה מנגנון שני"
  );
  assert.ok(
    api.includes("intakeLead("),
    "הטופס לא עובר דרך דלת הקליטה הרגילה"
  );
});

test("המטען בשמות שהקליטה כבר מכירה", () => {
  for (const field of ["full_name", "phone", "fb_campaign"]) {
    assert.ok(api.includes(field), `השדה ${field} חסר - הקליטה לא תקרא אותו`);
  }
});

test("ליד שלא נקלט מתריע ולא נעלם", () => {
  assert.ok(
    api.includes('title: "ליד מטופס לא נקלט!"'),
    "כישלון קליטה יעבור בשקט - וזה כסף שהולך לאיבוד"
  );
});

/* ============================================================
 *  2. מקור ההגעה
 * ========================================================= */
console.log("\nמקור ההגעה נקבע לפי הקישור");

test("כל קישור נושא מקור משלו", () => {
  assert.ok(
    schema.includes("model PublicForm"),
    "אין מודל לטפסים"
  );
  assert.ok(
    api.includes("source: form.source"),
    "המקור לא נרשם על הליד - לא תדע מאיזו פלטפורמה הוא בא"
  );
});

test("אפשר לשייך קישור לקמפיין קיים", () => {
  /** בלי זה הלידים האלה לא יופיעו בשום סינון או דוח */
  assert.ok(
    api.includes("payload.fb_campaign = form.campaignName"),
    "אין שיוך לקמפיין"
  );
});

test("המודל לא מוסיף אינדקס ייחודי חדש", () => {
  /**
   * `prisma db push` מסרב ליצור אינדקס ייחודי חדש, וזה
   * כבר הפיל בנייה פעם אחת. המזהה עצמו הוא המפתח
   * בכתובת, והוא ייחודי ממילא.
   */
  const model = schema.slice(
    schema.indexOf("model PublicForm"),
    schema.indexOf("model LeadForm")
  );

  assert.ok(
    !/@unique/.test(model),
    "אינדקס ייחודי חדש - הבנייה ברנדר תיכשל"
  );
});

/* ============================================================
 *  3. דף ציבורי - ההגנות
 * ========================================================= */
console.log("\nההגנות של דף פתוח");

test("הטופס נגיש בלי סיסמה", () => {
  /** לקוח שלוחץ על מודעה חייב להגיע לטופס ולא למסך סיסמה */
  assert.ok(
    mw.includes('pathname.startsWith("/f/")') &&
      mw.includes('pathname.startsWith("/api/public-form/")'),
    "הטופס חסום מאחורי סיסמה - אין טופס"
  );
});

test("**שדה מלכודת לבוטים**", () => {
  assert.ok(
    api.includes("body.website?.trim()"),
    "אין מלכודת - בוט ימלא את הרשימה בזבל"
  );
  assert.ok(
    form.includes('aria-hidden="true"') && form.includes("tabIndex={-1}"),
    "המלכודת נגישה לבני אדם או לקורא מסך"
  );
});

test("מלכודת שנתפסה מחזירה 'נשלח' ולא שגיאה", () => {
  /**
   * בוט שמקבל שגיאה מנסה שוב בצורה אחרת. בוט שחושב
   * שהצליח הולך הלאה.
   */
  const at = api.indexOf("body.website?.trim()");
  assert.ok(
    api.slice(at, at + 150).includes("ok: true"),
    "המלכודת מסגירה את עצמה"
  );
});

test("יש תקרת פניות לכתובת", () => {
  assert.ok(
    api.includes("MAX_PER_WINDOW") && api.includes("status: 429"),
    "אין תקרה - אפשר להציף את הרשימה"
  );
});

test("המפה של התקרה לא גדלה בלי סוף", () => {
  assert.ok(
    api.includes("recent.size > 5000"),
    "דליפת זיכרון - השרת ייפול אחרי מספיק פניות"
  );
});

/* ============================================================
 *  4. מספר טלפון
 * ========================================================= */
console.log("\nמספר טלפון");

test("**כאן מספר שגוי נחסם, בניגוד לקליטה מפייסבוק**", () => {
  /**
   * בפייסבוק רק מסמנים, כי הליד כבר הגיע ואסור לאבד
   * אותו. כאן הלקוח עומד מול המסך ויכול לתקן בשנייה.
   */
  assert.ok(
    api.includes("if (!phone || !check.valid)"),
    "מספר שגוי ייכנס - ותגלה את זה בשיחה שלא נענית"
  );
});

test("הבדיקה רצה גם בדפדפן, בזמן הקלדה", () => {
  assert.ok(
    form.includes("checkPhone(phone)"),
    "הלקוח יגלה על הטעות רק אחרי שליחה"
  );
});

test("שדות בגודל שלא גורם לזום בנייד", () => {
  /** פחות מ-16px גורם ל-iPhone לזום על כל שדה */
  assert.ok(
    form.includes("fontSize: 16"),
    "הטופס יקפוץ בזום בכל שדה בנייד"
  );
});

/* ============================================================
 *  5. מנוי קיים
 * ========================================================= */
console.log("\nמנוי קיים אינו ליד");

test("**מי שבוחר yes או סטינג לא נכנס כליד**", () => {
  /**
   * אין טעם למכור למי שכבר לקוח. הוא לא ליד, הוא לא
   * מתריע, והוא לא מופיע ברשימה - הוא מקבל את מספר
   * השירות. ככה הרשימה נשארת נקייה מפניות שאין בהן
   * מכירה.
   */
  assert.ok(
    api.includes("looksLikeExistingCustomer("),
    "מנוי קיים ייכנס כליד"
  );
  assert.ok(
    api.includes("existingCustomer: true"),
    "השרת לא מדווח שזה מנוי קיים"
  );
});

test("החסימה בשרת, לא רק בדפדפן", () => {
  /**
   * חסימה שרק בדפדפן אפשר לעקוף בבקשה ישירה אחת.
   */
  const at = api.indexOf("looksLikeExistingCustomer(");
  const create = api.indexOf("intakeLead(");

  assert.ok(at > -1 && create > -1);
  assert.ok(at < create, "הבדיקה קורית אחרי שהליד כבר נוצר");
});

test("**אותו כלל בדיוק בשני המקומות**", () => {
  /**
   * כלל נפרד בדפדפן היה נפרד מהכלל בשרת ברגע שאחד מהם
   * משתנה, ואז לקוח היה נחסם במסך אחד ולא באחר.
   */
  assert.ok(
    form.includes("looksLikeExistingCustomer("),
    "הדפדפן מחשב את זה לבד"
  );

  const mapping = read("../lib/leadmanager-mapping.ts");
  assert.ok(
    mapping.includes("export function looksLikeExistingCustomer"),
    "הכלל לא במקום משותף"
  );
  assert.ok(
    /סטינג/.test(mapping) && /yes/.test(mapping),
    "הכלל לא מזהה את שתי החברות"
  );
});

test("ההודעה למנוי קיים ניתנת לשינוי", () => {
  const schema2 = read("../prisma/schema.prisma");
  assert.ok(
    schema2.includes("existingMsg"),
    "ההודעה קבועה בקוד ואי אפשר לשנות אותה"
  );
  assert.ok(
    schema2.includes("*2080"),
    "מספר השירות לא מופיע בברירת המחדל"
  );
});

/* ============================================================
 *  6. מיתוג
 * ========================================================= */
console.log("\nמיתוג");

test("הלוגו והצבע מוזנים, לא מומצאים", () => {
  /**
   * לא נכון להמציא לוגו או צבעים של חברה אמיתית. רובי
   * מדביק את הקישור ללוגו הרשמי ואת הצבע.
   */
  const schema2 = read("../prisma/schema.prisma");
  assert.ok(schema2.includes("logoUrl"), "אין מקום ללוגו");
  assert.ok(schema2.includes("brandColor"), "אין מקום לצבע המותג");
});

test("בלי לוגו הדף עדיין נראה שלם", () => {
  const page = read("../app/f/[id]/page.tsx");
  assert.ok(
    page.includes("form.logoUrl ?"),
    "דף בלי לוגו יישבר במקום ליפול לכותרת טקסט"
  );
});

test("**התכלת של yes היא ברירת המחדל, בכל שלושת המקומות**", () => {
  /**
   * צבע ברירת מחדל שונה בין הסכימה, המסך והשרת היה אומר
   * שדף נראה אחרת תלוי איך נוצר. #00D8FE זה מה שרובי
   * מסר מהלוגו הרשמי.
   */
  const schema2 = read("../prisma/schema.prisma");
  const screen = read("../components/FormsScreen.tsx");

  assert.ok(
    schema2.includes('@default("#00D8FE")'),
    "ברירת המחדל בסכימה אינה התכלת של yes"
  );
  assert.ok(
    screen.includes('const YES_BLUE = "#00D8FE"'),
    "המסך לא מכיר את התכלת"
  );
  const route = read("../app/api/forms/route.ts");
  assert.ok(
    route.includes('const YES_BLUE = "#00D8FE"'),
    "השרת לא מכיר את התכלת"
  );
  assert.ok(
    !/#1b4d8f/.test(screen) && !/#1b4d8f/.test(route),
    "נשאר צבע ברירת מחדל מהגרסה הקודמת"
  );
});

/* ============================================================
 *  7. המבצע - משתנה בלי לגעת בקישור
 * ========================================================= */
console.log("\nהמבצע משתנה, הקישור לא");

const page = read("../app/f/[id]/page.tsx");
const screen = read("../components/FormsScreen.tsx");
const formsApi = read("../app/api/forms/route.ts");

test("**יש עריכה לקישור קיים, ולא רק יצירה**", () => {
  /**
   * הקישור כבר יושב בתוך מודעה פעילה. אם שינוי מבצע היה
   * מחייב קישור חדש, היה צריך לערוך כל מודעה בכל
   * פלטפורמה - ולאבד את הצפיות וההמרה שנצברו.
   */
  assert.ok(
    screen.includes("function edit(form: Form)"),
    "אין עריכה - כל שינוי מחיר ידרוש קישור חדש"
  );
  assert.ok(
    screen.includes("draft.id ? draft :"),
    "העריכה תיצור קישור חדש במקום לעדכן את הקיים"
  );
});

test("המחיר והפירוט ניתנים לשינוי בכל רגע", () => {
  for (const f of ["priceAmount", "pricePeriod", "priceNote", "offerDetails"]) {
    assert.ok(formsApi.includes(`body.${f} !== undefined`), `${f} לא נשמר`);
    assert.ok(screen.includes(`draft.${f}`), `${f} לא נמצא במסך`);
    assert.ok(page.includes(`form.${f}`), `${f} לא מוצג בדף`);
  }
});

test("**שדה שרוקנת נמחק, ולא נשאר כמו שהיה**", () => {
  /**
   * מבצע שנגמר ומוצג בדף הוא הבטחה שאי אפשר לקיים
   * בשיחה. ריק חייב למחוק.
   */
  const at = formsApi.indexOf("body.priceAmount !== undefined");
  assert.ok(
    formsApi.slice(at, at + 140).includes("|| null"),
    "מחיר שנמחק יישאר על הדף"
  );
});

test("המחיר לא מוצג כשאין מחיר", () => {
  assert.ok(
    page.includes("form.priceAmount ? ("),
    "קופסת מחיר ריקה תוצג בדף נחיתה בתשלום"
  );
});

test("**הדף מפזר את הגרפיקה לבד לפי הכמות**", () => {
  assert.ok(
    page.includes("const imageLayout ="),
    "אין פריסה אוטומטית - רובי יצטרך להחליט על פריסה"
  );
  for (const layout of ["banner", "strip", "grid"]) {
    assert.ok(page.includes(`"${layout}"`), `הפריסה ${layout} חסרה`);
  }
});

test("כתובת תמונה שאינה http נזרקת לפני השמירה", () => {
  /**
   * `data:` או `javascript:` בדף ציבורי היא דלת שלא צריכה
   * להיות פתוחה, וכתובת יחסית לא תיטען ממילא - היא רק
   * תצייר ריבוע שבור במודעה בתשלום.
   */
  assert.ok(
    formsApi.includes("function isImageUrl"),
    "כל טקסט יכול להיכנס כתמונה"
  );
  assert.ok(
    formsApi.includes("cleanLines(body.images"),
    "התמונות נשמרות בלי בדיקה"
  );
});

test("שורות ריקות לא מציירות ✓ ריק", () => {
  assert.ok(
    formsApi.includes("function cleanLines"),
    "טקסט שהודבק מוורד יצייר נקודות ריקות בדף"
  );
});

test("**הכותרת מופיעה פעם אחת, לא פעמיים**", () => {
  /**
   * הכותרת עברה מהטופס לדף. אם הטופס עוד היה מצייר
   * אותה, הלקוח היה רואה אותה כותרת פעמיים.
   */
  assert.ok(
    !form.includes("{title}") && !form.includes("{subtitle}"),
    "הטופס מצייר כותרת - היא תוצג כפול"
  );
  assert.ok(
    !/\btitle\b\s*:\s*string/.test(form),
    "הטופס עוד מצהיר על כותרת שהדף לא שולח - הבנייה תיכשל"
  );
});

/* ============================================================
 *  7ב. הלוגו
 * ========================================================= */
console.log("\nהלוגו - קובץ, לא ציד אחרי קישור");

test("**אפשר להעלות קובץ ולא רק להדביק כתובת**", () => {
  /**
   * "תעלה את הלוגו לאיזה שירות ותביא קישור" זו משימה
   * שלמה בשביל תמונה אחת. מי שיש לו את הקובץ בטלפון
   * צריך להעלות אותו ולסיים.
   */
  assert.ok(screen.includes("function pickLogo"), "אין העלאת קובץ");
  assert.ok(
    screen.includes('type="file"') && screen.includes('accept="image/*"'),
    "אין בורר קבצים"
  );
});

test("התמונה מוקטנת בדפדפן לפני השמירה", () => {
  /**
   * בלי הקטנה, כל פתיחה של דף הנחיתה גוררת מגה-בייטים
   * ברשת סלולרית - ולקוח שמחכה סוגר.
   */
  assert.ok(
    screen.includes("canvas.getContext") && screen.includes("LOGO_MAX_WIDTH"),
    "התמונה נשמרת בגודל המקורי"
  );
});

test("**PNG ולא JPEG - בגלל הרקע השקוף**", () => {
  /** JPEG היה הופך לוגו שקוף לריבוע לבן על דף שחור */
  assert.ok(
    screen.includes('toDataURL("image/png")'),
    "הרקע השקוף של הלוגו יאבד"
  );
});

test("רק תמונה או https נשמרים כלוגו", () => {
  assert.ok(checkLogo("https://example.com/logo.png").ok, "כתובת תקינה נדחתה");
  assert.ok(checkLogo("data:image/png;base64,iVBORw0KGgo=").ok, "תמונה מוטמעת נדחתה");
  assert.ok(checkLogo("").ok, "בלי לוגו זה תקין");

  for (const bad of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "ftp://x/logo.png",
    "סתם טקסט",
  ]) {
    assert.ok(!checkLogo(bad).ok, `"${bad}" התקבל כלוגו`);
  }
});

test("תמונה ענקית נדחית ולא מאטה את הדף", () => {
  const huge = "data:image/png;base64," + "A".repeat(LOGO_MAX_CHARS + 10);
  const res = checkLogo(huge);
  assert.ok(!res.ok, "צילום מסך של מגה-בייטים נשמר כלוגו");
  assert.ok(res.reason?.includes("גדולה"), "השגיאה לא מסבירה מה הבעיה");
});

test("השרת בודק, לא רק המסך", () => {
  assert.ok(
    formsApi.includes("checkLogo(logo)"),
    "אפשר לשמור לוגו פסול בבקשה ישירה"
  );
});

test("כשיש תמונה מוטמעת לא מוצג שדה כתובת מבלבל", () => {
  assert.ok(isEmbeddedLogo("data:image/png;base64,iVBORw0KGgo="));
  assert.ok(!isEmbeddedLogo("https://example.com/a.png"));
  assert.ok(
    screen.includes("!isEmbeddedLogo(draft.logoUrl)"),
    "המסך יציג כתובת ענקית בתוך שדה טקסט"
  );
});

/* ============================================================
 *  8. ההסכמה
 * ========================================================= */
console.log("\nההסכמה לדיוור");

test("**יש תיבת סימון, והיא לא מסומנת מראש**", () => {
  /**
   * הסכמה שסומנה בשביל הלקוח אינה הסכמה, ולא תחזיק אם
   * מישהו יבדוק אותה.
   */
  assert.ok(
    form.includes("useState(false)") && form.includes("checked={consent}"),
    "אין תיבת הסכמה"
  );
  assert.ok(
    !/const \[consent, setConsent\] = useState\(true\)/.test(form),
    "ההסכמה מסומנת מראש - זו לא הסכמה"
  );
});

test("בלי סימון לא נשלח - גם בדפדפן וגם בשרת", () => {
  assert.ok(
    form.includes("if (requireConsent && !consent)"),
    "הדפדפן ישלח בלי הסכמה"
  );
  assert.ok(
    api.includes("form.requireConsent && !body.consent?.trim()"),
    "אפשר לעקוף את ההסכמה בבקשה ישירה"
  );
});

test("הבדיקה בשרת קורית לפני יצירת הליד", () => {
  const at = api.indexOf("form.requireConsent");
  const create = api.indexOf("intakeLead(");
  assert.ok(at > -1 && create > -1 && at < create, "הליד נוצר לפני הבדיקה");
});

test("**נוסח ההסכמה לא נשמר על הליד**", () => {
  /**
   * הנוסח מכיל את המילה yes, וזיהוי לקוח קיים סורק שדות
   * לפי שם המפתח. מספיק שמישהו ירחיב את רשימת השדות כדי
   * שכל ליד מהטופס יסומן כלקוח קיים - וזה כבר קרה פעם.
   */
  assert.ok(
    !api.includes("consent_text: form.consentText"),
    "נוסח שמכיל yes נשמר על כל ליד - מוקש לזיהוי לקוח קיים"
  );
  assert.ok(api.includes('consent: "1"'), "לא נשמר סימון ההסכמה בכלל");
});

test("המפתח consent אינו נראה כשדה ספק", () => {
  const ec = read("../lib/existing-customer.ts");
  const keys = ec.slice(
    ec.indexOf("const SUPPLIER_KEYS"),
    ec.indexOf("const LETTER")
  );
  assert.ok(
    !/consent/i.test(keys),
    "consent נסרק כשאלת ספק - כל ליד מהטופס ייחשב לקוח קיים"
  );
});

test("הנוסח ניתן לעריכה, ולא יכול להישמר ריק", () => {
  assert.ok(screen.includes("draft.consentText"), "אי אפשר לערוך את הנוסח");
  assert.ok(
    formsApi.includes("body.consentText !== undefined && body.consentText.trim()"),
    "אפשר לשמור תיבת סימון בלי טקסט"
  );
  assert.ok(
    formsApi.includes("body.requireConsent !== undefined"),
    "אי אפשר לכבות את חובת הסימון"
  );
});

/* ============================================================
 *  9. רשימת הספקים
 * ========================================================= */
console.log("\nרשימת הספקים, כמו במודעה");

test("**אותה רשימה בדיוק שבטופס של פייסבוק**", () => {
  for (const s of [
    "הוט / נקסט",
    "פרטנר",
    "סלקום",
    "Free TV",
    "אחר / ללא ספק",
  ]) {
    assert.ok(form.includes(s), `הספק "${s}" חסר מהרשימה`);
  }
  assert.ok(/יס\\\\סטינג/.test(form), "האפשרות יס\\סטינג חסרה");
});

test("**רק יס\\סטינג עוצר את השליחה, כל השאר עוברים**", () => {
  /**
   * הכלל עצמו מורץ על כל אפשרות ברשימה, כי זו השורה
   * שמחליטה אם לקוח משאיר פרטים או מקבל מספר שירות.
   * בדיקה שרק מוודאת שהקוד קיים לא הייתה תופסת כלל
   * שהשתנה.
   */
  const blocked = ["יס\\סטינג", "yes", "סטינג", "YES / סטינג"];
  const passes = [
    "הוט / נקסט",
    "פרטנר",
    "סלקום",
    "Free TV",
    "אחר / ללא ספק",
  ];

  for (const a of blocked) {
    assert.ok(
      looksLikeExistingCustomer({ supplier_question: a }),
      `"${a}" אמור להיחסם כמנוי קיים`
    );
  }

  for (const a of passes) {
    assert.ok(
      !looksLikeExistingCustomer({ supplier_question: a }),
      `"${a}" נחסם בטעות - לקוח שרצה הצעה מקבל מספר שירות`
    );
  }
});

test("הטקסט על כפתור התכלת כהה ולא לבן", () => {
  /** לבן על #00D8FE כמעט לא נקרא. זה כפתור השליחה. */
  assert.ok(
    form.includes('color: "#101828"'),
    "הכפתור לא ייקרא על הרקע התכלת"
  );
});

// ------------------------------------------------------------
console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
