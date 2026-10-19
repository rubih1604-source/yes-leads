import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import {
  buildPayload,
  applyFieldMap,
  isSuccess,
  parseHeaders,
  checkTemplate,
  renderTemplate,
} from "@/lib/delivery-payload";

export const dynamic = "force-dynamic";

/**
 * הגדרות השליחה של קונה, ובדיקת חיבור.
 *
 * PATCH - שמירת כתובת, סוד, פורמט ומיפוי שדות
 * POST  - שליחת ליד דמה לכתובת, כדי לוודא שהצד השני מקבל
 */

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.webhookUrl === "string") {
    const url = body.webhookUrl.trim();

    /**
     * כתובת חייבת להיות http או https. כתובת שבורה פירושה
     * שכל הלידים של הקונה הזה ייכשלו, ועדיף לעצור כאן.
     */
    if (url === "") {
      data.webhookUrl = null;
    } else if (/^https?:\/\/.+/i.test(url)) {
      data.webhookUrl = url;
    } else {
      return NextResponse.json(
        { error: "הכתובת חייבת להתחיל ב-http:// או https://" },
        { status: 400 }
      );
    }
  }

  if (typeof body.webhookSecret === "string") {
    data.webhookSecret = body.webhookSecret.trim() || null;
  }

  if (body.webhookFormat === "json" || body.webhookFormat === "form") {
    data.webhookFormat = body.webhookFormat;
  }

  if (typeof body.sendEnabled === "boolean") {
    data.sendEnabled = body.sendEnabled;
  }

  /**
   * כותרות חופשיות. נשמרות כאובייקט, מגיעות כטקסט של
   * שורות "שם=ערך" - כדי שאפשר להעתיק ישר מהמפרט של הקונה.
   */
  /**
   * סימני הצלחה וכשלון, כמו "בדיקת הצלחת שליחה" במפרט.
   * ריק = מכריעים לפי קוד ה-HTTP, כמו עד היום.
   */
  if (typeof body.successContains === "string") {
    data.successContains = body.successContains.trim().slice(0, 300) || null;
  }

  if (typeof body.failureContains === "string") {
    data.failureContains = body.failureContains.trim().slice(0, 300) || null;
  }

  if (typeof body.headers === "string") {
    const parsed = parseHeaders(body.headers);
    data.headers = Object.keys(parsed).length ? parsed : null;
  }

  /**
   * תבנית גוף השידור.
   *
   * תבנית שבורה היא כל הלידים של הקונה נדחים, ולכן היא
   * נבדקת **לפני** שמירה ולא אחרי.
   */
  if (typeof body.bodyTemplate === "string") {
    const template = body.bodyTemplate.trim();

    if (!template) {
      data.bodyTemplate = null;
    } else {
      const result = checkTemplate(template);

      if (!result.ok) {
        return NextResponse.json(
          { error: `התבנית לא נשמרה — ${result.error}` },
          { status: 400 }
        );
      }

      data.bodyTemplate = template;
    }
  }

  if (body.fieldMap !== undefined) {
    if (body.fieldMap === null) {
      data.fieldMap = null;
    } else if (typeof body.fieldMap === "object" && !Array.isArray(body.fieldMap)) {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.fieldMap)) {
        if (typeof v === "string") clean[k] = v;
      }
      data.fieldMap = clean;
    }
  }

  const buyer = await db.leadBuyer
    .update({ where: { id: params.id }, data })
    .catch(() => null);

  if (!buyer) {
    return NextResponse.json({ error: "הקונה לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/** בדיקת חיבור - שולח ליד דמה ומחזיר בדיוק מה שקרה */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const buyer = await db.leadBuyer
    .findUnique({ where: { id: params.id } })
    .catch(() => null);

  if (!buyer?.webhookUrl) {
    return NextResponse.json(
      { ok: false, error: "לא הוגדרה כתובת שליחה לקונה הזה" },
      { status: 400 }
    );
  }

  /**
   * ליד דמה מסומן בבירור, כדי שהקונה לא יחשוב שקיבל לקוח
   * אמיתי ויתחיל להתקשר.
   */
  const demo = applyFieldMap(
    buildPayload(
      {
        firstName: "בדיקת",
        lastName: "חיבור",
        phone: "+972500000000",
        status: "חדש",
        extra: {
          email: "test@example.com",
          fb_campaign: "בדיקה",
          supplier_question: "בדיקה",
        },
      },
      new Date()
    ),
    buyer.fieldMap
  );

  const asForm = buyer.webhookFormat === "form";
  const secret = buyer.webhookSecret?.trim();

  /**
   * הבדיקה חייבת לשלוח **בדיוק** כמו השליחה האמיתית -
   * אותן כותרות ואותה תבנית.
   *
   * בדיקה שעוברת ושליחה אמיתית שנכשלת היא הדבר הגרוע
   * ביותר כאן: אתה בטוח שהחיבור תקין, והלידים לא מגיעים.
   */
  const headers: Record<string, string> = {
    "Content-Type": asForm
      ? "application/x-www-form-urlencoded"
      : "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
  };

  const custom =
    buyer.headers && typeof buyer.headers === "object" && !Array.isArray(buyer.headers)
      ? (buyer.headers as Record<string, unknown>)
      : {};

  for (const [name, value] of Object.entries(custom)) {
    if (typeof value === "string" && name.trim() && value.trim()) {
      headers[name.trim()] = value.trim();
    }
  }

  const template = buyer.bodyTemplate?.trim();

  const body = template
    ? renderTemplate(template, demo)
    : asForm
      ? new URLSearchParams({
          ...demo,
          ...(secret ? { token: secret } : {}),
        }).toString()
      : JSON.stringify({ ...demo, ...(secret ? { token: secret } : {}) });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(buyer.webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    const text = (await response.text().catch(() => "")).slice(0, 400);

    return NextResponse.json({
      ok: isSuccess(response.status),
      httpStatus: response.status,
      response: text,
      sent: demo,
      נשלח_בפועל: body.slice(0, 600),
      כותרות: Object.keys(headers),
      verdict: isSuccess(response.status)
        ? "החיבור עובד. הקונה קיבל את ליד הבדיקה"
        : `השרת של הקונה החזיר ${response.status}`,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error:
        error instanceof Error ? error.message.slice(0, 300) : "שגיאת רשת",
      sent: demo,
      verdict: "לא הצלחנו להגיע לכתובת. בדוק שהיא נכונה ושהשרת פעיל",
    });
  }
}
