/**
 * ============================================================
 *  בוט הדיוור - מתג אחד, שתי שאלות, בלי חסימות נסתרות
 * ============================================================
 *
 *  **מה הוא עושה, במלואו:**
 *
 *    1. ביקש הסרה       → רשימה שחורה, ולא עונים לו כלום
 *    2. סיים תהליך לאחרונה → שותק 24 שעות מולו
 *    3. אמר שהוא לקוח    → *2080 + סטטוס "לקוח קיים"
 *    4. כבר נשאל         → קורא את התשובה ועונה לפיה
 *    5. לא נשאל          → שואל
 *
 *  **ומה שהוא לא עושה - וזה העיקר.**
 *
 *  הגרסה הקודמת עברה דרך שער משותף עם שבע חסימות שנבנו
 *  לשיחה רגילה, וכל אחת מהן השתיקה אותו בלי סימן:
 *
 *    · "אתה בשיחה עם הלקוח"    - הדיוור עצמו נקרא בטעות
 *                                 כתשובה שלך
 *    · "הלקוח שלח שתי הודעות"  - כלומר הלקוח הכי חם
 *    · "הבוט כבר ענה לאחרונה"  - **חסם את התשובה לשאלה
 *                                 של הבוט עצמו**
 *    · שעות פעילות             - מי שענה ב-23:30 לא קיבל
 *    · מגבלת סטטוסים
 *
 *  כאן אין אף אחת מהן. **התנאים היחידים הם שלושה:**
 *  המתג דלוק, הוא לא ברשימה השחורה, ולא סגרנו איתו
 *  תהליך ב-24 השעות האחרונות.
 *
 *  **שים לב: אין שעות.** מי שכותב ב-3 לפנות בוקר יקבל
 *  תשובה. המתג הוא השליטה שלך - מדליקים לדיוור, מכבים
 *  אחריו.
 */

import { db } from "./db";
import { sendSessionMessage, searchChatByPhone, extractChatId } from "./texter";
import { getSettings } from "./settings";
import { detectUnsubscribe } from "./unsubscribe";
import { addToBlacklist } from "./blacklist";
import {
  SUPPLIER_QUESTION,
  SUPPLIER_QUESTION_AGAIN,
  MAX_SUPPLIER_ASKS,
  ASKED_EVENT,
  NEEDS_YOU_EVENT,
  readSupplierAnswer,
  statesExistingCustomer,
  replyForAnswer,
  DONE_EVENT,
  QUIET_HOURS,
} from "./supplier-check";

export type CampaignAction =
  | "off"
  | "blacklisted"
  | "quiet"
  | "asked"
  | "asked-again"
  | "answered-yes"
  | "answered-no"
  | "needs-you"
  | "send-failed";

export type CampaignResult = {
  action: CampaignAction;
  reason: string;
};

/* ============================================================
 *  שליחה
 * ============================================================ */

async function send(
  lead: { id: string; phone: string; chatId: string | null },
  text: string
): Promise<boolean> {
  let chatId = lead.chatId;

  if (!chatId) {
    const found = await searchChatByPhone(lead.phone).catch(() => null);
    chatId = found ? extractChatId(found) : null;

    if (chatId) {
      await db.lead
        .update({ where: { id: lead.id }, data: { chatId } })
        .catch(() => null);
    }
  }

  if (!chatId) {
    await db.message
      .create({
        data: {
          leadId: lead.id,
          direction: "out",
          bodyText: text,
          status: "failed",
          error: "לא נמצא מזהה צ'אט בטקסטר",
        },
      })
      .catch(() => null);
    return false;
  }

  const result = await sendSessionMessage({ chatId, text }).catch(() => ({
    ok: false as const,
    error: "שליחה נכשלה",
  }));

  await db.message
    .create({
      data: {
        leadId: lead.id,
        direction: "out",
        bodyText: text,
        status: result.ok ? "sent" : "failed",
        error: result.ok
          ? null
          : String((result as { error?: string }).error ?? "שגיאה"),
      },
    })
    .catch(() => null);

  return result.ok;
}

