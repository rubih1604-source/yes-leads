import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone, phoneMatches } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ייצוא לידים מסוננים לקובץ.
 *
 * העמודות מסודרות כך שאפשר להעלות את הקובץ ישר לפייסבוק
 * כקהל מותאם ולבנות ממנו Lookalike: טלפון בפורמט בינלאומי,
 * מייל, שם פרטי ושם משפחה - בדיוק מה שמטא מבקשת.
 *
 * שאר השדות נמצאים שם בשבילך, לניתוח.
 */

const CORE_COLUMNS = [
  { key: "first", label: "שם פרטי" },
  { key: "last", label: "שם משפחה" },
  { key: "phone_intl", label: "טלפון בינלאומי" },
  { key: "phone_local", label: "טלפון" },
  { key: "email", label: 'דוא"ל' },
  { key: "status", label: "סטטוס" },
  { key: "subStatus", label: "תת-סטטוס" },
  { key: "campaign", label: "קמפיין" },
  { key: "ad", label: "מודעה" },
  { key: "supplier", label: "ספק נוכחי" },
  { key: "source", label: "מקור" },
  { key: "intake", label: "תאריך כניסה" },
  { key: "address", label: "כתובת" },
  { key: "package", label: "חבילה" },
  { key: "price", label: "מחיר" },
];

function esc(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function extraOf(extra: unknown): Record<string, string> {
  return extra && typeof extra === "object" && !Array.isArray(extra)
    ? (extra as Record<string, string>)
    : {};
}

export async function GET(request: Request) {
  if (!isLoggedIn()) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);

  const statuses = (url.searchParams.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const campaign = url.searchParams.get("campaign");
  const period = url.searchParams.get("period");
  const query = (url.searchParams.get("q") ?? "").trim();

  /**
   * אותו חלון זמן בדיוק כמו במסך.
   *
   * חשוב שיהיה זהה: אם תסנן "אתמול" ותוריד קובץ, הוא חייב
   * להכיל בדיוק את מה שראית - לא יותר ולא פחות.
   */
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let since: Date | null = null;
  let until: Date | null = null;
  const now = new Date();

  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  if (period === "today") {
    since = startOfDay(now);
  } else if (period === "yesterday") {
    const todayStart = startOfDay(now);
    since = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    until = todayStart;
  } else if (period === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "last_month") {
    since = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    until = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "custom" && from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(start.getTime())) since = start;

    if (to) {
      const end = new Date(`${to}T23:59:59`);
      if (!Number.isNaN(end.getTime())) until = end;
    }
  }

  const leads = await db.lead.findMany({
    where: {
      origin: "leadmanager",
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(since || until
        ? {
            intakeAt: {
              ...(since ? { gte: since } : {}),
              ...(until ? { lt: until } : {}),
            },
          }
        : {}),
    },
    orderBy: { intakeAt: "desc" },
    take: 5000,
  });

  const rows = leads.filter((lead) => {
    const extra = extraOf(lead.extra);

    if (campaign) {
      const name = extra.fb_campaign || extra.campaign || "";
      if (name !== campaign) return false;
    }

    if (query) {
      const full = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
      if (!full.includes(query) && !phoneMatches(lead.phone, query)) {
        return false;
      }
    }

    return true;
  });

  const lines: string[] = [];
  lines.push(CORE_COLUMNS.map((c) => esc(c.label)).join(","));

  for (const lead of rows) {
    const extra = extraOf(lead.extra);

    const values: Record<string, string> = {
      first: lead.firstName ?? "",
      last: lead.lastName ?? "",
      phone_intl: lead.phone,
      phone_local: displayPhone(lead.phone),
      email: extra.email ?? "",
      status: lead.status,
      subStatus: lead.subStatus ?? "",
      campaign: extra.fb_campaign || extra.campaign || "",
      ad: extra.fb_ad ?? "",
      supplier: extra.supplier_question ?? "",
      source: lead.source ?? "",
      intake: lead.intakeAt.toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      address: extra.address ?? "",
      package: extra.package ?? "",
      price: extra.price ?? "",
    };

    lines.push(CORE_COLUMNS.map((c) => esc(values[c.key] ?? "")).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const label = statuses.length === 1 ? `-${statuses[0]}` : "";

  // BOM כדי שאקסל יציג עברית נכון
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads${label}-${stamp}.csv"`,
    },
  });
}

