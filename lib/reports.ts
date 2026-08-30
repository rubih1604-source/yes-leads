/**
 * ============================================================
 *  דוח לידים
 * ============================================================
 *
 *  פילוח של הלידים בטווח שנבחר: לפי סטטוס, לפי קמפיין,
 *  ולפי ספק נוכחי - כל אחד עם מספר ואחוז.
 */

import { db } from "./db";
import { getStatuses } from "./status-store";
import { isExistingCustomer } from "./existing-customer";
import type { Range } from "./periods";

export type Slice = {
  name: string;
  color: string;
  count: number;
  percent: number;
};

export type ReportData = {
  total: number;
  won: number;
  winPercent: number;
  existingCustomers: number;
  existingPercent: number;
  byStatus: Slice[];
  byCampaign: Slice[];
  bySupplier: Slice[];
  label: string;
};

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

function fieldOf(extra: unknown, keys: string[]): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const record = extra as Record<string, string>;
  for (const key of keys) {
    if (record[key]?.trim()) return record[key].trim();
  }
  return null;
}

export async function getReport(range: Range): Promise<ReportData> {
  const statuses = await getStatuses();
  const colorByStatus = new Map(statuses.map((s) => [s.name, s.color]));
  const wonNames = new Set(statuses.filter((s) => s.won).map((s) => s.name));

  const leads = await db.lead.findMany({
    where: {
      origin: "leadmanager",
      intakeAt: { gte: range.from, lt: range.to },
    },
    select: { status: true, extra: true },
  });

  const total = leads.length;

  const statusCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  const supplierCounts = new Map<string, number>();
  let won = 0;
  let existing = 0;

  for (const lead of leads) {
    statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);
    if (wonNames.has(lead.status)) won++;
    if (isExistingCustomer(lead.extra, lead.status)) existing++;

    const campaign = fieldOf(lead.extra, ["fb_campaign", "campaign"]);
    const key = campaign ?? "ללא קמפיין";
    campaignCounts.set(key, (campaignCounts.get(key) ?? 0) + 1);

    const supplier = fieldOf(lead.extra, ["supplier_question"]);
    const sKey = supplier ?? "לא צוין";
    supplierCounts.set(sKey, (supplierCounts.get(sKey) ?? 0) + 1);
  }

  // סדר הסטטוסים לפי הסדר שהגדרת, לא לפי כמות
  const byStatus: Slice[] = statuses
    .map((s) => ({
      name: s.name,
      color: s.color,
      count: statusCounts.get(s.name) ?? 0,
      percent: percent(statusCounts.get(s.name) ?? 0, total),
    }))
    .filter((s) => s.count > 0);

  const toSlices = (map: Map<string, number>, color: string): Slice[] =>
    Array.from(map.entries())
      .map(([name, count]) => ({
        name,
        color,
        count,
        percent: percent(count, total),
      }))
      .sort((a, b) => b.count - a.count);

  return {
    total,
    won,
    winPercent: percent(won, total),
    existingCustomers: existing,
    existingPercent: percent(existing, total),
    byStatus,
    byCampaign: toSlices(campaignCounts, "#1b4d8f"),
    bySupplier: toSlices(supplierCounts, "#0891b2"),
    label: range.label,
  };
}

/** בונה קובץ CSV שאפשר לפתוח באקסל */
export function reportToCsv(report: ReportData): string {
  const lines: string[] = [];
  const esc = (v: string | number) =>
    typeof v === "string" && /[",\n]/.test(v)
      ? `"${v.replace(/"/g, '""')}"`
      : String(v);

  lines.push(`דוח לידים,${esc(report.label)}`);
  lines.push("");
  lines.push(`סה"כ לידים,${report.total}`);
  lines.push(`נסגרו,${report.won}`);
  lines.push(`אחוז סגירה,${report.winPercent}%`);
  lines.push(`לקוחות קיימים,${report.existingCustomers}`);
  lines.push(`אחוז לקוחות קיימים,${report.existingPercent}%`);
  lines.push("");

  const section = (title: string, slices: Slice[]) => {
    lines.push(title);
    lines.push("שם,כמות,אחוז");
    for (const s of slices) {
      lines.push(`${esc(s.name)},${s.count},${s.percent}%`);
    }
    lines.push("");
  };

  section("לפי סטטוס", report.byStatus);
  section("לפי קמפיין", report.byCampaign);
  section("לפי ספק נוכחי", report.bySupplier);

  // BOM כדי שאקסל יציג עברית נכון
  return "\uFEFF" + lines.join("\r\n");
}
