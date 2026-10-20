import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { clearChannelCache } from "@/lib/channels";

export const dynamic = "force-dynamic";

/** ערוץ חדש בתוך קמפיין */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!campaignId || !name) {
    return NextResponse.json({ error: "צריך קמפיין ושם לערוץ" }, { status: 400 });
  }

  const created = await db.channel
    .create({
      data: {
        campaignId,
        name: name.slice(0, 120),
        isSale: body.isSale === true,
      },
    })
    .catch(() => null);

  if (!created) {
    return NextResponse.json(
      { error: "הערוץ לא נוצר. אולי כבר קיים ערוץ בשם הזה בקמפיין." },
      { status: 400 }
    );
  }

  clearChannelCache();
  return NextResponse.json({ ok: true, id: created.id });
}
