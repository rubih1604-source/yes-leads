/**
 * ============================================================
 *  מה ההודעה הזו, ומה צריך לקרות איתה
 * ============================================================
 *
 *  **למה הקובץ הזה קיים.**
 *
 *  עד כה כל חלק במערכת הכריע לבד: הבוט בדק אם זו תגובה
 *  לדיוור, המסך בדק משהו דומה, והדיוור סימן הודעות בלי
 *  לדעת מי יקרא את הסימון. כל אחד ראה חוט אחד ולא את
 *  השרשרת - ולכן יצא שלקוח שקיבל הצעת מחיר בשבוע שעבר
 *  נשאל "האם אתה לקוח קיים של yes?".
 *
 *  כאן ההכרעה נעשית **פעם אחת**, ממקום שרואה את כל התמונה:
 *  מאיפה האדם הגיע, מה נשלח אליו, ומי הוא ביחס אליך.
 *  הבוט לא מחליט - הוא מבצע את מה שנקבע כאן.
 *
 *  טהור בכוונה: בלי מסד ובלי רשת, כדי שההכרעה שמנווטת
 *  לקוחות תהיה מכוסה בבדיקות.
 */

import { NON_LEAD_ORIGINS } from "./channel";
import {
  isBroadcastMessage,
  replyAfterBroadcast,
  REPLY_WINDOW_DAYS,
  type MessageLike,
  type ReplyWindow,
} from "./broadcast-replies";

/** דיוור לדאטה שנטענה - אנשים שאיננו מכירים */
export const KIND_DATA = "data";

/** דיוור ללידים שלך לפי סטטוס, או מבצע */
export const KIND_LEADS = "leads";

export type InboundDecision = {
  /** האם זו תגובה לדיוור כלשהו - מה שמכניס למסך ההתעניינות */
  isBroadcastReply: boolean;
  /** האם מותר לשאול את שאלת הסינון */
  askSupplier: boolean;
  /** החלון עצמו, אם זו תגובה לדיוור */
  window: ReplyWindow | null;
  /** למה הוחלט ככה - נרשם ומוצג באבחון */
  reason: string;
};

export type InboundInput = {
  /**
   * מתי נשלח דיוור לרשימה שהאדם הזה נמצא בה, אם בכלל.
   *
   * **למה זה קיים.** הרשימה שנטענה יושבת במערכת מרגע
   * השמירה, והיא יודעת מי נמען דיוור - גם אם רישום
   * ההודעה היוצאת חסר. זה מה שקרה לוויויאן: היא קיבלה
   * את הדיוור, אבל לא נרשמה עליה אף הודעה, ולכן הבוט
   * לא ידע שהיא עונה לדיוור ושתק.
   *
   * הרשימה היא מקור אמת שני ובלתי תלוי לאותה שאלה.
   */
  listSendAt?: Date | null;
  /** כל ההודעות של הליד, בכל סדר */
  messages: MessageLike[];
  /** הבעלות של הליד */
  origin: string;
  /**
   * מתי נשאל שאלת הסינון בפעם האחרונה, אם בכלל.
   *
   * **למה תאריך ולא "כן/לא".**
   *
   * הכלל הוא "שואלים פעם אחת לכל דיוור", לא פעם אחת
   * לכל החיים. מי שנשאל בדיוור של אוקטובר ועונה למבצע
   * של נובמבר הוא תגובה חדשה לגמרי - ובערך בוליאני הוא
   * היה נחסם לנצח, בשקט.
   *
   * ההשוואה נעשית כאן כי כאן יודעים מתי יצא הדיוור
   * שהתגובה הזו שייכת לו.
   */
  askedAt?: Date | null;
  /** האם הוא ברשימה השחורה */
  blacklisted: boolean;
  /**
   * לשאול את שאלת הסינון **כל** מי שענה לדיוור, גם ליד
   * שאתה מכיר.
   *
   * **למה זה הגיוני דווקא בדיוור מבצע.** בדרך כלל ליד
   * שלך לא נשאל, כי אתה יודע מי הוא. אבל מבצע יוצא
   * לרשימה שלמה, וגם מי שדיברת איתו לפני חודשיים יכול
   * להיות כבר לקוח של yes - ואז אין מה למכור לו, וצריך
   * להפנות אותו לשירות.
   *
   * ההחלטה הזו היא שלך ולא של המערכת, ולכן היא מתג
   * בהגדרות ולא ניחוש לפי תוכן ההודעה.
   */
  askEveryone?: boolean;
  now: Date;
};

/**
 * סוג הדיוור האחרון שנשלח אליו.
 *
 * שורות שנרשמו לפני שהשדה קיים נושאות רק את הסימון
 * הבוליאני. הן נחשבות "leads" - השמרני מבין השניים, כי
 * שאלת סינון שנשלחת בטעות ללקוח אמיתי מזיקה, ואילו שאלה
 * שלא נשלחה סתם לא נשלחה.
 */
export function lastBroadcastKind(messages: MessageLike[]): string | null {
  const broadcasts = messages
    .filter(isBroadcastMessage)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const last = broadcasts[broadcasts.length - 1];
  if (!last) return null;

  if (last.broadcastKind === KIND_DATA) return KIND_DATA;
  if (last.broadcastKind === KIND_LEADS) return KIND_LEADS;

  return KIND_LEADS;
}

/**
 * חלון תגובה שנבנה מהרשימה שנטענה, כשאין רישום הודעה.
 *
 * דיוור לרשימה הוא תמיד דיוור לדאטה - זה בדיוק מה שהוא -
 * ולכן כאן הבוט כן שואל את שאלת הסינון.
 */
