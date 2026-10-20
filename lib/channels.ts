/**
 * ============================================================
 *  ערוצים - מי מקבל את הליד
 * ============================================================
 *
 *  ערוץ הוא היחידה שמחזיקה הכל: אילו טפסים מזינים אותו,
 *  לאן נשלח, האם זה ערוץ מכירה, מה המחיר, ואם השליחה
 *  אוטומטית.
 *
 *  סדר ההכרעה על ליד שנכנס:
 *
 *    1. **טופס** - הטופס משויך לערוץ. זו הדרך הנכונה,
 *       והיא מה שאתה מגדיר במסך הערוץ.
 *    2. **שם הקמפיין מפייסבוק** - גיבוי לליד שמגיע בלי
 *       מזהה טופס (ליד מנגר).
 *    3. אין התאמה -> הליד שלך, כמו תמיד.
 *
 *  ברירת המחדל היא **שלך**, וזה בכוונה: ליד שלא הצלחנו
 *  לשייך נשאר אצלך ולא נמכר בטעות. הכשל נופל לכיוון
 *  שאפשר לתקן, לא לכיוון שגובה כסף מקונה.
 */

import type { LeadIdentifiers } from "./campaign-match";

export type ChannelConfig = {
  id: string;
  name: string;
  campaignName: string;
  isSale: boolean;
  price: number;
  autoSend: boolean;
  sendEnabled: boolean;
  hasUrl: boolean;
};

let cache: {
  at: number;
  byForm: Map<string, ChannelConfig>;
  byName: Map<string, ChannelConfig>;
} | null = null;

const CACHE_MS = 30_000;

export function clearChannelCache() {
  cache = null;
}

/** השוואה סלחנית, כמו בכל שאר המערכת */
function key(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function load() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const byForm = new Map<string, ChannelConfig>();
  const byName = new Map<string, ChannelConfig>();

  try {
    const { db } = await import("./db");

    const channels = await db.channel.findMany({
      where: { active: true },
      include: {
        campaign: { select: { name: true, active: true } },
        forms: { select: { formId: true, formName: true } },
      },
    });

    for (const channel of channels) {
      if (!channel.campaign.active) continue;

      const config: ChannelConfig = {
        id: channel.id,
        name: channel.name,
        campaignName: channel.campaign.name,
        isSale: channel.isSale,
        price: Number(channel.pricePerLead ?? 0),
        autoSend: channel.autoSend,
        sendEnabled: channel.sendEnabled,
        hasUrl: Boolean(channel.webhookUrl?.trim()),
      };

      for (const form of channel.forms) {
        byForm.set(form.formId, config);

        /**
         * שם הטופס הוא גם מפתח גיבוי: ליד מנגר שולחת שם
         * ולא מזהה, ובלי זה ליד כזה לא היה משויך.
         */
        if (form.formName) byName.set(key(form.formName), config);
      }

      /**
       * שם הערוץ עצמו הוא מפתח נוסף, כדי שקמפיין בפייסבוק
       * שנקרא כמו הערוץ ישויך מעצמו.
       */
      byName.set(key(channel.name), config);
    }
  } catch {
    // בלי מסד - אין ערוצים, והכל נשאר שלך
  }

  cache = { at: Date.now(), byForm, byName };
  return cache;
}

/**
 * הערוץ של ליד שנכנס עכשיו.
 *
 * מחזיר null אם אין התאמה, ואז הליד שלך.
 */
export async function channelForLead(
  ids: LeadIdentifiers
): Promise<ChannelConfig | null> {
  const { byForm, byName } = await load();

  if (byForm.size === 0 && byName.size === 0) return null;

  // 1. מזהה הטופס - הדרך הנכונה
  if (ids.formId) {
    const hit = byForm.get(ids.formId.trim());
    if (hit) return hit;

    /**
     * ליד מנגר שולחת לפעמים את **שם** הטופס בשדה הזה
     * ולא את המזהה. מנסים גם את זה.
     */
    const byFormName = byName.get(key(ids.formId));
    if (byFormName) return byFormName;
  }

  // 2. שם הקמפיין מפייסבוק
  if (ids.campaign) {
    const hit = byName.get(key(ids.campaign));
    if (hit) return hit;
  }

  return null;
}

/** ערוץ לפי מזהה, לשימוש בהעברה לפי סטטוס */
export async function channelById(
  id: string | null | undefined
): Promise<ChannelConfig | null> {
  if (!id) return null;

  const { byForm, byName } = await load();

  for (const map of [byForm, byName]) {
    for (const config of map.values()) {
      if (config.id === id) return config;
    }
  }

  /**
   * ערוץ שאין לו טפסים ואין לו שם במפתחות - נטען ישירות.
   * ערוץ חדש שרק נוצר הוא בדיוק המקרה הזה.
   */
  try {
    const { db } = await import("./db");

    const channel = await db.channel.findUnique({
      where: { id },
      include: { campaign: { select: { name: true } } },
    });

    if (!channel) return null;

    return {
      id: channel.id,
      name: channel.name,
      campaignName: channel.campaign.name,
      isSale: channel.isSale,
      price: Number(channel.pricePerLead ?? 0),
      autoSend: channel.autoSend,
      sendEnabled: channel.sendEnabled,
      hasUrl: Boolean(channel.webhookUrl?.trim()),
    };
  } catch {
    return null;
  }
}
