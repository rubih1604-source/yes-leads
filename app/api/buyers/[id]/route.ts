import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import {
  buildPayload,
  applyFieldMap,
  isSuccess,
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

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(buyer.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": asForm
          ? "application/x-www-form-urlencoded"
          : "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: asForm
        ? new URLSearchParams({
            ...demo,
            ...(secret ? { token: secret } : {}),
          }).toString()
        : JSON.stringify({ ...demo, ...(secret ? { token: secret } : {}) }),
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
