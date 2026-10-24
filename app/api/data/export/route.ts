import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { resolveRange, type PeriodKey } from "@/lib/periods";
import {
  inData,
  buildCsv,
  fileNameFor,
  type ExportFormat,
  type DataLead,
} from "@/lib/data-export";

export const dynamic = "force-dynamic";

/**
 * הורדת הדאטה כקובץ.
 *
 * אותם סטטוסים מוחרגים ואותו טווח כמו במסך, כדי שמה שיורד
 * יהיה בדיוק מה שראית. קובץ שלא תואם למספר שעל המסך הוא
 * קובץ שאי אפשר לסמוך עליו.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const period = (url.searchParams.get("period") ?? "this_month") as PeriodKey;
  const format = (url.searchParams.get("format") ?? "lookalike") as ExportFormat;

  const range = resolveRange(
    period,
    url.searchParams.get("from"),
    url.searchParams.get("to")
  );

  const settings = await getSettings();

  const leads = await db.lead
    .findMany({
      where: {
        createdAt: { gte: range.from, lt: range.to },
        origin: { not: "whatsapp" },
      },
      orderBy: { createdAt: "desc" },
      take: 50000,
      select: {
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        extra: true,
        createdAt: true,
        entries: {
          orderBy: { at: "desc" },
          take: 1,
          select: { campaign: true },
        },
      },
    })
    .catch(() => []);

  const rows: DataLead[] = [];

  for (const lead of leads) {
    if (!inData(lead, settings.dataExcludeStatuses)) continue;

    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, unknown>)
        : {};

    rows.push({
      phone: lead.phone,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: typeof extra.email === "string" ? extra.email : null,
      status: lead.status,
      campaign: lead.entries[0]?.campaign ?? null,
      createdAt: lead.createdAt.toLocaleDateString("he-IL", {
        timeZone: "Asia/Jerusalem",
      }),
    });
  }

  const { csv } = buildCsv(rows, format);

  /**
   * BOM בתחילת הקובץ.
   *
   * בלעדיו אקסל פותח עברית כג'יבריש, וזה נראה כאילו הקובץ
   * פגום. פייסבוק מתעלמת ממנו.
   */
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileNameFor(
        format,
        range.label
      )}"`,
    },
  });
}
