import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { clearLeadFormCache } from "@/lib/lead-forms";
import {
  listPages,
  listForms,
  pageToken,
  type FacebookForm,
} from "@/lib/facebook-graph";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  התממשקות: הטפסים של פייסבוק
 * ============================================================
 *
 *  GET  - כל הדפים, וכל הטפסים של כל דף, כפי שפייסבוק
 *         מחזירה אותם **עכשיו** - יחד עם השיוך ששמור אצלנו.
 *
 *  PATCH - שומר שיוך לטופס אחד.
 *
 *  למה לא מקלידים מזהים: הרשימה נשלפת מפייסבוק, ואתה
 *  בוחר מתוכה. טופס חדש שתפתח מחר יופיע כאן מעצמו.
 */

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = pageToken();

  if (!token) {
    return NextResponse.json({
      ok: false,
      error:
        "חסר FB_PAGE_TOKEN. בלעדיו אי אפשר לשלוף את הדפים והטפסים מפייסבוק.",
      pages: [],
    });
  }

  const [saved, buyers] = await Promise.all([
    db.leadForm.findMany().catch(() => []),
    db.leadBuyer.findMany({ orderBy: { name: "asc" } }).catch(() => []),
  ]);

  const savedByForm = new Map(saved.map((f) => [f.formId, f]));

  let pages;
  try {
    pages = await listPages(token);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error:
        error instanceof Error
          ? `פייסבוק החזירה: ${error.message}`
          : "לא ניתן לשלוף את הדפים",
      pages: [],
    });
  }

  /**
   * שולפים את הטפסים של כל הדפים במקביל.
   *
   * כשל בדף אחד לא מפיל את השאר - הוא מדווח על עצמו,
   * כדי שתראה בדיוק איזה דף בעייתי ולמה.
   */
  const results = await Promise.all(
    pages.map(async (page) => {
      let forms: FacebookForm[] = [];
      let error: string | null = null;

      try {
        forms = await listForms(page);
      } catch (err) {
        error = err instanceof Error ? err.message : "שגיאה";
      }

      return {
        id: page.id,
        name: page.name,
        error,
        forms: forms.map((form) => {
          const row = savedByForm.get(form.id);

          return {
            formId: form.id,
            formName: form.name,
            status: form.status ?? null,
            leadsCount: form.leads_count ?? null,
            channel: row?.channel ?? "mine",
            buyerId: row?.buyerId ?? null,
            pricePerLead: row?.pricePerLead ?? 0,
            supplierKey: row?.supplierKey ?? null,
            configured: Boolean(row),
          };
        }),
      };
    })
  );

  return NextResponse.json({
    ok: true,
    pages: results,
    buyers: buyers.map((b) => ({ id: b.id, name: b.name })),
  });
}

export async function PATCH(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const formId = typeof body.formId === "string" ? body.formId.trim() : "";
  const formName =
    typeof body.formName === "string" ? body.formName.trim().slice(0, 300) : "";
  const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
  const pageName =
    typeof body.pageName === "string" ? body.pageName.trim().slice(0, 300) : "";

  if (!formId || !pageId) {
    return NextResponse.json({ error: "חסר טופס או דף" }, { status: 400 });
  }

  const channel = body.channel === "sale" ? "sale" : "mine";

  const price = Number(body.pricePerLead ?? 0);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    return NextResponse.json({ error: "מחיר לא תקין" }, { status: 400 });
  }

  /**
   * טופס של קונה בלי קונה מוגדר הוא מצב שמוביל ללידים
   * שלא נשלחים לאף אחד ולא מופיעים אצלך. נעצר כאן.
   */
  const buyerId =
    typeof body.buyerId === "string" && body.buyerId ? body.buyerId : null;

  if (channel === "sale" && !buyerId) {
    return NextResponse.json(
      { error: "טופס של מכירה צריך קונה. בחר קונה או החזר אותו ללידים שלך." },
      { status: 400 }
    );
  }

  const data = {
    formName: formName || formId,
    pageId,
    pageName: pageName || pageId,
    channel,
    buyerId,
    pricePerLead: price,
    supplierKey:
      typeof body.supplierKey === "string" && body.supplierKey.trim()
        ? body.supplierKey.trim().slice(0, 200)
        : null,
  };

  await db.leadForm
    .upsert({
      where: { formId },
      create: { formId, ...data },
      update: data,
    })
    .catch(() => null);

  clearLeadFormCache();

  return NextResponse.json({ ok: true });
}
