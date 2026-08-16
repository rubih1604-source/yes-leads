import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { parseSheet } from "@/lib/sheet-parse";
import { normalizePhone } from "@/lib/phone";
import { getStatuses } from "@/lib/status-store";
import { SALE_ORIGIN } from "@/lib/sales-campaigns";

export const dynamic = "force-dynamic";

/**
 * ייבוא לידים חדשים מקובץ.
 *
 * להבדיל מטעינת דוח מכירות, שרק מעדכנת סטטוסים ללידים
 * קיימים - כאן **יוצרים** לידים שלא נמצאים אצלנו בכלל.
 *
 * חשוב: הייבוא לא מפעיל שום אוטומציה. 150 לידים שנכנסים
 * לא יגררו 150 הודעות וואטסאפ.
 */

type RowReport = {
  name: string | null;
  phone: string | null;
  outcome: "created" | "exists" | "nophone" | "invalid";
  detail: string;
};

/** תאריך מהקובץ, אם אפשר לקרוא אותו */
function parseDate(value: string | null): Date | null {
  if (!value?.trim()) return null;

  const text = value.trim();

  // פורמט ישראלי: 12/08/2026 או 12.8.26
  const il = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(text);
  if (il) {
    const day = Number(il[1]);
    const month = Number(il[2]);
    let year = Number(il[3]);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month - 1, day, 9, 0, 0));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(request: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { text, fileName, mode, status, campaignId, dryRun } = await request
    .json()
    .catch(() => ({}));

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });
  }

  const { rows, detected } = parseSheet(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: "לא נמצאו שורות" }, { status: 400 });
  }

  if (detected.phone < 0) {
    return NextResponse.json(
      { error: "לא זוהתה עמודת טלפון. בלעדיה אי אפשר לייבא." },
      { status: 400 }
    );
  }

  const toSale = mode === "sale";
  let campaign: { id: string; name: string; pricePerLead: number } | null = null;

  if (toSale) {
    if (!campaignId) {
      return NextResponse.json(
        { error: "צריך לבחור קמפיין מכירה" },
        { status: 400 }
      );
    }
    const found = await db.salesCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!found) {
      return NextResponse.json({ error: "הקמפיין לא נמצא" }, { status: 404 });
    }
    campaign = {
      id: found.id,
      name: found.name,
      pricePerLead: Number(found.pricePerLead ?? 0),
    };
  }

  const statuses = await getStatuses();
  const defaultStatus =
    typeof status === "string" && statuses.some((s) => s.name === status)
      ? status
      : statuses[0]?.name ?? "חדש";

  const report: RowReport[] = [];
  let created = 0;
  let exists = 0;

  for (const row of rows) {
    const phone = row.phone ? normalizePhone(row.phone) : null;

    if (!phone) {
      report.push({
        name: row.name,
        phone: row.phone,
        outcome: "nophone",
        detail: "אין טלפון תקין",
      });
      continue;
    }

    const already = await db.lead.findUnique({ where: { phone } });
    if (already) {
      exists++;
      report.push({
        name: row.name,
        phone: row.phone,
        outcome: "exists",
        detail: `כבר קיים · ${already.status}`,
      });
      continue;
    }

    if (dryRun) {
      created++;
      report.push({
        name: row.name,
        phone: row.phone,
        outcome: "created",
        detail: toSale ? `ייווצר תחת ${campaign!.name}` : `ייווצר כ"${defaultStatus}"`,
      });
      continue;
    }

    // כל השדות מהקובץ נשמרים, כדי שלא יאבד מידע
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(row.raw)) {
      if (value?.trim()) extra[key] = value.trim().slice(0, 300);
    }
    if (row.campaign) extra.fb_campaign = row.campaign;
    if (row.email) extra.email = row.email;
    if (toSale && campaign) extra.fb_campaign = campaign.name;

    const parts = (row.name ?? "").trim().split(/\s+/).filter(Boolean);
    const intakeAt = parseDate(row.date) ?? new Date();

    const lead = await db.lead.create({
      data: {
        phone,
        firstName: parts[0] ?? null,
        lastName: parts.slice(1).join(" ") || null,
        status: toSale ? defaultStatus : defaultStatus,
        source: fileName ? `ייבוא: ${String(fileName).slice(0, 80)}` : "ייבוא",
        origin: toSale ? SALE_ORIGIN : "leadmanager",
        intakeAt,
        extra: Object.keys(extra).length ? extra : undefined,
      },
    });

    await db.leadEntry
      .create({
        data: {
          leadId: lead.id,
          campaign: toSale ? campaign!.name : row.campaign,
          source: "ייבוא",
          isSale: toSale,
          price: toSale ? campaign!.pricePerLead : 0,
          at: intakeAt,
        },
      })
      .catch(() => null);

    await db.leadEvent
      .create({
        data: {
          leadId: lead.id,
          type: "lead_created",
          actor: "user",
          payload: { imported: true, fileName: fileName ?? null },
        },
      })
      .catch(() => null);

    created++;
    report.push({
      name: row.name,
      phone: row.phone,
      outcome: "created",
      detail: toSale ? `נוצר תחת ${campaign!.name}` : `נוצר כ"${defaultStatus}"`,
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun: dryRun === true,
    rows: rows.length,
    created,
    exists,
    report: report.slice(0, 300),
  });
}