function windowFromList(input: InboundInput): ReplyWindow | null {
  const sentAt = input.listSendAt;
  if (!sentAt) return null;

  const cutoff = new Date(
    sentAt.getTime() + REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const reply = [...input.messages]
    .filter(
      (m) =>
        m.direction === "in" &&
        m.createdAt > sentAt &&
        m.createdAt <= cutoff &&
        m.createdAt <= input.now
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

  if (!reply) return null;

  return {
    broadcastAt: sentAt,
    broadcastLabel: "דיוור לרשימה",
    repliedAt: reply.createdAt,
    replyText: (reply.bodyText ?? "").slice(0, 300),
  };
}

/**
 * ההכרעה היחידה על הודעה נכנסת.
 */
export function decideInbound(input: InboundInput): InboundDecision {
  const window =
    replyAfterBroadcast(input.messages, input.now) ??
    windowFromList(input);

  if (!window) {
    return {
      isBroadcastReply: false,
      askSupplier: false,
      window: null,
      reason: "לא תגובה לדיוור",
    };
  }

  /**
   * אם ההכרעה נשענה על הרשימה שנטענה - זה דיוור לדאטה
   * בהגדרה, ואין צורך לחפש סוג בהודעות שאולי לא נרשמו.
   */
  const kind =
    lastBroadcastKind(input.messages) ??
    (input.listSendAt ? KIND_DATA : null);

  if (input.blacklisted) {
    return {
      isBroadcastReply: true,
      askSupplier: false,
      window,
      reason: "ברשימה השחורה - לא פונים אליו",
    };
  }

  /**
   * נשאל **בתוך הדיוור הזה** - לא נשאל שוב.
   * נשאל לפניו - זה דיוור חדש, והשאלה פתוחה מחדש.
   */
  const askedThisBroadcast =
    Boolean(input.askedAt) &&
    input.askedAt!.getTime() >= window.broadcastAt.getTime();

  if (askedThisBroadcast) {
    return {
      isBroadcastReply: true,
      askSupplier: false,
      window,
      reason: "שאלת הסינון כבר נשלחה אליו",
    };
  }

  /**
   * ============================================================
   *  הליד שלך לעולם לא נשאל אם הוא לקוח קיים
   * ============================================================
   *
   *  **זה החור שנפתח ב-164, וזו הסגירה שלו.**
   *
   *  כשהוספתי את הרשימה שנטענה כמקור אמת שני, היא הפכה
   *  למקור **יחיד**: די היה שמספר כלשהו נמצא באחת
   *  הרשימות שהעלית כדי שכל הודעה ממנו תיחשב תגובה
   *  לדיוור. קובץ דאטה מכיל אלפי מספרים, וחלקם כבר
   *  לידים שלך - ולכן לקוח שאתה מטפל בו קיבל את שאלת
   *  הסינון.
   *
   *  **הבעלות גוברת על הכל.** ליד שהוא שלך - נכנס
   *  מפייסבוק, מליד מנגר, או שהעלית אותו בעצמך - הוא
   *  אדם שאתה מכיר. לשאול אותו "האם אתה לקוח יס" זה
   *  לגלות שאינך זוכר מי הוא, וזה לא קורה יותר.
   *
   *  השדה origin הועבר לכאן מההתחלה ופשוט לא נבדק. זו
   *  הייתה הטעות.
   */
  const mine = !NON_LEAD_ORIGINS.includes(input.origin);

  if (mine && !input.askEveryone) {
    return {
      isBroadcastReply: true,
      askSupplier: false,
      window,
      reason: "הליד שלך - אתה מכיר אותו, ולכן לא נשאלת שאלת סינון",
    };
  }

  /**
   * ============================================================
   *  למה אין כאן תנאי נוסף
   * ============================================================
   *
   *  **היה כאן תנאי, והוא חסם בדיוק את מה שצריך לעבוד.**
   *
   *  דרשתי שחברות ברשימה תיחשב רק למי שהבעלות שלו היא
   *  "broadcast". אבל אדם מרשימת דאטה הוא לא ליד בכלל
   *  עד שהוא עונה - וברגע שהוא עונה הוא נוצר עם בעלות
   *  "whatsapp". כלומר התנאי פסל את כל נמעני הדיוור
   *  האמיתיים, ולא השאיר אף אחד שכן ייענה.
   *
   *  בדיקת הבעלות שלמעלה כבר עושה את כל העבודה: ליד
   *  שהוא שלך נעצר שם. מי שהגיע עד לכאן אינו ליד שלך,
   *  והוא בתוך רשימה שנשלחה - זו ראיה מספקת.
   */

  /**
   * **דיוור ללידים שלך אינו דיוור לדאטה.**
   *
   * דיוור שיוצא לפי סטטוס מגיע לאנשים שכבר דיברת איתם.
   * לשאול אותם "האם אתם לקוחות yes" זה לגלות שאינך זוכר
   * מי הם. השאלה נועדה לרשימה שנטענה מקובץ בלבד.
   */
  if (kind !== KIND_DATA && !input.askEveryone) {
    return {
      isBroadcastReply: true,
      askSupplier: false,
      window,
      reason:
        "דיוור ללידים שלך - הוא כבר מוכר לך, ולכן לא נשאלת שאלת סינון",
    };
  }

  return {
    isBroadcastReply: true,
    askSupplier: true,
    window,
    reason: input.askEveryone
      ? "תגובה לדיוור · מצב מבצע - שואלים את כולם"
      : "תגובה לדיוור מדאטה שנטענה",
  };
}
