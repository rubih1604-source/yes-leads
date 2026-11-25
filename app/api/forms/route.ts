import { NextRequest, NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkLogo } from "@/lib/logo-image";

export const dynamic = "force-dynamic";

/** התכלת של yes, כפי שהיא מוגדרת אצלם: --yes-blue-100 */
const YES_BLUE = "#00D8FE";

/**
 * שדות של שורה-לכל-פריט.
 *
 * שורות ריקות ורווחים בקצוות הם מה שקורה כשמדביקים טקסט
 * מוורד או מווטסאפ. בלי ניקוי כאן, הדף היה מצייר נקודת
 * ✓ ריקה באמצע המבצע.
 */
function cleanLines(raw: string, keep?: (line: string) => boolean): string | null {
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => (keep ? keep(s) : true));

  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * כתובת תמונה סבירה.
 *
 * רק http/https: כתובת `data:` או `javascript:` בדף ציבורי
 * היא דלת שלא צריכה להיות פתוחה, וכתובת יחסית לא תיטען
 * ממילא.
 */
function isImageUrl(line: string): boolean {
  return /^https?:\/\//i.test(line);
}

/** רשימת הטפסים, החדש קודם */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const forms = await db.publicForm
    .findMany({ orderBy: { createdAt: "desc" } })
    .catch(() => []);

  return NextResponse.json({ ok: true, forms });
}

/**
 * יצירת קישור חדש, או עדכון קיים.
 *
 * **קישור לכל פלטפורמה, ולא אחד לכולן.** זה מה שנותן את
 * מקור ההגעה בלי שתצטרך לזכור לסמן כלום: הקישור יודע
 * מאיפה הוא, ולכן הליד יודע.
 */
