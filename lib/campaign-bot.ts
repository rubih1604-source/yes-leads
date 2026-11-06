/**
 * ============================================================
 *  בוט הדיוור - מתג אחד, שתי שאלות, בלי חסימות נסתרות
 * ============================================================
 *
 *  **מה הוא עושה, במלואו:**
 *
 *    1. ביקש הסרה       → רשימה שחורה, ולא עונים לו כלום
 *    2. לא קיבל את הדיוור → שותק לגמרי
 *    3. סיים תהליך לאחרונה → שותק 24 שעות מולו
 *    4. נשאל מתי נוח לו  → קורא את השעה ופותח תזכורת
 *    5. אמר שהוא לקוח    → *2080 + סטטוס "לקוח קיים"
 *    6. כבר נשאל         → קורא את התשובה ועונה לפיה
 *    7. לא נשאל          → שואל
 *
 *  **שני שלבים, לא אחד.** "לא, אני לא לקוח" הוא חצי
 *  התהליך: אחריו נשאלת השעה, והתשובה הופכת לתזכורת עם
 *  השם והמספר. התהליך נסגר רק כשיש תזכורת.
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
 *  כאן אין אף אחת מהן. **התנאים הם ארבעה, וכולם
 *  גלויים:** המתג דלוק, הוא לא ברשימה השחורה, **הדיוור
 *  הגיע אליו**, ולא סגרנו איתו תהליך ב-24 השעות
 *  האחרונות.
 *
 *  התנאי השלישי נוסף אחרי שהבוט ענה ללקוחות פרטיים
 *  ולחברים - אנשים שקיבלו שאלה על מבצע שלא שמעו עליו.
 *  הוא נמדד מול הטקסט של הדיוור שבהגדרות, ולא מול
 *  ניחוש על "מי נראה כמו נמען".
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
  TIME_ASKED_EVENT,
  ASK_TIME_AGAIN,
  MAX_TIME_ASKS,
} from "./supplier-check";
import { parseWhen, freeSlot } from "./when";
import { displayPhone } from "./phone";
import {
  receivedCampaign,
  CAMPAIGN_WINDOW_DAYS,
} from "./campaign-audience";

export type CampaignAction =
  | "off"
  | "blacklisted"
  | "not-recipient"
  | "quiet"
  | "asked"
  | "asked-again"
  | "answered-yes"
  | "answered-no"
  | "reminder-set"
  | "asked-time-again"
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
  const now = new Date();
  const windowStart = new Date(
    now.getTime() - CAMPAIGN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      phone: true,
      chatId: true,
      doNotContact: true,
      messages: {
        where: { direction: "out", createdAt: { gte: windowStart } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { bodyText: true, broadcast: true, createdAt: true },
      },
    },
  });

  if (!lead || lead.doNotContact) return false;

  /**
   * **גם הפעולה הידנית מוגבלת לנמענים.**
   *
   * בלי זה נשאר דלת אחורית: הפעולה בוחרת "כל מי שהגיב
   * ב-12 השעות האחרונות", וזה כולל לקוחות פרטיים. אותו
   * כלל, בשני המסלולים - אחרת תוקן רק אחד מהם.
   */
  const { getSettings: readSettings } = await import("./settings");
  const settings = await readSettings();

  const audience = receivedCampaign({
    campaignText: settings.campaignText,
    outgoing: lead.messages,
    listSendAt: await listSendFor(lead.phone),
    now,
  });

  if (!audience.yes) return false;

  const sent = await send(lead, SUPPLIER_QUESTION);
  if (sent) await mark(lead.id, ASKED_EVENT, { again: false, catchUp: true });

  return sent;
}

/**
 * מתי יצא אליו דיוור מרשימה שהעלית.
 *
 * **המקור השני, וזה שהציל את הזיהוי.** אדם שקיבל דיוור
 * מרשימה שנטענה - לפעמים לא נרשמה עליו שום הודעה יוצאת
 * אצלנו, ולכן אין מה להתאים לפי טקסט. הרשימה עצמה יודעת
 * שהוא נמען.
 *
 * כישלון בשליפה לא יכול לחסום את הבוט, ולכן הוא נבלע
 * ומוחזר null: הזיהוי ימשיך לפי הטקסט.
 */
