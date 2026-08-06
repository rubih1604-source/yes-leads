import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readRowFields } from "@/lib/row-fields";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.botEnabled === "boolean") data.botEnabled = body.botEnabled;
  if (typeof body.onlyAfterTemplate === "boolean")
    data.onlyAfterTemplate = body.onlyAfterTemplate;

  if (typeof body.botOnlyOutsideHours === "boolean")
    data.botOnlyOutsideHours = body.botOnlyOutsideHours;

  if (body.botPauseHours !== undefined) {
    const n = Number(body.botPauseHours);
    if (Number.isFinite(n) && n >= 0 && n <= 168) data.botPauseHours = Math.round(n);
  }

  if (typeof body.requireTemplateFirst === "boolean") {
    data.requireTemplateFirst = body.requireTemplateFirst;
  }

  if (body.afterHoursGrace !== undefined) {
    const n = Number(body.afterHoursGrace);
    if (Number.isFinite(n) && n >= 0 && n <= 600)
      data.afterHoursGrace = Math.round(n);
  }

  if (body.leadRowFields !== undefined) {
    data.leadRowFields = readRowFields(body.leadRowFields);
  }

  if (body.revenueTarget !== undefined) {
    const n = Number(body.revenueTarget);
    if (Number.isFinite(n) && n >= 0 && n <= 10000000) data.revenueTarget = n;
  }

  if (body.liveChatMinutes !== undefined) {
    const n = Number(body.liveChatMinutes);
    if (Number.isFinite(n) && n >= 0 && n <= 600)
      data.liveChatMinutes = Math.round(n);
  }

  if (body.replyCooldownMinutes !== undefined) {
    const n = Number(body.replyCooldownMinutes);
    if (Number.isFinite(n) && n >= 0 && n <= 600)
      data.replyCooldownMinutes = Math.round(n);
  }

  for (const key of ["replyInterested", "replyAfterHours", "replyCallback"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) {
      data[key] = value.trim().slice(0, 1000);
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלח מה לעדכן" }, { status: 400 });
  }

  const row = await db.settings.upsert({
    where: { id: "main" },
    create: { id: "main", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, settings: row });
}