export async function POST(request: NextRequest) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    source?: string;
    campaignName?: string;
    title?: string;
    subtitle?: string;
    askSupplier?: boolean;
    active?: boolean;
    logoUrl?: string;
    brandColor?: string;
    priceAmount?: string;
    pricePeriod?: string;
    priceNote?: string;
    offerDetails?: string;
    images?: string;
    suppliers?: string;
    benefits?: string;
    existingMsg?: string;
    consentText?: string;
    requireConsent?: boolean;
    requireEmail?: boolean;
    requireSupplier?: boolean;
  };

  const name = body.name?.trim();
  const source = body.source?.trim();

  if (!body.id && (!name || !source)) {
    return NextResponse.json(
      { error: "צריך שם לקישור ומקור הגעה" },
      { status: 400 }
    );
  }

  /**
   * **גם בעריכה, לא רק ביצירה.**
   *
   * בלי זה, שם שנמחק בטעות בעריכה היה נשמר ריק - והקישור
   * היה הופך לשורה בלי שם ברשימה, בלי שתדע לאיזו מודעה
   * הוא מחובר.
   */
  if (body.id) {
    if (body.name !== undefined && !name) {
      return NextResponse.json({ error: "צריך שם לקישור" }, { status: 400 });
    }
    if (body.source !== undefined && !source) {
      return NextResponse.json({ error: "צריך מקור הגעה" }, { status: 400 });
    }
  }

  {
    const logo = (body.logoUrl ?? "").trim();
    const check = checkLogo(logo);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};

  if (name !== undefined) data.name = name;
  if (source !== undefined) data.source = source;
  if (body.campaignName !== undefined) {
    data.campaignName = body.campaignName.trim() || null;
  }
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.subtitle !== undefined) {
    data.subtitle = body.subtitle.trim() || null;
  }
  if (body.askSupplier !== undefined) data.askSupplier = body.askSupplier;
  if (body.active !== undefined) data.active = body.active;
  /**
   * הלוגו: כתובת http(s), או תמונה מוטמעת שהועלתה מהמסך.
   *
   * כל דבר אחר נדחה - `javascript:` בשדה שמוצג בדף פתוח
   * לאינטרנט כולו היא דלת שלא צריכה להיות פתוחה.
   */
  if (body.logoUrl !== undefined) {
    const logo = body.logoUrl.trim();
    const check = checkLogo(logo);

    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }

    data.logoUrl = logo || null;
  }
  if (body.brandColor !== undefined) {
    data.brandColor = body.brandColor.trim() || YES_BLUE;
  }

  /**
   * ============================================================
   *  המבצע
   * ============================================================
   *
   *  **ריק מוחק, ולא "משאיר כמו שהיה".**
   *
   *  אם מחיקת שדה הייתה נשארת בלי שינוי, לא היית יכול
   *  להוריד מבצע שנגמר - הוא היה ממשיך להופיע בדף אחרי
   *  שהמחיר כבר לא נכון. מבצע שנגמר ומוצג הוא הבטחה
   *  שאתה לא יכול לקיים בשיחה.
   */
  if (body.priceAmount !== undefined) {
    data.priceAmount = body.priceAmount.trim() || null;
  }
  if (body.pricePeriod !== undefined) {
    data.pricePeriod = body.pricePeriod.trim() || "לחודש";
  }
  if (body.priceNote !== undefined) {
    data.priceNote = body.priceNote.trim() || null;
  }
  if (body.offerDetails !== undefined) {
    data.offerDetails = cleanLines(body.offerDetails);
  }

  /**
   * הגרפיקה נבדקת לפני השמירה.
   *
   * כתובת שאינה תמונה הייתה מציירת ריבוע שבור בדף נחיתה
   * של מודעה בתשלום - ולכן שורה שלא נראית כמו כתובת
   * נזרקת כאן ולא מגיעה לדף.
   */
  if (body.images !== undefined) {
    data.images = cleanLines(body.images, isImageUrl);
  }
  if (body.suppliers !== undefined) {
    data.suppliers = body.suppliers.trim() || null;
  }
  if (body.benefits !== undefined) data.benefits = cleanLines(body.benefits);
  if (body.existingMsg !== undefined && body.existingMsg.trim()) {
    data.existingMsg = body.existingMsg.trim();
  }

  /**
   * נוסח ההסכמה לא יכול להישמר ריק.
   *
   * תיבת סימון בלי טקסט היא תיבה שהלקוח מאשר בלי לדעת
   * על מה - וזו לא הסכמה. ריק פשוט משאיר את הקיים.
   */
  if (body.consentText !== undefined && body.consentText.trim()) {
    data.consentText = body.consentText.trim();
  }
  if (body.requireConsent !== undefined) {
    data.requireConsent = body.requireConsent;
  }
  if (body.requireEmail !== undefined) data.requireEmail = body.requireEmail;
  if (body.requireSupplier !== undefined) {
    data.requireSupplier = body.requireSupplier;
  }

  const form = body.id
    ? await db.publicForm
        .update({ where: { id: body.id }, data })
        .catch(() => null)
    : await db.publicForm
        .create({
          data: {
            name: name!,
            source: source!,
            campaignName: (body.campaignName ?? "").trim() || null,
            title: body.title?.trim() || "קבלו הצעה משתלמת מ-yes",
            subtitle: body.subtitle?.trim() || null,
            askSupplier: body.askSupplier ?? true,
            logoUrl: body.logoUrl?.trim() || null,
            brandColor: body.brandColor?.trim() || YES_BLUE,
            priceAmount: body.priceAmount?.trim() || null,
            ...(body.pricePeriod?.trim()
              ? { pricePeriod: body.pricePeriod.trim() }
              : {}),
            priceNote: body.priceNote?.trim() || null,
            offerDetails: cleanLines(body.offerDetails ?? ""),
            images: cleanLines(body.images ?? "", isImageUrl),
            suppliers: body.suppliers?.trim() || null,
            benefits: cleanLines(body.benefits ?? ""),
            ...(body.existingMsg?.trim()
              ? { existingMsg: body.existingMsg.trim() }
              : {}),
            ...(body.consentText?.trim()
              ? { consentText: body.consentText.trim() }
              : {}),
            ...(body.requireConsent !== undefined
              ? { requireConsent: body.requireConsent }
              : {}),
            requireEmail: body.requireEmail ?? false,
            requireSupplier: body.requireSupplier ?? false,
          },
        })
        .catch(() => null);

  if (!form) {
    return NextResponse.json({ error: "השמירה נכשלה" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, form });
}
