import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { parseSheet } from "@/lib/sheet-parse";
import { findMatch, type MatchCandidate } from "@/lib/name-match";
import { normalizePhone } from "@/lib/phone";
import { applyStatusChange } from "@/lib/rules";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

type RowReport = {
  name: string | null;
  phone: string | null;
  outcome: "updated" | "already" | "ambiguous" | "notfound" | "nostatus";
  detail: string;
  leadId?: string;
};

/**
 * מעבד דוח מכירות ומעדכן סטטוסים.
 *
 * dryRun=true מחזיר תצוגה מקדימה בלי לשנות כלום -
 * ככה אתה רואה בדיוק מה יקרה לפני שזה קורה.
 */
export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { text, fileName, targetStatus, dryRun } = await request
    .json()
    .catch(() => ({}));

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });
  }

  const statuses = await getStatuses();
  const wonNames = statuses.filter((s) => s.won).map((s) => s.name);

  // הסטטוס שאליו יעברו ההתאמות
  const fallback =
    typeof targetStatus === "string" && statuses.some((s) => s.name === targetStatus)
      ? targetStatus
      : wonNames[0];

  if (!fallback) {
    return NextResponse.json(
      { error: "אין סטטוס סגירה מוגדר. הגדר אחד בהגדרות." },
      { status: 400 }
    );
  }

  const { rows, detected } = parseSheet(text);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "לא נמצאו שורות בקובץ" },
      { status: 400 }
    );
  }

  if (detected.name < 0 && detected.phone < 0) {
    return NextResponse.json(
      { error: "לא זוהתה עמודת שם או טלפון בקובץ" },
      { status: 400 }
    );
  }

  const leads = await db.lead.findMany({
    where: { origin: "leadmanager" },
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  });

  const candidates: MatchCandidate[] = leads.map((l) => ({
    id: l.id,
    phone: l.phone,
    fullName: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim(),
    status: l.status,
  }));

  const report: RowReport[] = [];
  let matched = 0;
  let updated = 0;

  for (const row of rows) {
    const phone = row.phone ? normalizePhone(row.phone) : null;

    const result = findMatch({ name: row.name, phone, candidates });

    if (result.kind === "ambiguous") {
      report.push({
        name: row.name,
        phone: row.phone,
        outcome: "ambiguous",
        detail: `${result.leads.length} לידים באותו שם - לא נגעתי. עדכן ידנית.`,
      });
      continue;
    }

    if (result.kind === "none") {
      report.push({
        name: row.name,
        phone: row.phone,
        outcome: "notfound",
        detail: "לא נמצא ליד מתאים",
      });
      continue;
    }

    matched++;
    const lead = result.lead;

    // אם בדוח יש סטטוס שתואם לסטטוס אצלנו - משתמשים בו
    let newStatus = fallback;
    if (row.status) {
      const exact = statuses.find(
        (s) => s.name.trim() === row.status!.trim()
      );
      if (exact) newStatus = exact.name;
    }

    if (lead.status === newStatus) {
      report.push({
        name: row.name,
        phone: row.phone,
        outcome: "already",
        detail: `כבר ב"${newStatus}"`,
        leadId: lead.id,
      });
      continue;
    }

    if (!dryRun) {
      await applyStatusChange({
        leadId: lead.id,
        toStatus: newStatus,
        actor: "user",
        note: `עודכן מדוח מכירות${fileName ? ` (${fileName})` : ""}`,
      });
    }

    updated++;
    report.push({
      name: row.name,
      phone: row.phone,
      outcome: "updated",
      detail: `${lead.status} ← ${newStatus} (התאמה לפי ${
        result.kind === "phone" ? "טלפון" : "שם"
      })`,
      leadId: lead.id,
    });
  }

  if (!dryRun) {
    await db.importRun
      .create({
        data: {
          fileName: typeof fileName === "string" ? fileName.slice(0, 200) : null,
          rows: rows.length,
          matched,
          updated,
          skipped: rows.length - matched,
          report: report.slice(0, 300),
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    dryRun: dryRun === true,
    rows: rows.length,
    matched,
    updated,
    report: report.slice(0, 300),
  });
}
