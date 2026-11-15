/**
 * ============================================================
 *  מי תופס את הליד, ולמה - הסבר שאפשר לקרוא
 * ============================================================
 *
 *  **הבעיה שזה פותר.**
 *
 *  שלושה מנגנונים נפרדים יכולים לתפוס ליד שנכנס, והראשון
 *  שתופס מנצח:
 *
 *    1. **ערוץ** - לפי מזהה טופס, שם טופס, שם הערוץ, או
 *       שם הקמפיין
 *    2. **שיוך טפסים** - טבלה נפרדת שמצמידה טופס לערוץ
 *    3. **קמפיין מכירה** - לפי מזהה טופס / קמפיין / אדסט /
 *       מודעה / שם
 *
 *  ליד שנכנס מהטופס שלך והופיע כשל הקונה הוא תוצאה של
 *  אחד מהשלושה - אבל **אי אפשר היה לדעת של מי**, ולכן אי
 *  אפשר היה לתקן. אפשר היה רק לנחש.
 *
 *  ============================================================
 *   למה זה קורא לאותן פונקציות ולא מחשב לבד
 *  ============================================================
 *
 *  הפיתוי היה לכתוב כאן חישוב "מקביל" שמסביר מה קורה. זה
 *  היה הופך את זה למנגנון **רביעי** שעונה על אותה שאלה -
 *  בדיוק הדפוס שגרם לכל הבלגן. מנגנון מסביר שנפרד מהמנגנון
 *  האמיתי משקר בדיוק ברגע שהוא הכי נחוץ.
 *
 *  לכן כאן לא מחשבים כלום: קוראים לאותן פונקציות, באותו
 *  סדר שהקליטה קוראת להן, ורק מתעדים מי ענה.
 */

import type { LeadIdentifiers } from "./campaign-match";

export type ClaimStep = {
  /** שם המנגנון, בעברית */
  name: string;
  /** האם הוא תפס את הליד */
  claimed: boolean;
  /** לאן הוא שייך אותו */
  owner: "mine" | "sale" | null;
  /** ההסבר המלא */
  detail: string;
};

export type ClaimTrace = {
  ids: LeadIdentifiers;
  steps: ClaimStep[];
  /** ההכרעה הסופית - מי שתפס ראשון, או ברירת המחדל */
  owner: "mine" | "sale";
  matchedOn: string;
};

/**
 * מריץ את שרשרת ההכרעה **בדיוק** כמו הקליטה, ומתעד כל שלב.
 */
export async function traceClaim(
  ids: LeadIdentifiers
): Promise<ClaimTrace> {
  const { channelForLead } = await import("./channels");
  const { assignmentForForm } = await import("./lead-forms");
  const { channelForIncoming } = await import("./channel");

  const steps: ClaimStep[] = [];

  /* ---------- 1. ערוץ ---------- */
  const inChannel = await channelForLead(ids).catch(() => null);

  steps.push({
    name: "ערוץ",
    claimed: Boolean(inChannel),
    owner: inChannel ? (inChannel.isSale ? "sale" : "mine") : null,
    detail: inChannel
      ? `תפס · ${inChannel.campaignName} · ${inChannel.name}${
          inChannel.isSale ? " (ערוץ מכירה)" : " (ערוץ שלך)"
        }`
      : "לא תפס - אין טופס, שם טופס, שם ערוץ או שם קמפיין שמתאים",
  });

  if (inChannel) {
    return {
      ids,
      steps,
      owner: inChannel.isSale ? "sale" : "mine",
      matchedOn: `ערוץ: ${inChannel.campaignName} · ${inChannel.name}`,
    };
  }

  /* ---------- 2. שיוך טפסים ---------- */
  const byForm = await assignmentForForm(ids.formId).catch(() => null);

  steps.push({
    name: "שיוך טפסים",
    claimed: Boolean(byForm),
    owner: byForm ? byForm.channel : null,
    detail: byForm
      ? `תפס · הטופס "${byForm.formName}" רשום כ${
          byForm.channel === "sale" ? "מכירה" : "שלך"
        }`
      : ids.formId
        ? `לא תפס - מזהה הטופס ${ids.formId} לא רשום בטבלת הטפסים`
        : "לא תפס - לא הגיע מזהה טופס",
  });

  if (byForm) {
    return {
      ids,
      steps,
      owner: byForm.channel,
      matchedOn: `טופס: ${byForm.formName}`,
    };
  }

  /* ---------- 3. קמפיין מכירה ---------- */
  const campaign = await channelForIncoming(ids);

  steps.push({
    name: "קמפיין מכירה",
    claimed: campaign.isSale,
    owner: campaign.isSale ? "sale" : null,
    detail: campaign.isSale
      ? `תפס · ${campaign.matchedOn ?? campaign.campaignName ?? ""}`
      : "לא תפס - אף מזהה של הליד לא רשום אצל קמפיין מכירה",
  });

  return {
    ids,
    steps,
    owner: campaign.isSale ? "sale" : "mine",
    matchedOn:
      campaign.matchedOn ?? "ללא התאמה - נשאר אצלך",
  };
}

/* ============================================================
 *  התנגשויות: אותו מפתח רשום בשני מקומות
 * ========================================================= */

export type Collision = {
  key: string;
  /** היכן המפתח הזה רשום */
  owners: string[];
};

/**
 * מפתחות שרשומים ביותר ממקום אחד.
 *
 * **זו הסיבה הסבירה ביותר לליד שהלך לצד הלא נכון**, והיא
 * הייתה בלתי נראית לגמרי: שום מסך לא הראה ששם קמפיין אחד
 * רשום גם אצלך וגם אצל הקונה.
 */
export async function findCollisions(): Promise<Collision[]> {
  const { db } = await import("./db");

  /** מפתח -> מי תובע אותו */
  const claims = new Map<string, Set<string>>();

  const add = (raw: string | null | undefined, owner: string) => {
    const key = raw?.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) return;
    if (!claims.has(key)) claims.set(key, new Set());
    claims.get(key)!.add(owner);
  };

  /* ערוצים: טפסים, שמות טפסים, שם הערוץ, שם הקמפיין */
  const channels = await db.channel
    .findMany({
      where: { active: true },
      include: {
        campaign: { select: { name: true, active: true } },
        forms: { select: { formId: true, formName: true } },
      },
    })
    .catch(() => []);

  for (const channel of channels) {
    if (!channel.campaign.active) continue;

    const label = `ערוץ "${channel.name}"${
      channel.isSale ? " (מכירה)" : " (שלך)"
    }`;

    add(channel.name, label);
    add(channel.campaign.name, label);

    for (const form of channel.forms) {
      add(form.formId, label);
      add(form.formName, label);
    }
  }

  /* טבלת שיוך הטפסים */
  const forms = await db.leadForm.findMany().catch(() => []);

  for (const form of forms) {
    add(
      form.formId,
      `שיוך טפסים "${form.formName ?? form.formId}"`
    );
  }

  /* קמפייני מכירה */
  const sales = await db.salesCampaign
    .findMany({ where: { active: true } })
    .catch(() => []);

  for (const sale of sales) {
    const label = `קמפיין מכירה "${sale.name}"`;
    add(sale.name, label);

    const keys = Array.isArray(sale.matchKeys)
      ? (sale.matchKeys as unknown[])
      : [];

    for (const key of keys) {
      if (typeof key === "string") add(key, label);
    }
  }

  const out: Collision[] = [];

  for (const [key, owners] of claims) {
    if (owners.size > 1) out.push({ key, owners: [...owners] });
  }

  return out.sort((a, b) => b.owners.length - a.owners.length);
}
