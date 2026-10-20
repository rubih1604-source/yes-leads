import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** תצוגה שמורה לרשימת הלידים */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "צריך שם לתצוגה" }, { status: 400 });
  }

  const ids = (value: unknown): string[] =>
    Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === "string" && !!v))]
      : [];

  const campaignIds = ids(body.campaignIds);
  const channelIds = ids(body.channelIds);

  /**
   * תצוגה בלי בחירה הייתה מציגה כלום, והמשתמש היה חושב
   * שהמערכת ריקה. נעצר כאן.
   */
  if (campaignIds.length === 0 && channelIds.length === 0) {
    return NextResponse.json(
      { error: "בחר לפחות קמפיין או ערוץ אחד" },
      { status: 400 }
    );
  }

  const created = await db.leadView
    .upsert({
      where: { name },
      create: {
        name: name.slice(0, 80),
        campaignIds,
        channelIds,
        includeSale: body.includeSale === true,
      },
      update: {
        campaignIds,
        channelIds,
        includeSale: body.includeSale === true,
      },
    })
    .catch(() => null);

  if (!created) {
    return NextResponse.json({ error: "התצוגה לא נשמרה" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: created.id });
}

export async function DELETE(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  await db.leadView.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