/**
 * שליחת שאלת הסינון ביוזמתנו, בלי שהלקוח כתב עכשיו.
 *
 * **למה זה קיים.** מי שהגיב בזמן שהבוט היה שבור לא נשאל
 * מעולם, ואין דרך לגרום לו לכתוב שוב. הפעולה "שלח שאלת
 * סינון למי שהגיב ולא נשאל" משתמשת בזה.
 *
 * זו **אותה** שליחה ואותו רישום של הבוט עצמו - ולכן מי
 * שנשאל כאן ייקרא נכון כשיענה, ולא יישאל פעמיים.
 */
export async function askSupplierQuestion(leadId: string): Promise<boolean> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, phone: true, chatId: true, doNotContact: true },
  });

  if (!lead || lead.doNotContact) return false;

  const sent = await send(lead, SUPPLIER_QUESTION);
  if (sent) await mark(lead.id, ASKED_EVENT, { again: false, catchUp: true });

  return sent;
}

async function mark(leadId: string, type: string, payload: object) {
  await db.leadEvent
    .create({ data: { leadId, type, actor: "bot", payload } })
    .catch(() => null);
}

/**
 * סגירת התהליך מול מספר.
 *
 * **זו הנקודה שממנה נספרות 24 השעות.** התהליך נסגר
 * כשידוע אם הוא לקוח או לא - ולא לפני כן.
 */
async function finish(leadId: string, outcome: string) {
  await mark(leadId, DONE_EVENT, { outcome });
}

/* ============================================================
 *  ההחלטה המלאה
 * ============================================================ */

