import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { normalizeName } from "@/lib/sales-campaigns";
import { isExistingCustomer } from "@/lib/existing-customer";
import { resolveRange, type PeriodKey } from "@/lib/periods";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  ייצוא לידי מכירה להתחשבנות
 * ============================================================
 *
 *  שורה אחת לכל **כניסה**, לא לכל ליד.
 *
 *  זה מה שההתחשבנות צריכה: אם אותו אדם נכנס פעמיים מאותו
 *  קמפיין מכירה, אלה שתי הגעות ששולמת עליהן. לידים שסומנו
 *  כלא-לחיוב (הסימון ⊘) מופיעים גם הם, עם עמודה משלהם, כדי
 *  שתראה גם מה הורד ולא רק את השורה התחתונה.
 *
 *  פרמטרים:
 *    period   - today / yesterday / last_7 / this_month /
 *               last_month / last_3 / this_year / all / custom
 *    from,to  - בפורמט YYYY-MM-DD, כשבוחרים custom
 *    campaign - שם קמפיין, לסינון לקמפיין אחד
 *    buyer    - שם קונה, להתחשבנות מול קונה מסוים
 *    billable - 1 כדי לקבל רק את מה שבאמת לחיוב
 */

const COLUMNS = [
  { key: "date", label: "תאריך" },
  { key: "time", label: "שעה" },
  { key: "name", label: "שם" },
  { key: "phone", label: "טלפון" },
  { key: "campaign", label: "קמפיין" },
  { key: "buyer", label: "קונה" },
  { key: "price", label: "מחיר לליד" },
  { key: "billable", label: "לחיוב" },
  { key: "existing", label: "לקוח קיים" },
];

function esc(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function dateParts(at: Date): { date: string; time: string } {
  const date = at.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = at.toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time };
}

export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);

  const VALID: PeriodKey[] = [
    "today",
    "yesterday",
    "last_7",
    "this_month",
    "last_month",
    "last_3",
    "this_year",
    "all",
    "custom",
  ];

  const asked = url.searchParams.get("period") as PeriodKey | null;
  const period: PeriodKey =
    asked && VALID.includes(asked) ? asked : "this_month";

  const range = resolveRange(
    period,
    url.searchParams.get("from"),
    url.searchParams.get("to")
  );

  const campaignFilter = url.searchParams.get("campaign");
  const buyerFilter = url.searchParams.get("buyer");
  const billableOnly = url.searchParams.get("billable") === "1";

  /**
   * שמות הקונים לפי קמפיין. ההתחשבנות היא מול קונה,
   * והקמפיין הוא רק הדרך להגיע אליו.
   */
  const campaigns = await db.salesCampaign
    .findMany({
      select: {
        name: true,
        buyer: true,
        buyerRef: { select: { name: true } },
      },
    })
    .catch(() => []);

  const buyerByCampaign = new Map<string, string>(
    campaigns.map((c) => [
      normalizeName(c.name),
      c.buyerRef?.name ?? c.buyer ?? "",
    ])
  );

  const entries = await db.leadEntry.findMany({
    where: {
      isSale: true,
      at: { gte: range.from, lt: range.to },
      ...(campaignFilter ? { campaign: campaignFilter } : {}),
      ...(billableOnly ? { billable: true } : {}),
    },
    orderBy: { at: "asc" },
    take: 10000,
    include: {
      lead: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          extra: true,
        },
      },
    },
  });

  const lines: string[] = [COLUMNS.map((c) => c.label).join(",")];

  let total = 0;
  let billableTotal = 0;

  for (const entry of entries) {
    const key = entry.campaign ? normalizeName(entry.campaign) : "";
    const buyer = buyerByCampaign.get(key) ?? "";

    // סינון לפי קונה נעשה כאן, כי הוא לא שדה על הכניסה
    if (buyerFilter && buyer !== buyerFilter) continue;

    const { date, time } = dateParts(entry.at);
    const price = Number(entry.price ?? 0);
    const billable = entry.billable !== false;

    total += price;
    if (billable) billableTotal += price;

    const values: Record<string, string> = {
      date,
      time,
      name:
        `${entry.lead?.firstName ?? ""} ${entry.lead?.lastName ?? ""}`.trim() ||
        "",
      phone: entry.lead ? displayPhone(entry.lead.phone) : "",
      campaign: entry.campaign ?? "",
      buyer,
      price: String(price),
      billable: billable ? "כן" : "לא",
      existing: isExistingCustomer(entry.lead?.extra, entry.lead?.status)
        ? "כן"
        : "לא",
    };

    lines.push(COLUMNS.map((c) => esc(values[c.key] ?? "")).join(","));
  }

  /**
   * שתי שורות סיכום בסוף, אחרי שורה ריקה.
   *
   * השורה הריקה מפרידה אותן מהנתונים, כך שמחולל התחשבנות
   * שקורא את הקובץ לא יבלבל אותן עם ליד.
   */
  const rows = lines.length - 1;
  lines.push("");
  lines.push(esc(`סה"כ כניסות: ${rows}`));
  lines.push(esc(`סה"כ לחיוב: ${billableTotal}`));
  if (total !== billableTotal) {
    lines.push(esc(`סה"כ כולל מה שלא לחיוב: ${total}`));
  }
  lines.push(esc(`טווח: ${range.label}`));

  const stamp = new Date().toISOString().slice(0, 10);
  const label = buyerFilter ? `-${buyerFilter}` : "";

  // BOM כדי שאקסל יציג עברית נכון
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-sales${label}-${stamp}.csv"`,
    },
  });
}
