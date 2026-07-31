import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { DEFAULT_SUBSTATUSES } from "@/lib/substatus";
import { isKnownStatus } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { statusName, name, seed } = await request.json().catch(() => ({}));

  // טעינת ברירות המחדל
  if (seed === true) {
    let created = 0;
    for (const [status, names] of Object.entries(DEFAULT_SUBSTATUSES)) {
      if (!(await isKnownStatus(status))) continue;
      for (const [i, sub] of names.entries()) {
        const exists = await db.subStatus.findFirst({
          where: { statusName: status, name: sub },
        });
        if (exists) continue;
        await db.subStatus
          .create({ data: { statusName: status, name: sub, position: i } })
          .catch(() => null);
        created++;
      }
    }
    return NextResponse.json({ ok: true, created });
  }

  if (!statusName || !name?.trim()) {
    return NextResponse.json(
      { error: "צריך סטטוס ושם לתת-סטטוס" },
      { status: 400 }
    );
  }

  if (!(await isKnownStatus(statusName))) {
    return NextResponse.json({ error: "סטטוס לא מוכר" }, { status: 400 });
  }

  const exists = await db.subStatus.findFirst({
    where: { statusName, name: name.trim() },
  });
  if (exists) {
    return NextResponse.json({ error: "כבר קיים" }, { status: 400 });
  }

  const last = await db.subStatus.findFirst({
    where: { statusName },
    orderBy: { position: "desc" },
  });

  const created = await db.subStatus.create({
    data: {
      statusName,
      name: name.trim().slice(0, 80),
      position: (last?.position ?? -1) + 1,
    },
  });

  return NextResponse.json({ ok: true, subStatus: created });
}