export async function handleCampaignReply(params: {
  leadId: string;
  text: string;
  now?: Date;
}): Promise<CampaignResult> {
  const now = params.now ?? new Date();
  const settings = await getSettings();

  if (!settings.campaignBot) {
    return { action: "off", reason: "מתג בוט הדיוור כבוי" };
  }

  const lead = await db.lead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true,
      phone: true,
      chatId: true,
      doNotContact: true,
      events: {
        where: { type: { in: [ASKED_EVENT, DONE_EVENT] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { type: true, createdAt: true },
      },
    },
  });

  if (!lead) return { action: "off", reason: "הליד לא נמצא" };

  /* ---------- 1. בקשת הסרה - קודמת לכל ---------- */
  const removal = detectUnsubscribe(params.text);

  if (removal.blacklist) {
    await addToBlacklist({
      leadId: lead.id,
      reason: removal.reason ?? "ביקש להסיר",
      text: params.text,
    });
    await finish(lead.id, "הסרה");
    return { action: "blacklisted", reason: "ביקש שלא לפנות אליו" };
  }

  if (lead.doNotContact) {
    return { action: "blacklisted", reason: "כבר ברשימה השחורה" };
  }

  /* ---------- 2. שקט של 24 שעות אחרי תהליך שנסגר ---------- */
  const lastDone = lead.events.find((e) => e.type === DONE_EVENT);

  if (lastDone) {
    const hours = (now.getTime() - lastDone.createdAt.getTime()) / 3600000;

    if (hours < QUIET_HOURS) {
      const left = Math.ceil(QUIET_HOURS - hours);
      return {
        action: "quiet",
        reason: `התהליך נסגר מולו לפני ${Math.floor(hours)} שעות - שקט עוד ${left} שעות`,
      };
    }
  }

  /**
   * השאלות נספרות **מאז סגירת התהליך האחרונה בלבד**.
   * בלי זה, מי שסגר תהליך לפני חודש היה נחשב "כבר נשאל"
   * לנצח ולא היה נשאל שוב במבצע הבא.
   */
  const since = lastDone?.createdAt;

  const asks = lead.events.filter(
    (e) =>
      e.type === ASKED_EVENT &&
      (!since || e.createdAt.getTime() > since.getTime())
  );

  /* ---------- 3. אמר מעצמו שהוא לקוח ---------- */
  if (statesExistingCustomer(params.text)) {
    const sent = await send(lead, replyForAnswer("yes")!);
    await setExistingCustomer(lead.id, "אמר מעצמו שהוא כבר לקוח");
    await finish(lead.id, "לקוח קיים");

    return sent
      ? { action: "answered-yes", reason: "הצהיר שהוא לקוח קיים" }
      : { action: "send-failed", reason: "התשובה ללקוח קיים לא נשלחה" };
  }

  /* ---------- 4. כבר נשאל - זו התשובה ---------- */
  if (asks.length > 0) {
    const answer = readSupplierAnswer(params.text);

    if (answer === "yes") {
      const sent = await send(lead, replyForAnswer("yes")!);
      await setExistingCustomer(lead.id, "ענה שהוא כבר לקוח");
      await finish(lead.id, "לקוח קיים");

      return sent
        ? { action: "answered-yes", reason: "ענה שהוא לקוח קיים" }
        : { action: "send-failed", reason: "התשובה לא נשלחה" };
    }

    if (answer === "no") {
      const sent = await send(lead, replyForAnswer("no")!);
      await finish(lead.id, "מתעניין");

      return sent
        ? { action: "answered-no", reason: "ענה שאינו לקוח - מתעניין" }
        : { action: "send-failed", reason: "התשובה לא נשלחה" };
    }

    /* תשובה שלא הכריעה - שואלים שוב, פעם אחת */
    if (asks.length < MAX_SUPPLIER_ASKS) {
      const sent = await send(lead, SUPPLIER_QUESTION_AGAIN);
      if (sent) await mark(lead.id, ASKED_EVENT, { again: true });

      return sent
        ? { action: "asked-again", reason: "התשובה לא הכריעה - נשאל שוב" }
        : { action: "send-failed", reason: "השאלה החוזרת לא נשלחה" };
    }

    /**
     * שאלנו פעמיים ועדיין לא ברור. עוצרים, מתריעים,
     * וסוגרים את התהליך - כדי שלא ייווצר לופ.
     */
    const already = lead.events.some((e) => e.type === NEEDS_YOU_EVENT);

    if (!already) {
      await db.alert
        .create({
          data: {
            leadId: lead.id,
            title: "ענה ולא ברור - צריך אותך",
            body: params.text.slice(0, 200),
          },
        })
        .catch(() => null);
      await mark(lead.id, NEEDS_YOU_EVENT, {
        text: params.text.slice(0, 200),
      });
    }

    await finish(lead.id, "לא ברור");
    return { action: "needs-you", reason: "ענה פעמיים ולא ברור" };
  }

  /* ---------- 5. לא נשאל - שואלים ---------- */
  const sent = await send(lead, SUPPLIER_QUESTION);
  if (sent) await mark(lead.id, ASKED_EVENT, { again: false });

  return sent
    ? { action: "asked", reason: "נשלחה שאלת הסינון" }
    : { action: "send-failed", reason: "שאלת הסינון לא נשלחה" };
}

/**
 * מעבר ל"לקוח קיים".
 *
 * **הייבוא דינמי בכוונה.** מנוע החוקים הוא בדיוק החלק
 * שתלות מעגלית בו הפילה את הבוט. הוא נטען רק כשצריך,
 * ו**אחרי** שהתשובה ללקוח כבר יצאה - ולכן כשל שלו לא
 * יכול למנוע מהלקוח לקבל מענה.
 */
async function setExistingCustomer(leadId: string, note: string) {
  try {
    const { applyStatusChange } = await import("./rules");
    await applyStatusChange({
      leadId,
      toStatus: "לקוח קיים",
      actor: "bot",
      note,
    });
  } catch {
    await db.lead
      .update({ where: { id: leadId }, data: { status: "לקוח קיים" } })
      .catch(() => null);
  }
}