async function listSendFor(phone: string): Promise<Date | null> {
  try {
    const { lastListSendFor } = await import("./broadcast-membership");
    return await lastListSendFor(phone);
  } catch {
    return null;
  }
}

/**
 * ============================================================
 *  התזכורת לחזור ללקוח
 * ============================================================
 *
 *  **מה היא כוללת.** השם, המספר, ומה הלקוח אמר בדיוק -
 *  כדי שכשהתזכורת קופצת בנייד אתה יודע למי להתקשר ולמה,
 *  בלי להיכנס לשום מסך.
 *
 *  **ולמה הפריסה.** אם חמישה לקוחות אמרו "מחר בבוקר",
 *  כולם נופלים על 9:00 - חמש תזכורות באותה דקה, ואין שום
 *  סיכוי לטפל בהן. הם נפרסים 9:00, 9:05, 9:10, לפי הסדר
 *  שבו הם ענו.
 *
 *  התזכורת עצמה יוצאת מהמנוע שמריץ תזכורות משימה, ולכן
 *  היא מגיעה לנייד כמו כל תזכורת אחרת - בלי מנגנון שני.
 */
async function openReminder(params: {
  leadId: string;
  name: string;
  phone: string;
  desired: Date;
  label: string;
  said: string;
}): Promise<Date> {
  /**
   * כל התזכורות שכבר נקבעו סביב הזמן המבוקש. חלון של
   * שעתיים מכסה בשפע פריסה של 5 דקות, גם אם 20 אנשים
   * אמרו את אותו דבר.
   */
  const around = await db.task
    .findMany({
      where: {
        done: false,
        dueAt: {
          gte: new Date(params.desired.getTime() - 2 * 60 * 60 * 1000),
          lte: new Date(params.desired.getTime() + 2 * 60 * 60 * 1000),
        },
      },
      select: { dueAt: true },
    })
    .catch(() => []);

  const taken = around
    .map((t) => t.dueAt)
    .filter((d): d is Date => d !== null);

  const at = freeSlot(params.desired, taken);

  await db.task
    .create({
      data: {
        leadId: params.leadId,
        title: `לחזור ל${params.name}`,
        body: `${displayPhone(params.phone)} · ביקש ${params.label}\nכתב: "${params.said.slice(0, 200)}"`,
        dueAt: at,
        sourceQuestion: params.said.slice(0, 200),
      },
    })
    .catch(() => null);

  await mark(params.leadId, "callback_scheduled", {
    at: at.toISOString(),
    label: params.label,
    said: params.said.slice(0, 200),
  });

  return at;
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

  const windowStart = new Date(
    now.getTime() - CAMPAIGN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const lead = await db.lead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true,
      phone: true,
      chatId: true,
      doNotContact: true,
      firstName: true,
      lastName: true,
      /**
       * ההודעות שיצאו אליו, לזיהוי "קיבל את הדיוור".
       * נשלפות בחלון בלבד - אין צורך בהיסטוריה מלאה.
       */
      messages: {
        where: { direction: "out", createdAt: { gte: windowStart } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { bodyText: true, broadcast: true, createdAt: true },
      },
      events: {
        where: {
          type: { in: [ASKED_EVENT, DONE_EVENT, TIME_ASKED_EVENT] },
        },
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

  /**
   * ============================================================
   *  2. רק מי שקיבל את הדיוור
   * ============================================================
   *
   *  **למה זה כאן, ולמה אחרי בקשת ההסרה.**
   *
   *  בלי התנאי הזה הבוט ענה לכל מי שכתב - לקוחות פרטיים,
   *  חברים, ואנשים שדיברת איתם לפני חודשיים קיבלו שאלה
   *  על מבצע שלא שמעו עליו.
   *
   *  **בקשת הסרה קודמת לו בכוונה.** מי שמבקש להפסיק
   *  נחסם, גם אם מעולם לא קיבל דיוור. זכות ההסרה לא
   *  תלויה בשום תנאי.
   *
   *  שדה ריק = הבוט שותק לכולם. זו בחירה מכוונת: עדיף
   *  שלא יענה לאף אחד מאשר שיענה לכל אדם שכותב.
   */
  const audience = receivedCampaign({
    campaignText: settings.campaignText,
    outgoing: lead.messages,
    listSendAt: await listSendFor(lead.phone),
    now,
  });

  if (!audience.yes) {
    return { action: "not-recipient", reason: audience.why };
  }

  /* ---------- 3. שקט של 24 שעות אחרי תהליך שנסגר ---------- */
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

  const timeAsks = lead.events.filter(
    (e) =>
      e.type === TIME_ASKED_EVENT &&
      (!since || e.createdAt.getTime() > since.getTime())
  );

  /**
   * ============================================================
   *  4. חיכינו לשעה - וזו התשובה
   * ============================================================
   *
   *  הלקוח כבר אמר שהוא לא לקוח קיים, וקיבל "מתי נוח
   *  לכם?". מה שהוא כותב עכשיו הוא השעה.
   *
   *  **זה קודם לכל השאר** - אחרת "מחר בבוקר" היה נקרא
   *  כתשובה לא ברורה לשאלת הסינון, והבוט היה שואל אותה
   *  שוב.
   */
  if (timeAsks.length > 0) {
    const when = parseWhen(params.text, now);

    if (when.kind === "at") {
      const at = await openReminder({
        leadId: lead.id,
        name:
          [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
          lead.phone,
        phone: lead.phone,
        desired: when.at,
        label: when.label,
        said: params.text,
      });

      await finish(lead.id, "נקבעה חזרה");

      return {
        action: "reminder-set",
        reason: `הלקוח ביקש ${when.label} - נפתחה תזכורת ל-${at.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
      };
    }

    /* לא הצלחנו להבין שעה - מבקשים לדייק, פעם אחת */
    if (timeAsks.length < MAX_TIME_ASKS) {
      const sent = await send(lead, ASK_TIME_AGAIN);
      if (sent) await mark(lead.id, TIME_ASKED_EVENT, { again: true });

      return sent
        ? { action: "asked-time-again", reason: "לא הובנה שעה - התבקש לדייק" }
        : { action: "send-failed", reason: "בקשת הדיוק לא נשלחה" };
    }

    /**
     * ביקשנו פעמיים ואין שעה. עוצרים ומעבירים אליך -
     * הוא מתעניין, והוא לא יכול ליפול בין הכיסאות.
     */
    await db.alert
      .create({
        data: {
          leadId: lead.id,
          title: "מתעניין - לא הצלחתי לקבוע שעה",
          body: `${
            [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
            lead.phone
          }: "${params.text.slice(0, 150)}"`,
        },
      })
      .catch(() => null);

    await finish(lead.id, "מתעניין - בלי שעה");

    return {
      action: "needs-you",
      reason: "מתעניין, אבל לא הצלחתי להבין מתי נוח לו",
    };
  }

  /* ---------- 5. אמר מעצמו שהוא לקוח ---------- */
  if (statesExistingCustomer(params.text)) {
    const sent = await send(lead, replyForAnswer("yes")!);
    await setExistingCustomer(lead.id, "אמר מעצמו שהוא כבר לקוח");
    await finish(lead.id, "לקוח קיים");

    return sent
      ? { action: "answered-yes", reason: "הצהיר שהוא לקוח קיים" }
      : { action: "send-failed", reason: "התשובה ללקוח קיים לא נשלחה" };
  }

  /* ---------- 6. כבר נשאל - זו התשובה ---------- */
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
      /**
       * ============================================================
       *  "לא" פותח את השלב השני, ולא סוגר את התהליך
       * ============================================================
       *
       *  התשובה שיוצאת כאן היא "מעולה, אתפנה ואיצור איתכם
       *  קשר. מתי נוח לכם?" - כלומר שאלה שמחכה לתשובה.
       *
       *  **אם היינו סוגרים כאן, השקט של 24 השעות היה בולע
       *  בדיוק את התשובה הזו.** הלקוח היה כותב "מחר
       *  בבוקר", הבוט היה שותק, ואף תזכורת לא הייתה
       *  נפתחת. לכן התהליך נשאר פתוח עד שיש שעה.
       */
      const sent = await send(lead, replyForAnswer("no")!);
      if (sent) await mark(lead.id, TIME_ASKED_EVENT, { first: true });

      return sent
        ? { action: "answered-no", reason: "ענה שאינו לקוח - נשאל מתי נוח לו" }
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

  /* ---------- 7. לא נשאל - שואלים ---------- */
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
