/**
 * ============================================================
 *  יותר מחשבון פייסבוק אחד, בלי שום חוט מקשר ביניהם
 * ============================================================
 *
 *  **מה שזה פותר.** פתיחת חשבון פייסבוק חדש לגמרי לקמפיינים
 *  חדשים, **בלי** לשייך אותו לאדמין, לתיק העסקי או לאפליקציה
 *  של החשבון הקודם.
 *
 *  עד כאן המערכת הכירה אפליקציה אחת: סוד אחד לאימות החתימה
 *  וטוקן אחד לשליפת הליד. כלומר הדרך היחידה לחבר פייסבוק
 *  נוסף הייתה להשתמש באותה אפליקציה - וזה בדיוק החוט המקשר
 *  שלא רוצים.
 *
 *  **איך זה עובד כאן.** כל מקור הוא זוג: סוד אפליקציה וטוקן
 *  עמוד. הם נקראים ממשתני הסביבה, הראשון בלי סיומת והשאר
 *  עם _2, _3 וכן הלאה:
 *
 *      FB_APP_SECRET      FB_PAGE_TOKEN      FB_VERIFY_TOKEN
 *      FB_APP_SECRET_2    FB_PAGE_TOKEN_2    FB_VERIFY_TOKEN_2
 *
 *  **ולמה אין כאן מיפוי של מזהי עמודים.** אפשר היה לדרוש
 *  לרשום איזה עמוד שייך לאיזו אפליקציה, וזו עוד הגדרה
 *  שאפשר לטעות בה - וטעות בה פירושה לידים שנופלים. במקום
 *  זה החתימה נבדקת מול כל הסודות, והליד נשלף עם כל טוקן עד
 *  שאחד מצליח. שני מקורות הם שתי בדיקות; זה זול, וזה לא
 *  דורש ממך לדעת כלום.
 */

export type FacebookSource = {
  /** שם לתצוגה ביומן ובהתראות */
  label: string;
  appSecret: string;
  pageToken: string;
  verifyToken: string;
};

/** כמה מקורות נתמכים. יותר מזה הוא כנראה טעות הגדרה */
const MAX_SOURCES = 5;

function read(name: string, index: number): string {
  const key = index === 1 ? name : `${name}_${index}`;
  return process.env[key]?.trim() ?? "";
}

/**
 * כל המקורות שהוגדרו.
 *
 * מקור נחשב מוגדר אם יש לו טוקן עמוד **או** סוד אפליקציה -
 * חלקי הוא עדיין מקור, והחוסר יתגלה בשימוש עם הודעה ברורה,
 * במקום להיעלם בשקט.
 */
export function facebookSources(): FacebookSource[] {
  const sources: FacebookSource[] = [];

  for (let i = 1; i <= MAX_SOURCES; i++) {
    const appSecret = read("FB_APP_SECRET", i);
    const pageToken = read("FB_PAGE_TOKEN", i);
    const verifyToken = read("FB_VERIFY_TOKEN", i);

    if (!appSecret && !pageToken) continue;

    sources.push({
      label: i === 1 ? "פייסבוק ראשי" : `פייסבוק ${i}`,
      appSecret,
      pageToken,
      verifyToken,
    });
  }

  return sources;
}

/** כל טוקני העמוד, לפי הסדר. הראשון הוא הראשי */
export function pageTokens(): string[] {
  return facebookSources()
    .map((s) => s.pageToken)
    .filter(Boolean);
}

/**
 * האם מחרוזת האימות תואמת לאחד המקורות.
 *
 * מטא שולחת אותה פעם אחת, כשמגדירים את כתובת הוובוק. כל
 * אפליקציה מגדירה את שלה, ולכן כולן מתקבלות.
 */
export function verifyTokenMatches(given: string): boolean {
  const tokens = facebookSources()
    .map((s) => s.verifyToken)
    .filter(Boolean);

  /** לא הוגדר כלום - לא חוסמים את ההגדרה הראשונית */
  if (tokens.length === 0) return true;

  return tokens.includes(given);
}

/**
 * מריץ פעולה עם כל טוקן, עד שאחד מצליח.
 *
 * **זה מה שמחליף מיפוי של עמודים לאפליקציות.** עמוד של
 * החשבון החדש לא ייענה לטוקן של הישן, ולהיפך - ולכן מספיק
 * לנסות את שניהם.
 *
 * מחזיר גם את השגיאה של הניסיון הראשון, כדי שכישלון אמיתי
 * יישאר מוסבר ולא יתחלף ב"לא נמצא".
 */
export async function withEachToken<T>(
  run: (token: string, source: FacebookSource) => Promise<T | null>
): Promise<{ result: T | null; tried: number; firstError: string }> {
  const sources = facebookSources().filter((s) => s.pageToken);

  let firstError = "";

  for (const source of sources) {
    try {
      const result = await run(source.pageToken, source);
      if (result !== null) return { result, tried: sources.length, firstError };
    } catch (err) {
      if (!firstError) {
        firstError =
          err instanceof Error ? err.message.slice(0, 300) : "שגיאה";
      }
    }
  }

  return { result: null, tried: sources.length, firstError };
}
