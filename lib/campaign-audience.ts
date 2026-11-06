import { normalizeText } from "./unsubscribe";

/**
 * ============================================================
 *  מי קיבל את הדיוור
 * ============================================================
 *
 *  **הבעיה שזה פותר.** הבוט ענה לכל מי שכתב - כולל לקוחות
 *  פרטיים, חברים, ואנשים שדיברו איתך לפני חודשיים. הם
 *  קיבלו שאלה על מבצע שהם לא שמעו עליו.
 *
 *  **למה התאמה לפי הטקסט, ולא "מה שהמערכת רשמה".**
 *
 *  דיוור שיצא ישירות מטקסטר נרשם אצלנו כהודעה יוצאת
 *  רגילה - בלי סימון דיוור ובלי שם תבנית. מבחינת המערכת
 *  הוא נראה בדיוק כמו הודעה שהקלדת ביד. כלומר אין שום
 *  דרך לדעת מי קיבל דיוור, חוץ מלזהות את **הטקסט** שלו.
 *
 *  **ולמה לא השוואה פשוטה של מלה במלה.** תבנית יוצאת עם
 *  משתנים: "היי {{1}}, יש לנו מבצע..." - ומה שחוזר מטקסטר
 *  הוא "היי אושר, יש לנו מבצע...". השוואה מלאה נכשלת על
 *  כל נמען. לכן הטקסט נחתך ל**עוגנים**: הקטעים הקבועים
 *  שבין המשתנים, ומספיק שאחד מהם מופיע בהודעה שיצאה אליו.
 *
 *  המודול הזה טהור - בלי מסד ובלי רשת - כדי שהוא יהיה
 *  מכוסה בבדיקות. החלק הזה הוא בדיוק החלק שאם הוא שוגה,
 *  כל הנמענים נחסמים ואף אחד לא מקבל תשובה. זה כבר קרה.
 */

/** כמה זמן אחורה הגעת דיוור עוד נחשבת */
export const CAMPAIGN_WINDOW_DAYS = 14;

/**
 * אורך מינימלי לעוגן.
 *
 * קטע קצר מדי מופיע בכל הודעה שנייה ("היי", "תודה"), והיה
 * מזהה כל אדם כנמען דיוור - כלומר מבטל את כל הסינון.
 */
export const ANCHOR_MIN_CHARS = 12;

/** כמה עוגנים נבדקים. יותר מזה לא מוסיף דיוק */
const MAX_ANCHORS = 6;

/**
 * הקטעים הקבועים של הדיוור.
 *
 * חותך על משתנים של תבניות ({{1}}, {{שם}}, [שם]), על שורות,
 * ועל סימני פיסוק חזקים. מחזיר מהארוך לקצר - הארוך הוא
 * המזהה החזק ביותר.
 */
export function anchorsOf(campaignText: string): string[] {
  const parts = (campaignText ?? "")
    .split(/\{\{[^}]*\}\}|\[[^\]]*\]|\n|\r|[.!?;|]/g)
    .map((part) => normalizeText(part))
    .filter((part) => part.length >= ANCHOR_MIN_CHARS);

  const unique = Array.from(new Set(parts));
  unique.sort((a, b) => b.length - a.length);

  return unique.slice(0, MAX_ANCHORS);
}

export type OutgoingLike = {
  bodyText: string | null;
  broadcast?: boolean | null;
  createdAt: Date;
};

export type AudienceResult = {
  /** האם הדיוור הגיע אליו */
  yes: boolean;
  /** במה זוהה, או למה לא - נרשם ומוצג באבחון */
  why: string;
};

/**
 * האם האדם הזה קיבל את הדיוור.
 *
 * שלושה סימנים, וכל אחד מהם מספיק. הראשון הוא הסימון של
 * המערכת, השני הטקסט עצמו, והשלישי רשימה שהעלית - ורשימה
 * כזו היא המקרה שבו לא נרשמה שום הודעה יוצאת בכלל.
 */
export function receivedCampaign(params: {
  campaignText: string;
  outgoing: OutgoingLike[];
  /** מתי יצא אליו דיוור מרשימה שהעלית */
  listSendAt?: Date | null;
  now: Date;
  windowDays?: number;
}): AudienceResult {
  const days = params.windowDays ?? CAMPAIGN_WINDOW_DAYS;
  const since = params.now.getTime() - days * 24 * 60 * 60 * 1000;

  const text = (params.campaignText ?? "").trim();

  if (!text) {
    return { yes: false, why: "לא הוכנס טקסט דיוור בהגדרות" };
  }

  /* ---------- רשימה שהעלית ---------- */
  if (params.listSendAt && params.listSendAt.getTime() >= since) {
    return { yes: true, why: "מופיע ברשימת דיוור שנשלחה" };
  }

  const recent = params.outgoing.filter(
    (m) => m.createdAt.getTime() >= since
  );

  /* ---------- סימון של המערכת ---------- */
  if (recent.some((m) => m.broadcast === true)) {
    return { yes: true, why: "יצאה אליו הודעה שמסומנת כדיוור" };
  }

  /* ---------- הטקסט עצמו ---------- */
  const anchors = anchorsOf(text);

  if (anchors.length === 0) {
    return {
      yes: false,
      why: `הטקסט שהוכנס קצר מדי לזיהוי - צריך קטע רצוף של ${ANCHOR_MIN_CHARS} אותיות לפחות`,
    };
  }

  for (const message of recent) {
    const body = normalizeText(message.bodyText ?? "");
    if (!body) continue;

    for (const anchor of anchors) {
      if (body.includes(anchor)) {
        return { yes: true, why: "הטקסט של הדיוור זוהה בהודעה שיצאה אליו" };
      }
    }
  }

  if (recent.length === 0) {
    return {
      yes: false,
      why: `לא יצאה אליו שום הודעה ב-${days} הימים האחרונים`,
    };
  }

  return {
    yes: false,
    why: "יצאו אליו הודעות, אבל אף אחת מהן אינה הדיוור",
  };
}
