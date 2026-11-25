import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { checkPhone } from "@/lib/phone-valid";
import { looksLikeExistingCustomer } from "@/lib/leadmanager-mapping";
import { POST as intakeLead } from "@/app/api/webhooks/leadmanager/route";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  קליטת ליד מטופס ציבורי
 * ============================================================
 *
 *  **הכלל שקובע את כל המבנה כאן: אין מסלול שני.**
 *
 *  הפיתוי היה לכתוב כאן יצירת ליד ישירות - זה קצר יותר
 *  ופשוט יותר. זו גם בדיוק הטעות שעלתה הכי ביוקר במערכת
 *  הזו: שני מסלולים שיוצרים לידים נפרדים אחד מהשני,
 *  שמתחילים זהים ונפרדים עם כל עדכון.
 *
 *  לכן הטופס הזה בונה מטען ו**דופק על אותה דלת** שפייסבוק
 *  וליד מנגר דופקים עליה. כל מה שקיים - ההפרדה בין
 *  הערוצים, ההתראות, הבוט, החוקים, עצירת שבת, זיהוי
 *  הכפילות - עובד עליו ביום הראשון בלי שורת קוד אחת.
 */

/**
 * הגנה בסיסית מפני הצפה.
 *
 * דף ציבורי פתוח לאינטרנט כולו. בלי תקרה, בוט אחד יכול
 * למלא לך את הרשימה באלפי שורות זבל תוך דקות.
 */
