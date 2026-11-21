import { NextRequest, NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { checkPhone } from "@/lib/phone-valid";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  תיקון פרטי ליד
 * ============================================================
 *
 *  **למה זה נחוץ.** לקוח משאיר מספר שגוי בטופס, ואז שולח
 *  את הנכון בהודעה בפייסבוק. בלי מסך תיקון הליד נשאר
 *  לנצח עם מספר שלא עונה.
 *
 *  ============================================================
 *   למה שינוי טלפון הוא פעולה רגישה
 *  ============================================================
 *
 *  הטלפון הוא **חלק מהמפתח** של השורה (טלפון + ערוץ).
 *  שינוי שלו הוא שינוי מפתח, ויש לו מצב שאין לשם או
 *  למייל: ייתכן שכבר קיים ליד אחר עם המספר החדש באותו
 *  ערוץ.
 *
 *  כתיבה עיוורת שם הייתה נופלת בשגיאת ייחודיות סתומה,
 *  או - גרוע יותר - יוצרת שתי שורות לאותו אדם. לכן
 *  בודקים קודם ומסבירים בעברית.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    address?: string;
  };

  const lead = await db.lead
    .findUnique({
      where: { id: params.id },
      select: { id: true, phone: true, channel: true, extra: true },
    })
    .catch(() => null);

  if (!lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  const text = (v: string | undefined) => {
    if (v === undefined) return undefined;
    const t = v.trim();
    return t === "" ? null : t;
  };

  if (body.firstName !== undefined) data.firstName = text(body.firstName);
  if (body.lastName !== undefined) data.lastName = text(body.lastName);

  /**
   * מייל וכתובת יושבים בתוך `extra`, לא כעמודות.
   *
   * שם הם הגיעו מהטופס, ושם כל המסכים קוראים אותם -
   * לכן התיקון נכתב לאותו מקום. עמודה חדשה הייתה יוצרת
   * שני מקורות לאותו נתון, וזה בדיוק מה שמייצר סתירות.
   */
  const extra = { ...((lead.extra as Record<string, unknown>) ?? {}) };
  let extraChanged = false;

  if (body.email !== undefined) {
    const v = text(body.email);
    if (v === null) delete extra.email;
    else extra.email = v;
    extraChanged = true;
  }

  if (body.address !== undefined) {
    const v = text(body.address);
    if (v === null) delete extra.address;
    else extra.address = v;
    extraChanged = true;
  }

  if (extraChanged) data.extra = extra;

  /* ---------- הטלפון ---------- */
  let phoneNote: string | null = null;

  if (body.phone !== undefined) {
    const normalized = normalizePhone(body.phone);

    if (!normalized) {
      return NextResponse.json(
        { error: "המספר לא מובן. בדוק אותו שוב." },
        { status: 400 }
      );
    }

    if (normalized !== lead.phone) {
      /**
       * כבר יש ליד עם המספר הזה **באותו ערוץ**?
       *
       * בערוץ השני זה לגיטימי לחלוטין - אותו אדם יכול
       * להיות ליד שלך וליד של הקונה במקביל. רק באותו
       * ערוץ זו התנגשות.
       */
      const taken = await db.lead
        .findFirst({
          where: {
            phone: normalized,
            channel: lead.channel,
            id: { not: lead.id },
          },
          select: { id: true, firstName: true, lastName: true },
        })
        .catch(() => null);

      if (taken) {
        const who =
          [taken.firstName, taken.lastName].filter(Boolean).join(" ") ||
          "ליד אחר";

        return NextResponse.json(
          {
            error: `המספר הזה כבר שייך ל${who}. שני לידים לא יכולים לחלוק מספר.`,
            existingLeadId: taken.id,
          },
          { status: 409 }
        );
      }

      data.phone = normalized;

      /**
       * מספר שגוי לא נחסם - רק מסומן.
       *
       * ייתכן שהלקוח באמת מסר מספר חריג, ולא נכון לחסום
       * אותך מלתקן. אבל כן נכון לומר לך שזה עדיין נראה
       * שגוי, לפני שתגלה את זה בשיחה שלא נענית.
       */
      const check = checkPhone(normalized);
      if (!check.valid) phoneNote = check.reason;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const updated = await db.lead
    .update({ where: { id: lead.id }, data })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "העדכון נכשל" }, { status: 500 });
  }

  /**
   * כל תיקון נרשם ביומן הליד.
   *
   * מספר שהשתנה הוא שינוי מהותי - בלי תיעוד אי אפשר
   * להסביר אחר כך למה שיחה הלכה למספר אחד והודעה למספר
   * אחר.
   */
  const LABELS: Record<string, string> = {
    firstName: "שם פרטי",
    lastName: "שם משפחה",
    extra: "מייל/כתובת",
  };

  const changes = Object.keys(data)
    .map((k) =>
      k === "phone"
        ? `טלפון: ${lead.phone} ← ${data.phone}`
        : `${LABELS[k] ?? k} עודכן`
    )
    .join(" · ");

  await db.leadEvent
    .create({
      data: {
        leadId: lead.id,
        type: "edit",
        actor: "user",
        payload: { note: `תוקן ידנית · ${changes}` },
      },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true, changed: true, phoneNote });
}
