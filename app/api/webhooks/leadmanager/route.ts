import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { arrivalIntakeAt } from "@/lib/arrival";
import { normalizePhone } from "@/lib/phone";
import {
  mapLeadManagerPayload,
  extractExtraFields,
} from "@/lib/leadmanager-mapping";
import { isExistingCustomer } from "@/lib/existing-customer";
import { isKnownStatus } from "@/lib/status-store";
import { scheduleForStatus } from "@/lib/rules";
import { queueDelivery } from "@/lib/delivery";
import { doorOf, addDoor } from "@/lib/via";
import { identifiersOf } from "@/lib/campaign-match";
import { campaignLabel } from "@/lib/campaign-label";
import { priceForAd, readAdPrices } from "@/lib/ad-pricing";
import { notifyNewLead } from "@/lib/notify-lead";
import { withCanonicalFields } from "@/lib/field-aliases";
import { assignmentForForm } from "@/lib/lead-forms";
import { channelForLead } from "@/lib/channels";
import {
  channelForIncoming,
  channelKey,
  isSameSubmission,
  isStatusUpdate,
  SAME_SUBMISSION_MINUTES_NO_ID,
} from "@/lib/channel";
import { phoneChannel } from "@/lib/lead-by-phone";
import { isHolding as holdingNow } from "@/lib/sale-hold";

export const dynamic = "force-dynamic";

/**
 * קליטת ליד מליד מנגר.
 *
 * מקבל גם GET וגם POST:
 *  - GET  -> הנתונים מגיעים בכתובת עצמה (query string)
 *  - POST -> הנתונים מגיעים בגוף הבקשה, ואם לא, נופלים חזרה לכתובת
 *
 * הכלל: קודם שומרים את מה שהגיע, אחר כך מנסים להבין אותו.
 * גם אם המיפוי נכשל - שום דבר לא הולך לאיבוד.
 */

/** שולף את כל הפרמטרים מהכתובת לאובייקט */
function queryToObject(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key === "token") continue; // הטוקן הוא אימות, לא נתון של הליד
    out[key] = value;
  }
  return out;
}

/** בודק שהטוקן שהגיע תואם למה שהוגדר */
function tokenIsValid(request: Request): boolean {
  const expected = process.env.LEADMANAGER_WEBHOOK_TOKEN;
  if (!expected) return true; // לא הוגדר טוקן - לא בודקים

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-webhook-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token");

  return provided === expected;
}