const recent = new Map<string, number[]>();

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  times.push(now);
  recent.set(ip, times);

  /** ניקוי כדי שהמפה לא תגדל בלי סוף */
  if (recent.size > 5000) recent.clear();

  return times.length > MAX_PER_WINDOW;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const form = await db.publicForm
    .findUnique({ where: { id: params.id } })
    .catch(() => null);

  if (!form || !form.active) {
    return NextResponse.json({ error: "הטופס אינו פעיל" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    string
  >;

  /**
   * שדה מלכודת: שדה מוסתר שאדם לעולם לא ימלא, ובוט ימלא.
   *
   * מחזירים "נשלח" בכוונה - בוט שמקבל שגיאה מנסה שוב
   * בצורה אחרת, ובוט שחושב שהצליח הולך הלאה.
   */
  if (body.website?.trim()) {
    return NextResponse.json({ ok: true });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  if (tooMany(ip)) {
    return NextResponse.json(
      { error: "נשלחו יותר מדי פניות. נסו שוב בעוד כמה דקות." },
      { status: 429 }
    );
  }

  /**
   * ============================================================
   *  מנוי קיים נעצר גם כאן, לא רק בדפדפן
   * ============================================================
   *
   *  הדפדפן כבר חוסם אותו ומציג לו את מספר השירות, אבל
   *  חסימה שרק בדפדפן היא חסימה שאפשר לעקוף - ודי בבקשה
   *  אחת ישירה כדי למלא את הרשימה בפניות שאין בהן מכירה.
   *
   *  **אותה פונקציה בדיוק** שהקליטה מפייסבוק משתמשת בה.
   *  כלל נפרד כאן היה נפרד ממנה ברגע שאחד מהם משתנה.
   */
  if (
    body.supplier_question?.trim() &&
    looksLikeExistingCustomer({ supplier_question: body.supplier_question })
  ) {
    return NextResponse.json({
      ok: true,
      existingCustomer: true,
      message: form.existingMsg,
    });
  }

  const name = (body.full_name ?? "").trim();
  const phoneRaw = (body.phone ?? "").trim();

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "נא למלא שם מלא" }, { status: 400 });
  }

  const phone = normalizePhone(phoneRaw);
  const check = checkPhone(phone || phoneRaw);

  /**
   * **כאן חוסמים מספר שגוי, בניגוד לכל מקום אחר במערכת.**
   *
   * בקליטה מפייסבוק רק מסמנים, כי הליד כבר הגיע ואסור
   * לאבד אותו. כאן הלקוח עומד מול המסך ויכול לתקן בשנייה -
   * ועדיף שיתקן עכשיו מאשר שתגלה בשיחה שלא נענית.
   */
  if (!phone || !check.valid) {
    return NextResponse.json(
      { error: check.reason ?? "מספר הטלפון אינו תקין" },
      { status: 400 }
    );
  }

  /**
   * ============================================================
   *  ההסכמה נבדקת גם כאן
   * ============================================================
   *
   *  הדפדפן כבר חוסם שליחה בלי סימון, אבל בדיקה שרק
   *  בדפדפן אפשר לעקוף בבקשה ישירה אחת - והיה נכנס ליד
   *  **בלי הסכמה לדיוור**, שנראה בדיוק כמו ליד עם הסכמה.
   *
   *  ההסכמה היא מה שמאפשר לשלוח הודעה אחרי השיחה, ולכן
   *  היא נשמרת על הליד עצמו ולא רק נבדקת כאן.
   */
  if (form.requireConsent && !body.consent?.trim()) {
    return NextResponse.json(
      { error: "צריך לאשר את תנאי יצירת הקשר" },
      { status: 400 }
    );
  }

  /**
   * המטען, בדיוק בשמות השדות שהקליטה כבר יודעת לקרוא.
   *
   * `fb_campaign` נשמר בשמו למרות שזה לא פייסבוק - כי זה
   * השדה שכל הסינון, הערוצים והדוחות קוראים. שדה חדש
   * במקומו היה אומר שהלידים האלה לא מופיעים בשום דוח.
   */
  const payload: Record<string, string> = {
    full_name: name,
    phone,
    _source: "public_form",
    source: form.source,
    form_name: form.name,
    public_form_id: form.id,
    /**
     * **רק סימון, לא נוסח ההסכמה עצמו.**
     *
     * הנוסח מכיל את המילה yes, וזיהוי לקוח קיים סורק
     * שדות לפי שם המפתח. היום `consent_text` לא נראה כמו
     * שדה ספק, אבל מספיק שמישהו ירחיב את רשימת השדות
     * בעתיד כדי שכל ליד מהטופס יסומן כלקוח קיים - וזה
     * בדיוק מה שכבר קרה פעם אחת במערכת הזו.
     *
     * הנוסח שמור על הטופס עצמו, שם הוא לא נסרק אף פעם.
     */
    consent: "1",
  };

  if (form.campaignName) payload.fb_campaign = form.campaignName;
  if (body.email?.trim()) payload.email = body.email.trim();
  if (body.supplier_question?.trim()) {
    payload.supplier_question = body.supplier_question.trim();
  }

  const token = process.env.LEADMANAGER_WEBHOOK_TOKEN?.trim() ?? "";
  const base = new URL(request.url).origin;

  const response = await intakeLead(
    new Request(
      `${base}/api/webhooks/leadmanager?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
  ).catch(() => null);

  const outcome = (await response?.json().catch(() => ({}))) as {
    warning?: string;
    error?: string;
  };

  if (!response?.ok || outcome.error) {
    /**
     * הליד לא נקלט - וזה כסף שהולך לאיבוד בשקט.
     *
     * הלקוח מקבל הודעה מרגיעה כי הוא לא אשם, אבל אתה
     * מקבל התראה כדי שתוכל לרדוף אחריו.
     */
    await db.alert
      .create({
        data: {
          title: "ליד מטופס לא נקלט!",
          body: `${name} · ${phone} · ${form.name}. ${
            outcome.error ?? outcome.warning ?? ""
          }`,
        },
      })
      .catch(() => null);

    return NextResponse.json(
      { error: "אירעה תקלה. נסו שוב או התקשרו אלינו." },
      { status: 500 }
    );
  }

  await db.publicForm
    .update({
      where: { id: form.id },
      data: { submissions: { increment: 1 } },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
