import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStatuses } from "@/lib/status-store";
import { resolveRange, type PeriodKey } from "@/lib/periods";
import { inData } from "@/lib/data-export";
import DataScreen, { type DataRow } from "@/components/DataScreen";

export const dynamic = "force-dynamic";

/**
 * דאטה - כל מי שהתעניין ולא נסגר.
 *
 * הרשימה על המסך מוגבלת ל-300 כדי שהדף ייטען מהר, אבל
 * המונה וההורדה סופרים את **הכל**. מספר שמוגבל בלי לומר
 * זאת הוא מספר שגוי.
 */
export default async function DataPage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string };
}) {
  const period = (searchParams?.period ?? "this_month") as PeriodKey;
  const range = resolveRange(period, searchParams?.from, searchParams?.to);

  const [settings, statusDefs] = await Promise.all([
    getSettings(),
    getStatuses(),
  ]);

  const leads = await db.lead
    .findMany({
      where: {
        createdAt: { gte: range.from, lt: range.to },
        origin: { not: "whatsapp" },
      },
      orderBy: { createdAt: "desc" },
      take: 20000,
      select: {
        id: true,
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

  const kept = leads.filter((l) => inData(l, settings.dataExcludeStatuses));

  const rows: DataRow[] = kept.slice(0, 300).map((lead) => {
    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, unknown>)
        : {};

    return {
      id: lead.id,
      name:
        `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.phone,
      phone: lead.phone,
      email: typeof extra.email === "string" ? extra.email : null,
      status: lead.status,
      campaign: lead.entries[0]?.campaign ?? null,
      at: lead.createdAt.toLocaleDateString("he-IL", {
        timeZone: "Asia/Jerusalem",
      }),
    };
  });

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          דאטה
          <span className="count">{range.label}</span>
        </h1>
      </div>

      <DataScreen
        rows={rows}
        total={kept.length}
        period={period}
        from={searchParams?.from ?? ""}
        to={searchParams?.to ?? ""}
        excluded={settings.dataExcludeStatuses}
        statuses={statusDefs.map((s) => s.name)}
        rangeLabel={range.label}
      />
    </div>
  );
}
