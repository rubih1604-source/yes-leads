/**
 * ============================================================
 *  מאיזו דלת הליד נכנס
 * ============================================================
 *
 *  אותו ליד יכול להגיע משתי דלתות: החיבור הישיר לפייסבוק
 *  ודרך ליד מנגר. שתיהן רצות במקביל, ועד כה לא היה שום סימן
 *  מי הביא את הליד - כלומר אי אפשר היה לדעת אם החיבור הישיר
 *  באמת עובד או שליד מנגר עושה את כל העבודה.
 *
 *  כאן נשמר מי הביא. כשאותה הגעה מגיעה גם מהדלת השנייה,
 *  נרשמות **שתיהן** בסדר שבו הגיעו - וזו ההוכחה שהחיבור
 *  הישיר חי.
 *
 *  הקובץ נקי מבסיס נתונים בכוונה, כדי שיהיה אפשר לבדוק אותו.
 */

export const DOOR_FACEBOOK = "facebook";
export const DOOR_LEADMANAGER = "leadmanager";

const DOOR_LABELS: Record<string, string> = {
  facebook: "ישירות מפייסבוק",
  leadmanager: "ליד מנגר",
  manual: "הוזן ידנית",
  whatsapp: "וואטסאפ",
};

/** הדלת שממנה ההודעה הגיעה, לפי הסימון שהחיבור הישיר משאיר */
export function doorOf(payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const source = (payload as Record<string, unknown>)._source;
    if (typeof source === "string" && source.trim()) return source.trim();
  }
  return DOOR_LEADMANAGER;
}

/** פירוק השדה לרשימת דלתות, בסדר שבו הגיעו */
export function doors(via: string | null | undefined): string[] {
  if (!via) return [];
  return via
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * הוספת דלת לכניסה קיימת.
 *
 * מחזיר את הערך החדש, או null אם אין מה לשנות - כדי שלא
 * נכתוב לבסיס הנתונים בלי צורך בכל התראה חוזרת מפייסבוק.
 */
export function addDoor(
  current: string | null | undefined,
  door: string
): string | null {
  const clean = door.trim();
  if (!clean) return null;

  const list = doors(current);
  if (list.includes(clean)) return null;

  return [...list, clean].join(",");
}

/**
 * מה להציג.
 *
 * שתי דלתות מוצגות יחד, כי זה בדיוק מה שצריך לראות:
 * ההגעה הזו נקלטה גם ישירות וגם דרך ליד מנגר.
 */
export function doorLabel(via: string | null | undefined): string {
  const list = doors(via);
  if (list.length === 0) return "";
  return list.map((d) => DOOR_LABELS[d] ?? d).join(" + ");
}

/** האם החיבור הישיר לפייסבוק הביא את ההגעה הזו */
export function cameFromFacebook(via: string | null | undefined): boolean {
  return doors(via).includes(DOOR_FACEBOOK);
}

/** שולף מתוך שורת יומן את מזהי הלידים שפייסבוק שלחה */
export function leadIdsInLog(payload: unknown): string[] {
  const found = new Set<string>();

  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      /**
       * שני השמות שבהם המזהה מופיע: leadgen_id בהתראה
       * עצמה, ו-fb_leadid בפרטים שנמשכו.
       */
      if ((key === "leadgen_id" || key === "fb_leadid") && typeof value === "string") {
        if (value.trim()) found.add(value.trim());
      }

      walk(value, depth + 1);
    }
  };

  walk(payload, 0);
  return [...found];
}
