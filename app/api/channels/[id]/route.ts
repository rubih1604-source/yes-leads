import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { clearChannelCache } from "@/lib/channels";
import { parseHeaders, checkTemplate } from "@/lib/delivery-payload";
import { clearLeadFormCache } from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 120);
  }

  if (typeof body.isSale === "boolean") data.isSale = body.isSale;
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.sendEnabled === "boolean") data.sendEnabled = body.sendEnabled;
  if (typeof body.autoSend === "boolean") data.autoSend = body.autoSend;

  if (body.pricePerLead !== undefined) {
    const n = Number(body.pricePerLead);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return NextResponse.json({ error: "מחיר לא תקין" }, { status: 400 });
    }
    data.pricePerLead = n;
  }

  if (typeof body.webhookUrl === "string") {
    const url = body.webhookUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "הכתובת חייבת להתחיל ב-https" },
        { status: 400 }
      );
    }
    data.webhookUrl = url || null;
  }

  /**
   * אילו שדות הצד השני מקבל.
   *
   * מקבלים רק מפתחות שהמערכת באמת יודעת לשלוח, כדי שסימון
   * שגוי לא יישמר בשקט ויתגלה רק כשהקונה יתלונן.
   */
  /**
   * חריגי מחיר לפי מודעה.
   *
   * נקראים דרך readAdPrices כדי שכלל שבור לא יישמר ויפיל
   * אחר כך את הקליטה - ליד שנכנס חשוב יותר מכלל תמחור.
   */
  if (body.adPrices !== undefined) {
    const { readAdPrices } = await import("@/lib/ad-pricing");
    data.adPrices = readAdPrices(body.adPrices);
  }

  if (Array.isArray(body.fields)) {
    const { DELIVERY_FIELDS } = await import("@/lib/delivery-payload");
    const known = new Set(DELIVERY_FIELDS.map((f) => f.key));

    data.fields = (body.fields as unknown[])
      .map((f) => String(f ?? "").trim())
      .filter((f) => known.has(f));
  }

  if (typeof body.webhookSecret === "string") {
    data.webhookSecret = body.webhookSecret.trim() || null;
  }

  if (body.webhookFormat === "json" || body.webhookFormat === "form") {
    data.webhookFormat = body.webhookFormat;
  }

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
   * תבנית פסולה נחסמת כאן ולא נשמרת.
   *
   * תבנית שבורה שנשמרת היא ליד שלא מגיע לקונה, והגילוי
   * קורה רק כשהוא מתלונן.
   */
  if (typeof body.bodyTemplate === "string") {
    const template = body.bodyTemplate.trim();

    if (!template) {
      data.bodyTemplate = null;
    } else {
      const check = checkTemplate(template);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      data.bodyTemplate = template;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  const updated = await db.channel
    .update({ where: { id: params.id }, data })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "לא נשמר" }, { status: 400 });
  }

  clearChannelCache();
  clearLeadFormCache();
  return NextResponse.json({ ok: true });
}

/**
 * שיוך טפסים לערוץ - זו ההתממשקות, מתוך הערוץ עצמו.
 *
 * מקבל את רשימת הטפסים המלאה של הערוץ: מה שלא ברשימה
 * מנותק ממנו. ככה אין מצב של טופס שנשאר משויך בשקט.
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const forms: Array<{ formId: string; formName: string; pageId: string; pageName: string }> =
    Array.isArray(body.forms) ? body.forms : [];

  const channel = await db.channel
    .findUnique({ where: { id: params.id } })
    .catch(() => null);

  if (!channel) {
    return NextResponse.json({ error: "הערוץ לא נמצא" }, { status: 404 });
  }

  // מנתקים טפסים שהוסרו מהרשימה
  await db.leadForm
    .updateMany({
      where: { channelId: channel.id },
      data: { channelId: null },
    })
    .catch(() => null);

  let linked = 0;

  for (const form of forms) {
    if (!form?.formId) continue;

    const done = await db.leadForm
      .upsert({
        where: { formId: form.formId },
        create: {
          formId: form.formId,
          formName: form.formName || form.formId,
          pageId: form.pageId || "",
          pageName: form.pageName || "",
          channel: channel.isSale ? "sale" : "mine",
          channelId: channel.id,
          pricePerLead: channel.pricePerLead,
        },
        update: {
          formName: form.formName || form.formId,
          channel: channel.isSale ? "sale" : "mine",
          channelId: channel.id,
        },
      })
      .catch(() => null);

    if (done) linked++;
  }

  clearChannelCache();
  clearLeadFormCache();

  return NextResponse.json({ ok: true, linked });
}

/** שליחת ליד בדיקה לכתובת של הערוץ */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const channel = await db.channel
    .findUnique({ where: { id: params.id } })
    .catch(() => null);

  if (!channel?.webhookUrl?.trim()) {
    return NextResponse.json(
      { error: "לערוץ הזה לא מוגדרת כתובת" },
      { status: 400 }
    );
  }

  const { buildPayload, pickFields, renderTemplate, deliveryVerdict } =
    await import("@/lib/delivery-payload");

  /**
   * ליד הבדיקה עובר **אותו סינון שדות** כמו ליד אמיתי.
   *
   * אחרת הבדיקה הייתה שולחת את כל השדות, היא הייתה עוברת,
   * ואז ליד אמיתי היה מגיע לקונה עם שדות אחרים לגמרי -
   * בדיקה שמאשרת משהו שלא יקרה היא גרועה מאין בדיקה.
   */
  const sample = pickFields(
    buildPayload(
      {
        firstName: "בדיקה",
        lastName: "מהמערכת",
        phone: "+972500000000",
        status: "חדש",
        extra: { email: "test@example.com", fb_campaign: channel.name },
      },
      new Date()
    ),
    channel.fields
  );

  const template = channel.bodyTemplate?.trim();
  const asForm = channel.webhookFormat === "form";

  const bodyText = template
    ? renderTemplate(template, sample)
    : asForm
      ? new URLSearchParams(sample).toString()
      : JSON.stringify(sample);

  const headers: Record<string, string> = {
    "Content-Type": asForm
      ? "application/x-www-form-urlencoded"
      : "application/json",
  };

  const secret = channel.webhookSecret?.trim();
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  const custom =
    channel.headers && typeof channel.headers === "object" && !Array.isArray(channel.headers)
      ? (channel.headers as Record<string, unknown>)
      : {};

  for (const [name, value] of Object.entries(custom)) {
    if (typeof value === "string" && name.trim() && value.trim()) {
      headers[name.trim()] = value.trim();
    }
  }

  let httpStatus = 0;
  let responseText = "";
  let networkError = "";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(channel.webhookUrl.trim(), {
      method: "POST",
      headers,
      body: bodyText,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);
    httpStatus = response.status;
    responseText = (await response.text().catch(() => "")).slice(0, 400);
  } catch (err) {
    networkError = err instanceof Error ? err.message.slice(0, 200) : "שגיאת רשת";
  }

  const verdict =
    httpStatus === 0
      ? { ok: false, reason: networkError || "לא התקבלה תשובה" }
      : deliveryVerdict({
          httpStatus,
          body: responseText,
          successContains: channel.successContains,
          failureContains: channel.failureContains,
        });

  return NextResponse.json({
    ok: verdict.ok,
    verdict: verdict.ok
      ? `הצליח · השרת החזיר ${httpStatus}`
      : `נכשל · ${verdict.reason}`,
    httpStatus,
    response: responseText,
    נשלח: bodyText.slice(0, 500),
    כותרות: Object.keys(headers),
  });
}
