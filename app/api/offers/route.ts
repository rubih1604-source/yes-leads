import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { readTargets } from "@/lib/offer-targets";

export const dynamic = "force-dynamic";

/** מבצע חדש */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "צריך שם למבצע" }, { status: 400 });
  }

  const targets = readTargets(body.targets);

  const offer = await db.offer.create({
    data: {
      title: body.title.trim().slice(0, 150),
      price: str(body.price),
      decoders: str(body.decoders),
      streaming: str(body.streaming),
      sports: str(body.sports),
      freeText: str(body.freeText, 1500),
      targets,
    },
  });

  return NextResponse.json({ ok: true, offer });
}

function str(value: unknown, max = 300): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}
