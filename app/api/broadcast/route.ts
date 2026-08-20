import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { parseSheet } from "@/lib/sheet-parse";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * יצירת רשימת דיוור מקובץ.
 *
 * אלה אינם לידים - הם לא נכנסים לרשימה, אין להם סטטוס,
 * ואין עליהם אוטומציה. רק שם וטלפון, כדי לשלוח תבנית.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { name, text, dryRun } = await request.json().catch(() => ({}));

  if (!name?.trim()) {
    return NextResponse.json({ error: "צריך שם לרשימה" }, { status: 400 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });
  }

  const { rows, detected } = parseSheet(text);

  if (detected.phone < 0) {
    return NextResponse.json(
      { error: "לא זוהתה עמודת טלפון בקובץ" },
      { status: 400 }
    );
  }

  // ניקוי כפילויות בתוך הקובץ עצמו
  const unique = new Map<string, string | null>();
  let invalid = 0;

  for (const row of rows) {
    const phone = row.phone ? normalizePhone(row.phone) : null;
    if (!phone) {
      invalid++;
      continue;
    }
    if (!unique.has(phone)) {
      const first = (row.name ?? "").trim().split(/\s+/)[0] || null;
      unique.set(phone, first);
    }
  }

  if (unique.size === 0) {
    return NextResponse.json(
      { error: "לא נמצא אף מספר תקין בקובץ" },
      { status: 400 }
    );
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      rows: rows.length,
      contacts: unique.size,
      invalid,
      duplicates: rows.length - unique.size - invalid,
    });
  }

  const list = await db.broadcastList.create({
    data: { name: name.trim().slice(0, 120) },
  });

  let created = 0;
  for (const [phone, firstName] of unique) {
    try {
      await db.broadcastContact.create({
        data: { listId: list.id, phone, firstName },
      });
      created++;
    } catch {
      // כפילות מול הרשימה - מדלגים
    }
  }

  return NextResponse.json({
    ok: true,
    listId: list.id,
    contacts: created,
    invalid,
  });
}