async function handle(request: Request) {
  const fromQuery = queryToObject(request.url);

  // גוף הבקשה - קיים רק ב-POST.
  // חשוב: קוראים את הגוף פעם אחת בלבד כטקסט, ורק אחר כך מנתחים אותו.
  // קריאה כפולה (json ואז text) מרוקנת את הגוף ומחזירה ריק.
  let bodyText = "";
  if (request.method !== "GET") {
    bodyText = await request.text().catch(() => "");
  }

  let fromBody: unknown = null;
  if (bodyText.trim()) {
    try {
      // ניסיון ראשון: JSON
      fromBody = JSON.parse(bodyText);
    } catch {
      // ניסיון שני: form-urlencoded (key=value&key=value)
      const params = new URLSearchParams(bodyText);
      const obj: Record<string, string> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      fromBody = Object.keys(obj).length ? obj : { _unparsed: bodyText };
    }
  }

  // מאחדים: מה שהגיע בגוף גובר, מה שבכתובת משלים
  const raw: Record<string, unknown> = {
    ...fromQuery,
    ...(fromBody && typeof fromBody === "object" ? (fromBody as object) : {}),
    _method: request.method,
    _contentType: request.headers.get("content-type") || "(אין)",
    _bodyLength: String(bodyText.length),
  };

  // 1. שומרים גולמי לפני הכל
  const log = await db.webhookLog.create({
    data: { source: "leadmanager", rawPayload: raw as Prisma.InputJsonObject },
  });

  // 2. בודקים טוקן
  if (!tokenIsValid(request)) {
    await db.webhookLog.update({
      where: { id: log.id },
      data: { error: "טוקן שגוי או חסר" },
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. מעבדים. גם אם נכשל - מחזירים 200 כדי שליד מנגר לא ינסה שוב ושוב
  try {
    const mapped = mapLeadManagerPayload(raw);
    const phone = normalizePhone(mapped.phone);

    if (!phone) {
      const empty = Object.keys(fromQuery).length === 0 && !fromBody;

      const why = empty
        ? "הבקשה הגיעה ריקה - לא נשלחו שדות כלל"
        : "לא נמצא מספר טלפון תקין";

      await db.webhookLog.update({
        where: { id: log.id },
        data: { error: why },
      });

      /**
       * ============================================================
       *  ליד בלי טלפון הוא ליד שאבד
       * ============================================================
       *
       *  **למה זו התראה ולא רק שורה ביומן.** אי אפשר
       *  ליצור ליד בלי טלפון - הטלפון הוא המפתח. אבל
       *  הפנייה כן הגיעה, ויש בה שם ומייל, ולכן **אפשר
       *  להציל אותה** - אם יודעים עליה בזמן.
       *
       *  קודם זה היה שורה ביומן שאף אחד לא קורא, והליד
       *  התגלה רק בהשוואה ידנית מול פייסבוק ימים אחרי.
       */
      if (!empty) {
        /** המייל אינו חלק מהמיפוי הבסיסי, ולכן נשלף מהשדות */
        const fields = extractExtraFields(raw);
        const mail = typeof fields.email === "string" ? fields.email : "";

        const who =
          [mapped.firstName, mapped.lastName].filter(Boolean).join(" ").trim() ||
          mail ||
          "ליד ללא שם";

        await db.alert
          .create({
            data: {
              title: "ליד הגיע בלי טלפון - לא נקלט!",
              body: `${who}${mail ? ` · ${mail}` : ""} · ${why}. הפרטים המלאים ביומן הקליטה - אפשר להזין אותו ידנית.`,
            },
          })
          .catch(() => null);
      }

      return NextResponse.json({ ok: true, warning: "no phone" });
    }

    const incomingStatus =
      mapped.status && (await isKnownStatus(mapped.status))
        ? mapped.status
        : null;

    /**
     * מוסיף שמות שדות מוכרים גם כאן, לא רק בדלת של פייסבוק.
     *
     * טופס בעברית מחזיר "שם_מלא" ו"דוא\"ל". בלי הזיהוי הזה
     * הליד נכנס בלי שם ובלי מייל - וזה מה שקרה בפועל לליד
     * של שרה פרידמן. הנרמול כאן מכסה את שתי הדלתות.
     */
    const extra = withCanonicalFields(extractExtraFields(raw));

    /**
     * חוק אוטומטי: אם בשאלת הספק הלקוח סימן yes או סטינג -
     * הוא כבר לקוח שלנו. נכנס ישר ל"לקוח קיים" במקום "חדש",
     * כדי שלא יקבל פנייה מכירתית מיותרת.
     */
    /**
     * אותו זיהוי שכל המערכת משתמשת בו - כולל עמודות
     * מקבצים ששמן שונה בכל פעם.
     */
    const alreadyCustomer = isExistingCustomer(extra);

    /**
     * לאיזו מערכת הכניסה הזו שייכת - שלך או של המכירה.
     *
     * נקבע פעם אחת, כאן, לפי הקמפיין שממנו היא הגיעה,
     * ונחתם על הכניסה. כל השאר במערכת קורא את החותמת הזו
     * ולא מנחש מחדש.
     */
    /**
     * שם הטופס כגיבוי לשם הקמפיין.
     *
     * ליד מהחיבור הישיר לפייסבוק מגיע בלי שם קמפיין כשחשבון
     * המודעות לא משויך - שם הקמפיין דורש הרשאה על חשבון
     * המודעות, בעוד שהטופס דורש רק הרשאה על הדף. בלי הגיבוי
     * הזה הליד נכנס בלי שום שיוך, לא נספר בשום שורה, ולא
     * מופיע בשום רשימת קמפיינים.
     *
     * השם נלקח מהטבלה שלך - הטפסים ששייכת בהתממשקות - ולכן
     * זו שאילתה אחת מקומית ולא קריאה לפייסבוק על כל ליד.
     */
    const formName = extra.fb_form
      ? await db.leadForm
          .findUnique({
            where: { formId: String(extra.fb_form) },
            select: { formName: true },
          })
          .then((f) => f?.formName ?? null)
          .catch(() => null)
      : null;

    const incomingCampaign = campaignLabel({
      fbCampaign: extra.fb_campaign,
      campaign: extra.campaign,
      formName,
    });

    /**
     * ההכרעה נעשית לפי **כל** המזהים שהגיעו, לא רק לפי השם.
     *
     * כאן היה הכשל שחזר בכל עדכון: ההחלטה הסתמכה על שם
     * הקמפיין בלבד. כשהשם לא הגיע - והחיבור הישיר לפייסבוק
     * מקבל אותו רק עם הרשאה לחשבון המודעות - ההתאמה נפלה,
     * והליד של הקונה נכנס לרשימה האישית שלך.
     *
     * מזהה טופס או מודעה תמיד מגיע, ולכן עכשיו ההכרעה
     * מחזיקה גם בלי שם.
     */
    const ids = identifiersOf(extra);

    /**
     * הטופס קובע ראשון.
     *
     * טופס מחובר לקונה אחד, וזה בדיוק איך שאתה עובד.
     * אם הטופס מוגדר במסך ההתממשקות - אין צורך בשם קמפיין
     * ואין מה לנחש.
     *
     * טופס שלא הוגדר לא משנה כלום: נופלים לשם הקמפיין,
     * בדיוק כמו קודם.
     */
    /**
     * ============================================================
     *  סדר ההכרעה
     * ============================================================
     *
     *  1. **ערוץ** - הטופס משויך לערוץ, והערוץ מחזיק הכל:
     *     לאן נשלח, האם מכירה, ומה המחיר. זו הדרך מעכשיו.
     *  2. טופס בודד, להגדרות ותיקות מלפני הערוצים.
     *  3. שם הקמפיין, לליד שמגיע בלי מזהה טופס.
     *
     *  אין התאמה -> הליד שלך. ברירת המחדל הזו בכוונה:
     *  ליד שלא שויך נשאר אצלך ולא נמכר בטעות.
     */
    const inChannel = await channelForLead(ids).catch(() => null);

    const byForm = inChannel
      ? null
      : await assignmentForForm(ids.formId).catch(() => null);

    const channel = inChannel
      ? {
          channel: inChannel.isSale ? ("sale" as const) : ("mine" as const),
          isSale: inChannel.isSale,
          price: inChannel.price,
          campaignName: inChannel.name,
          matchedOn: `ערוץ: ${inChannel.campaignName} · ${inChannel.name}`,
        }
      : byForm
        ? {
            channel: byForm.channel,
            isSale: byForm.channel === "sale",
            price: byForm.price,
            campaignName: byForm.formName,
            matchedOn: `טופס: ${byForm.formName}`,
          }
        : await channelForIncoming(ids);

    /**
     * ============================================================
     *  הסיבה לשיוך נשמרת, תמיד
     * ============================================================
     *
     *  שלושה מנגנונים יכולים לתפוס כניסה, והראשון שתופס
     *  מנצח. עד כאן אף אחד לא רשם מי תפס - ולכן ליד שנכנס
     *  מהטופס שלך והופיע כשל הקונה היה חידה בלתי פתירה.
     *
     *  כולל המקרה שאף אחד לא תפס: "נשאר אצלך" הוא גם
     *  החלטה, וגם היא צריכה להיות כתובה.
     */
    /**
     * ============================================================
     *  העברות עצורות -> הליד נכנס **אצלך**, לא אצל הקונה
     * ============================================================
     *
     *  **מה שזה עושה.** כשהמתג כבוי (שבת), ליד שהקמפיין
     *  שלו שייך לקונה לא נכנס בכלל לצד שלו - הוא נכנס
     *  לרשימה **שלך**, ואתה עובד אותו.
     *
     *  **ולמה זה מוכרע כאן ולא אחר כך.** הדרך הקלה הייתה
     *  ליצור את הליד אצל הקונה ואז "להעביר" אותו אליך.
     *  זה היה אומר לכתוב מחדש את הערוץ - שהוא **מפתח של
     *  השורה** - ולהתמודד עם התנגשויות, כניסות שכבר
     *  נרשמו, ומחיר שכבר נחתם. בדיוק סוג הבלאגן שנמנעים
     *  ממנו.
     *
     *  לכן ההכרעה היא **לפני** שנולד משהו: הליד פשוט נולד
     *  בצד הנכון מלכתחילה. שום דבר לא זז אחר כך.
     *
     *  **הם נשארים שלך.** הדלקה חוזרת של המתג משפיעה רק
     *  על לידים **חדשים**. מה שכבר נכנס אליך הוא שלך, עד
     *  שתחליט אחרת ותעביר אותו ידנית.
     */
    const stopped = channel.isSale ? await holdingNow() : false;

    /**
     * "האם ההגעה הזו הולכת לקונה" - שאלה אחת, משתנה אחד.
     *
     * כל מה שתלוי בה (הבעלות, המחיר, החיוב, השליחה,
     * האוטומציות) נגזר מכאן ולא מ-`channel.isSale` ישירות,
     * כדי שלא ייווצר מצב ששדה אחד חושב שהליד של הקונה
     * ושדה אחר חושב שהוא שלך.
     */
    const goesToSale = channel.isSale && !stopped;

    const matchedOn = stopped
      ? `${channel.matchedOn ?? "קמפיין מכירה"} · ההעברות היו עצורות, נכנס אצלך`
      : channel.matchedOn ??
        (channel.isSale
          ? "קמפיין מכירה - לפי מזהה"
          : "ללא התאמה - נשאר אצלך");

    /**
     * ============================================================
     *  מחפשים ליד קיים **בתוך הערוץ שהכניסה הזו שייכת לו**
     * ============================================================
     *
     *  **כאן היה הכשל שחזר שוב ושוב, בכל צורה אחרת.**
     *
     *  קודם השורה הזו הייתה בראש הפונקציה, לפני שבכלל ידענו
     *  מאיזה קמפיין הליד הגיע, והיא שאלה שאלה אחת: "יש ליד
     *  עם הטלפון הזה?" - בלי ערוץ, כי במסד הטלפון היה ייחודי
     *  ולא היה ערוץ לשאול עליו.
     *
     *  התוצאה בשטח: אדם נכנס בבוקר מקמפיין של המכירה, ועשר
     *  דקות אחר כך מילא את המודעה שלך. הכניסה השנייה מצאה
     *  את השורה של המכירה, עדכנה אותה, ו**הליד שלך מעולם
     *  לא נוצר**. קמפיין שילם, הליד לא הופיע.
     *
     *  עכשיו השאלה מלאה: "יש ליד עם הטלפון הזה **בערוץ
     *  הזה**?". אין - נולד ליד חדש, גם אם לאותו אדם כבר יש
     *  שורה בערוץ השני. שתי מערכות, אפס נגיעה.
     */
    const leadChannel = channelKey(goesToSale);

    /**
     * ============================================================
     *  **כל הגעה היא ליד חדש. גם אם הוא נכנס בעבר.**
     * ============================================================
     *
     *  **מה שהיה כאן, ולמה זה היה הפוך ממה שהתבקש.**
     *
     *  השורה הזו שלפה ליד קיים, והקוד שאחריה **עדכן** אותו:
     *  הקפיץ אותו לראש הרשימה, הוסיף "כפול · N", ושמר את
     *  הסטטוס הישן. כלומר אדם שנכנס שוב חזר עם הסטטוס
     *  והתווית של הפעם הקודמת - "אין מענה", "נמען דיוור" -
     *  במקום להיות מה שהוא: **ליד חדש**.
     *
     *  אדם שנכנס שלוש פעמים בנובמבר הוא **שלוש הגעות**.
     *  שילמת על כל אחת. כל אחת היא ליד חדש בסטטוס "חדש",
     *  והשנייה והשלישית נושאות תווית "כפול" - וזה כל
     *  ההבדל ביניהן.
     *
     *  לכן השליפה הזו כבר לא משמשת לעדכון. היא משמשת לשני
     *  דברים בלבד:
     *
     *   1. לזהות **אותה הגשה** שנשמעה פעמיים משתי דלתות -
     *      זו לא הגעה שנייה ואסור לספור אותה.
     *   2. לדעת כמה הגעות כבר היו, בשביל התווית.
     */
    const priorLeads = await db.lead
      .findMany({
        where: phoneChannel(phone, leadChannel),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          extra: true,
          /** נדרשים לענף של "אותה הגשה" ושל עדכון סטטוס */
          status: true,
          firstName: true,
          lastName: true,
          source: true,
          entries: {
            orderBy: { at: "desc" },
            take: 5,
            select: { isSale: true, campaign: true, at: true, via: true },
          },
        },
      })
      .catch(() => []);

    /** ההגעה האחרונה, לבדיקת "אותה הגשה" בלבד */
    const existing = priorLeads[0] ?? null;

    /**
     * מאיזו דלת הליד נכנס.
     *
     * החיבור הישיר לפייסבוק מסמן את עצמו ב-_source, ולכן
     * אפשר לדעת מי הביא את הליד - וזה מה שמאפשר לראות אם
     * החיבור הישיר באמת עובד או שליד מנגר עושה הכל.
     */
    const via = doorOf(raw);

    /**
     * המחיר שייחתם על הכניסה.
     *
     * מחיר הערוץ הוא ברירת המחדל, ומעליו חריגים לפי מודעה.
     * זה מה שמאפשר שתי מודעות באותו קמפיין בפייסבוק - המבנה
     * שלא גורם להן להתחרות זו בזו - עם תמחור שונה לכל אחת.
     *
     * המחיר נחתם כאן פעם אחת ונשאר על הכניסה לתמיד. שינוי
     * מחיר בערוץ מחר לא משכתב חיוב שכבר נסגר.
     */
    const entryPrice = inChannel
      ? priceForAd({
          adName: extra.fb_ad ?? null,
          adId: extra.fb_ad_id ?? null,
          rules: readAdPrices(inChannel.adPrices),
          fallback: channel.price,
        }).price
      : channel.price;

    /**
     * ============================================================
     *  האם זו באמת הגעה חדשה, או אותה הגשה פעמיים
     * ============================================================
     *
     *  **ההכרעה הזו עלתה לכאן, לפני הפיצול, ובכוונה.**
     *
     *  היא הייתה בתוך הענף של "ליד קיים", ושימשה רק כדי
     *  להחליט כמה לעדכן. היום היא מכריעה משהו גדול בהרבה:
     *  האם **נולד ליד חדש**.
     *
     *  הגעה אמיתית -> שורה חדשה, סטטוס "חדש", תווית
     *  "כפול" אם הוא נכנס בעבר.
     *
     *  אותה הגשה שנשמעה משתי דלתות -> לא קרה כלום חדש,
     *  ואסור ליצור שורה שנייה.
     */
    const previousExtra =
      existing && typeof existing.extra === "object" && existing.extra
        ? (existing.extra as Record<string, string>)
        : {};

    const incomingFbId = extra.fb_leadid?.trim() || null;

    /**
     * הבדיקה רצה **בתוך הערוץ בלבד**.
     *
     * קודם היא רצה על כל הכניסות, ולכן ליד שנכנס אצלך
     * וכמה דקות אחר כך נכנס אצל אלעד - הכניסה של אלעד
     * נבלעה ולא נרשמה בכלל. שתי מערכות נפרדות; כניסה
     * באחת לא מבטלת כניסה בשנייה.
     */
    /**
     * טווח השליפה חייב לכסות את החלון הארוך ביותר שהבדיקה
     * משתמשת בו, אחרת היא פשוט לא תראה את הכניסה הקודמת
     * ותחשוב שזו הגעה חדשה.
     */
    const lookback = (SAME_SUBMISSION_MINUTES_NO_ID + 60) * 60 * 1000;

    const recentEntries = existing
      ? await db.leadEntry
      .findMany({
        where: {
          leadId: existing.id,
          at: { gte: new Date(Date.now() - lookback) },
        },
        select: { id: true, isSale: true, campaign: true, at: true, via: true },
      })
      .catch(() => [])
      : [];

    /**
     * שתי שאלות שונות, ואסור לבלבל ביניהן:
     *
     *  1. האם זו בכלל **הגעה**, או רק עדכון סטטוס מליד
     *     מנגר. עדכון סטטוס לא יוצר כניסה ולא מקפיץ
     *     תאריך.
     *
     *  2. אם זו הגעה - האם היא **אותה הגשה** שכבר נרשמה
     *     מהדלת השנייה, בהפרש של דקות.
     *
     * כל הגעה אחרת נספרת, גם אם אותו אדם נכנס ארבע פעמים
     * באותו יום. זה הכלל שלך, וזה מה שהקוד עושה עכשיו.
     */
    const statusOnly = isStatusUpdate({
      incomingStatus,
      hasSubmissionId: Boolean(incomingFbId),
      leadExists: Boolean(existing),
      /**
       * השדות שהגיעו הם מה שמכריע.
       *
       * בלי זה ההכרעה נשענה על ערך הסטטוס, וליד שנכנס
       * שוב בזמן שהסטטוס שלו בליד מנגר היה "אין מענה"
       * נבלע: בלי כניסה, בלי עדכון תאריך, ובלי לצוף
       * לראש הרשימה.
       */
      extra,
    });

    const sameSubmission =
      Boolean(existing) &&
      (statusOnly ||
      isSameSubmission({
        incomingFbId,
        knownFbId: previousExtra.fb_leadid ?? null,
        channel: channel.channel,
        via,
        entries: recentEntries,
      }));
    /**
     * ============================================================
     *  **כל הגעה אמיתית יוצרת ליד חדש**
     * ============================================================
     *
     *  התנאי היה `!existing` בלבד: ליד שנכנס בעבר נכנס
     *  לענף העדכון, והענף הזה **דרס** אותו - הקפיץ אותו
     *  לראש הרשימה ושמר את הסטטוס והתוויות של הפעם
     *  הקודמת. התוצאה: אדם שנכנס שוב הופיע כ"אין מענה"
     *  או "נמען דיוור" במקום כ"חדש".
     *
     *  היום התנאי הוא "אין ליד קודם **או** שזו הגעה
     *  חדשה". אדם שנכנס שלוש פעמים מקבל שלוש שורות, כל
     *  אחת בסטטוס "חדש", והשנייה והשלישית נושאות "כפול".
     *
     *  לענף השני נשאר רק מה שבאמת אינו הגעה: אותה הגשה
     *  שנשמעה משתי דלתות, ועדכון סטטוס מליד מנגר.
     */
    if (!existing || !sameSubmission) {
      const lead = await db.lead.create({
        data: {
          phone,
          firstName: mapped.firstName,
          lastName: mapped.lastName,

          /**
           * **הסטטוס מתחיל נקי בכל הגעה.**
           *
           * קודם הגעה חוזרת ירשה את הסטטוס הישן, ולכן ליד
           * חדש לגמרי הופיע כ"אין מענה" - סטטוס של פעולה
           * שקרתה לפני שבועיים, על הגעה אחרת לגמרי.
           */
          status: incomingStatus ?? (alreadyCustomer ? "לקוח קיים" : "חדש"),
          source: mapped.source,

          /**
           * מצביע על ההגעה הראשונה של אותו מספר בערוץ הזה.
           *
           * זה מה שנותן את תווית "כפול" בלי לאחד את
           * השורות: הן נשארות נפרדות לחלוטין, וזו רק
           * סימון שאומר "האדם הזה כבר נכנס".
           */
          duplicateOf:
            priorLeads.length > 0
              ? priorLeads[priorLeads.length - 1].id
              : null,

          /**
           * ליד שנולד מקמפיין מכירה נולד **כשל המכירה**.
           *
           * קודם השדה הזה לא נקבע ביצירה אלא נפל לברירת
           * המחדל "שלך", ולכן ליד חדש של אלעד נראה לרגע
           * כמו ליד שלך - והאוטומציות שלך רצו עליו. ככה
           * לקוחות שלו קיבלו ממך הודעות.
           */
          origin: goesToSale ? "sale" : "leadmanager",

          /**
           * הערוץ נחתם בלידה, והוא חלק מהמפתח של השורה.
           *
           * זה מה שמאפשר לאותו אדם להיות ליד של המכירה וליד
           * שלך במקביל, בלי שאחד יבלע את השני. origin נשאר
           * צמוד אליו כדי שכל הדוחות והמסכים הוותיקים
           * ימשיכו לקרוא את אותו דבר.
           */
          channel: leadChannel,
          extra: Object.keys(extra).length
            ? (extra as Prisma.InputJsonObject)
            : undefined,
        },
      });

      if (alreadyCustomer && !incomingStatus) {
        await db.alert.create({
          data: {
            leadId: lead.id,
            title: "ליד נכנס כלקוח קיים",
            body: `${mapped.firstName ?? phone} סימן בטופס ספק "${extra.supplier_question}" - הועבר אוטומטית ל"לקוח קיים".`,
          },
        });
      }

      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "lead_created",
          toStatus: lead.status,
          actor: "system",
          payload: { webhookLogId: log.id },
        },
      });

      /**
       * כל כניסה נרשמת **עם הערוץ שלה חתום עליה**.
       *
       * זה השדה שבלעדיו הכל התבלבל: קודם הכניסה נרשמה בלי
       * isSale, ואז תהליך אחר יצר כניסה שנייה כדי לסמן
       * שזו מכירה - ואותה הגעה אחת נספרה כשתיים. זה מה
       * שהפך ליד של אלעד ל"כפול 2" אצלך.
       */
      const firstEntry = await db.leadEntry
        .create({
          data: {
            leadId: lead.id,
            campaign: incomingCampaign,
            source: mapped.source,
            via,
            channelId: inChannel?.id ?? null,
            isSale: goesToSale,
            matchedOn,
            /** הגעה שהגיעה אליך כי ההעברות היו עצורות */
            heldFromSale: stopped,
            price: entryPrice,
            /** השדות שההגעה הזו נשאה - ראה ההערה בסכימה */
            extra: Object.keys(extra).length
              ? (extra as Prisma.InputJsonObject)
              : undefined,
            at: new Date(),
          },
        })
        .catch(() => null);

      /**
       * ליד של קונה נשלח אליו אוטומטית.
       * רק נרשם לתור כאן - השליחה עצמה במנוע, כדי שהקליטה
       * לא תחכה לשרת של הקונה.
       */
      /**
       * מייל על הליד החדש.
       *
       * אחרי השמירה ובלי await חוסם - ראה ההסבר ב-notify-lead.
       * קודם ההתראה הגיעה מליד מנגר; טופס שלא עובר דרכו היה
       * נכנס בשקט.
       */
      void notifyNewLead({
        leadId: lead.id,
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        phone,
        status: lead.status,
        extra,
        channelName: inChannel?.name ?? null,
        isSale: goesToSale,
        at: new Date(),
      });

      if (goesToSale && firstEntry) {
        await queueDelivery({
          leadId: lead.id,
          entryId: firstEntry.id,
          campaign: incomingCampaign,
          channelId: inChannel?.id ?? null,
          buyerId: byForm?.buyerId ?? null,
        }).catch(() => false);
      }

      /**
       * אוטומציות רצות רק על הערוץ שלך.
       * ליד של המכירה לא מקבל ממך הודעה, לעולם.
       */
      /**
       * אוטומציות לא רצות על ליד של הקונה, וגם לא על ליד
       * שנכנס אליך בזמן שההעברות עצורות.
       *
       * העצירה היא בשבת, ואתה לא עובד בשבת. הודעת וואטסאפ
       * שיוצאת לבד בשבת היא בדיוק הדבר שהעצירה נועדה
       * למנוע. הליד מחכה לך ברשימה, ואתה מתחיל איתו כשאתה
       * חוזר.
       */
      if (!goesToSale && !stopped) {
        await scheduleForStatus(lead.id, lead.status);
      }
    } else {
      /**
       * המקור נקבע לפי הכניסה הנוכחית, לא לפי העבר.
       *
       * הכלל הקודם היה "מי שנכנס למכירה נשאר במכירה לנצח",
       * וזה גרם לכך שאדם שקנה פעם דרך קמפיין מכירה ואז
       * נכנס מקמפיין שלך - נעלם לך מהרשימה.
       *
       * הכלל הנכון: הקמפיין שממנו הוא נכנס עכשיו הוא
       * שקובע של מי הליד.
       */
      const isSaleNow = goesToSale;

      /**
       * סטטוס שמגיע מליד מנגר נוגע רק בערוץ שלך.
       * לערוץ המכירה אין סטטוסים בכלל.
       */
      const statusChanged =
        !isSaleNow &&
        incomingStatus !== null &&
        incomingStatus !== existing.status;

      /**
       * אותה הגשה שהגיעה פעמיים - לא ליד כפול.
       *
       * בזמן שליד מנגר ופייסבוק רצים במקביל, כל ליד מגיע
       * משני המקורות. בלי הבדיקה הזו כל ליד היה מסומן
       * "כפול" וקופץ פעמיים.
       *
       * אותה הגשה = אותו מזהה ליד של פייסבוק, או כניסה
       * שכבר נרשמה ב-15 הדקות האחרונות.
       */

      /**
       * של מי הליד.
       *
       * **כניסה אחת של מכירה מעבירה אותו לקונה**, גם אם
       * הוא נכנס פעם גם מקמפיין שלך: "מה שקשור לאלעד
       * שייך אך ורק אליו".
       *
       * גם כניסה של מכירה שנרשמה בעבר נספרת, ולכן ליד
       * שכבר עבר לקונה לא חוזר אליך בגלל התראת סטטוס
       * שהגיעה בלי קמפיין.
       */
      /**
       * ============================================================
       *  הגעה חדשה שלך מחזירה את הליד אליך
       * ============================================================
       *
       *  **כאן הליד נבלע.**
       *
       *  קודם היה כאן: אם יש לליד כניסת מכירה כלשהי **אי
       *  פעם**, הבעלות נקבעת "sale" - לתמיד. אדם שנכנס פעם
       *  אחת מקמפיין של אלעד לא חזר לרשימה שלך לעולם, גם
       *  כשמילא חודש אחר כך את הטופס שלך.
       *
       *  הבעלות נקבעת לפי **ההגעה הזו**: נכנס עכשיו דרך
       *  אלעד - שלו. נכנס עכשיו דרכך - שלך. ההיסטוריה
       *  נשמרת ככניסות ונספרת בדוחות, אבל היא כבר לא בולעת
       *  את ההגעה הנוכחית.
       */
      /**
       * ============================================================
       *  אין יותר "העברת בעלות". הבעלות היא המפתח
       * ============================================================
       *
       *  **מה שהיה כאן, ולמה זה נמחק.**
       *
       *  כאן ישבה ההכרעה "של מי הליד עכשיו", והיא כתבה
       *  מחדש את הבעלות בכל הגעה. זו הייתה התשובה הלא
       *  נכונה לשאלה הנכונה: ניסינו להחליט למי שייכת שורה
       *  **אחת** ששני העולמות חלקו - במקום פשוט לתת לכל
       *  עולם שורה משלו.
       *
       *  השורה הזו כבר שייכת לערוץ שלה, כי לפי הערוץ
       *  מצאנו אותה. אין מה להכריע ואין מה להעביר.
       *
       *  מה שכן נשאר: ליד שנולד כנמען דיוור או כשיחת
       *  וואטסאפ והיום נכנס מקמפיין אמיתי - הופך לליד
       *  מלא. זו העלאה בדרגה, לא העברה בין עולמות, והיא
       *  בדיוק מה שביקשת: כל כניסה נכנסת כליד.
       */
      const ownerOrigin = isSaleNow ? "sale" : "leadmanager";

      await db.lead.update({
        where: { id: existing.id },
        data: {
          firstName: mapped.firstName ?? existing.firstName,
          lastName: mapped.lastName ?? existing.lastName,
          source: mapped.source ?? existing.source,

          /**
           * סטטוס נוגע רק לערוץ שלך. כניסה של אלעד לא
           * דורסת סטטוס שאתה קבעת - זה מה שגרם לליד
           * שעבדת עליו אתמול להשתנות מעצמו.
           */
          status: incomingStatus ?? existing.status,

          /**
           * הליד נכנס שוב עכשיו - ולכן הוא צף לראש הרשימה
           * עם התאריך של היום. התאריכים הקודמים לא אובדים:
           * כל כניסה נשמרת בנפרד ומוצגת בכרטיס הליד.
           *
           * אבל רק כניסה **בערוץ שלך** מקפיצה אותו אצלך.
           * כניסה אצל אלעד לא מזיזה כלום ברשימה שלך.
           */
          /**
           * ההגעה הזו היא התאריך החדש של הליד ברשימה שלך.
           *
           * לא מתעדכן רק בשני מקרים: אותה הגשה שהגיעה
           * משתי דלתות, והגעה שהיא של אלעד - כניסה אצלו
           * לא מזיזה כלום אצלך.
           */
          intakeAt: arrivalIntakeAt({ sameSubmission }),

          origin: ownerOrigin,
          extra: Object.keys(extra).length
            ? ({
                ...(typeof existing.extra === "object" && existing.extra
                  ? (existing.extra as Record<string, string>)
                  : {}),
                ...extra,
              } as Prisma.InputJsonObject)
            : undefined,
        },
      });

      /**
       * ============================================================
       *  אותה הגעה, דלת שנייה
       * ============================================================
       *
       *  החיבור הישיר וליד מנגר רצים במקביל, ולכן אותו ליד
       *  מגיע פעמיים - פעם מכל דלת. זו **לא** הגעה כפולה
       *  ולכן לא נרשמת כניסה נוספת, אבל כן נרשם מי הביא:
       *  שתי הדלתות נשמרות על אותה כניסה, בסדר שבו הגיעו.
       *
       *  זה מה שמאפשר לראות בכרטיס הליד שהחיבור הישיר באמת
       *  עובד, גם כשליד מנגר הביא את אותו ליד שנייה אחר כך.
       */
      if (sameSubmission && !statusOnly) {
        const matching = recentEntries
          .filter((e) => e.isSale === goesToSale)
          .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

        if (matching) {
          const merged = addDoor(matching.via, via);

          if (merged) {
            await db.leadEntry
              .update({ where: { id: matching.id }, data: { via: merged } })
              .catch(() => null);
          }
        }
      }

      /**
       * כניסה נוספת נרשמת עם הערוץ שלה חתום עליה.
       *
       * תגית "כפול" נספרת מתוך הכניסות של אותו ערוץ בלבד,
       * ולכן כניסה אצל אלעד לא תסמן לך כפול ברשימה שלך.
       */
      if (!sameSubmission) {
        const entry = await db.leadEntry
          .create({
            data: {
              leadId: existing.id,
              campaign: incomingCampaign,
              source: mapped.source,
              via,
              channelId: inChannel?.id ?? null,
              isSale: goesToSale,
              matchedOn,
              heldFromSale: stopped,
              price: entryPrice,
              /**
               * **השדות של ההגעה הזו, ולא תערובת.** זה
               * הצד השני של התיקון: בלי זה הכרטיס מציג
               * את הקמפיין והמודעה של ההגעה הקודמת.
               */
              extra: Object.keys(extra).length
                ? (extra as Prisma.InputJsonObject)
                : undefined,
              at: new Date(),
            },
          })
          .catch(() => null);

        // הגעה חדשה בערוץ המכירה = שליחה חדשה לקונה
        if (goesToSale && entry) {
          await queueDelivery({
            leadId: existing.id,
            entryId: entry.id,
            campaign: incomingCampaign,
            channelId: inChannel?.id ?? null,
            buyerId: byForm?.buyerId ?? null,
          }).catch(() => false);
        }
      }

      await db.leadEvent.create({
        data: {
          leadId: existing.id,
          type: statusChanged ? "status_changed" : "webhook_received",
          fromStatus: statusChanged ? existing.status : null,
          toStatus: statusChanged ? incomingStatus : null,
          actor: "system",
          payload: { webhookLogId: log.id },
        },
      });

      /**
       * ============================================================
       *  הגעה חוזרת היא הגעה, וחייבת להתריע
       * ============================================================
       *
       *  **זו הסיבה שלא קיבלת התראה על לידים.**
       *
       *  ההתראה נשלחה רק בענף של מספר שלא היה במערכת
       *  מעולם. מי שכבר היה אצלך - דיברת איתו פעם, או
       *  שהוא מילא טופס לפני חודש - מילא עכשיו טופס שוב,
       *  נרשמה לו כניסה חדשה, הוא צף לראש הרשימה... **ולא
       *  יצאה עליו שום התראה.** הוא פשוט הופיע שם בשקט,
       *  ואם לא הסתכלת באותו רגע, לא ידעת.
       *
       *  שתי הגדרות חשובות:
       *
       *  · אותה הגשה שהגיעה משתי הדלתות (ליד מנגר והחיבור
       *    הישיר) **אינה** הגעה שנייה - אחרת כל ליד היה
       *    מתריע פעמיים.
       *  · עדכון סטטוס מליד מנגר אינו הגעה בכלל.
       *
       *  כלומר: מתריעים בדיוק על מה שנרשם ככניסה חדשה.
       */
      /**
       * ============================================================
       *  הגעה חוזרת מקבלת את אותן אוטומציות
       * ============================================================
       *
       *  **החסם השני, ואולי הגרוע מהשניים.**
       *
       *  `scheduleForStatus` נקרא **רק** בענף של מספר
       *  שלא היה במערכת מעולם. כלומר: אדם שמילא את הטופס
       *  שלך בפעם השנייה לא קיבל שום הודעה פותחת, שום
       *  רצף, שום אוטומציה. הוא נכנס לרשימה בשקט מוחלט
       *  ונשאר שם עד שהסתכלת.
       *
       *  הכלל שלך: הגעה חוזרת היא ליד חדש לכל דבר, עם
       *  תווית "כפול". אותן אוטומציות בדיוק, אותו מסלול.
       *
       *  שתי הגדרות נשמרות, ושתיהן קיימות גם בענף של ליד
       *  חדש: ערוץ המכירה לא מקבל אוטומציות לעולם, ואותה
       *  הגשה שהגיעה משתי הדלתות אינה הגעה שנייה.
       */
      if (!sameSubmission && !goesToSale && !stopped) {
        await scheduleForStatus(
          existing.id,
          incomingStatus ?? existing.status
        ).catch(() => 0);
      }

      /**
       * ============================================================
       *  **הגעה חוזרת מתריעה תמיד, גם אם היא של המכירה**
       * ============================================================
       *
       *  כאן היה `&& !channel.isSale`, וזו הייתה חוסר
       *  אחידות שאין לה שום הצדקה: ליד **חדש** של המכירה
       *  כן קרא ל-notifyNewLead, וליד **חוזר** של המכירה
       *  לא קרא לה בכלל. אותו אירוע בדיוק, שתי התנהגויות
       *  הפוכות, לפי ענף בקוד.
       *
       *  זה המקרה המדויק שנפל: ליד שכבר היה במערכת נכנס
       *  שוב, שויך למכירה, ועבר בשקט מוחלט.
       *
       *  התנאי היחיד שנשאר הוא `sameSubmission` - אותה
       *  הגשה שנשמעה משתי דלתות אינה הגעה שנייה.
       */
      if (!sameSubmission) {
        void notifyNewLead({
          leadId: existing.id,
          firstName: mapped.firstName ?? existing.firstName,
          lastName: mapped.lastName ?? existing.lastName,
          phone,
          status: incomingStatus ?? existing.status,
          extra,
          channelName: inChannel?.name ?? null,
          isSale: goesToSale,
          returning: true,
          at: new Date(),
        });
      }
    }

    await db.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await db.webhookLog.update({
      where: { id: log.id },
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ ok: true, warning: "processing failed" });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
