import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone, phoneMatches } from "@/lib/phone";
import { MY_LEADS_WHERE } from "@/lib/channel";
import { resolveRange, type PeriodKey } from "@/lib/periods";

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
   * הטווח מחושב בשעון ישראל, לא בשעון השרת.
   *
   * השרת רץ ב-UTC, ולכן "היום" שלו מתחיל ב-3 לפנות בוקר
   * שלך. בלי זה הייצוא והרשימה היו מראים מספרים שונים
   * בשעות הקטנות.
   */
  const PERIOD_MAP: Record<string, PeriodKey> = {
    today: "today",
    yesterday: "yesterday",
    week: "last_7",
    month: "this_month",
    last_month: "last_month",
    custom: "custom",
    all: "all",
  };

  const range = period
    ? resolveRange(
        PERIOD_MAP[period] ?? "all",
        url.searchParams.get("from"),
        url.searchParams.get("to")
      )
    : null;

  const leads = await db.lead.findMany({
    /**
     * אותה הגדרה בדיוק כמו ברשימת הלידים.
     *
     * הייצוא הולך לקהלים דומים בפייסבוק, ולכן חשוב במיוחד
     * שלא ייכנסו אליו לא אנשי וואטסאפ ולא הלידים של אלעד -
     * הם יעוותו לך את הקהל.
     */
    where: {
      ...MY_LEADS_WHERE,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(range && period !== "all"
        ? { intakeAt: { gte: range.from, lt: range.to } }
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

