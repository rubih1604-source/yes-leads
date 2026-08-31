"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { statusColor, type StatusDef } from "@/lib/statuses";
import { displayPhone, dialPhone } from "@/lib/phone";
import { DEFAULT_ROW_FIELDS, type RowFieldKey } from "@/lib/row-fields";
import StatusSheet from "./StatusSheet";

export type LeadRow = {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  subStatus: string | null;
  duplicateOf: string | null;
  intakeAt: string;
  campaign: string | null;
  supplier: string | null;
  source: string | null;
  package: string | null;
  price: string | null;
  email: string | null;
  address: string | null;
};

const SAVE_KEY = "leads:filters";
const SCROLL_KEY = "leads:scroll";

type SavedFilters = {
  status: string[];
  campaign: string | null;
  period: "all" | "today" | "week" | "month";
  q: string;
};

const EMPTY_FILTERS: SavedFilters = {
  status: [],
  campaign: null,
  period: "all",
  q: "",
};

/**
 * קורא את הסינון השמור.
 * הכתובת גוברת - אם הגעת מקישור מסונן, הוא מה שקובע.
 */
function readSaved(params: URLSearchParams): SavedFilters {
  const fromUrl: SavedFilters = {
    status: (params.get("status") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    campaign: params.get("campaign"),
    period:
      (params.get("period") as SavedFilters["period"]) ?? "all",
    q: params.get("q") ?? "",
  };

  const urlHasSomething =
    fromUrl.status.length > 0 ||
    fromUrl.campaign !== null ||
    fromUrl.period !== "all" ||
    fromUrl.q !== "";

  if (urlHasSomething) return fromUrl;

  if (typeof window === "undefined") return { ...EMPTY_FILTERS };

  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    if (!raw) return { ...EMPTY_FILTERS };

    const parsed = JSON.parse(raw) as Partial<SavedFilters>;
    return {
      status: Array.isArray(parsed.status)
        ? parsed.status.filter((x): x is string => typeof x === "string")
        : typeof parsed.status === "string" && parsed.status
        ? [parsed.status]
        : [],
      campaign: typeof parsed.campaign === "string" ? parsed.campaign : null,
      period: ["all", "today", "week", "month"].includes(
        parsed.period as string
      )
        ? (parsed.period as SavedFilters["period"])
        : "all",
      q: typeof parsed.q === "string" ? parsed.q : "",
    };
  } catch {
    return { ...EMPTY_FILTERS };
  }
}

/** מרגע מתי לספור, לפי התקופה שנבחרה */
function periodStart(period: string): number | null {
  const now = new Date();

  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  if (period === "week") {
    return now.getTime() - 7 * 24 * 60 * 60 * 1000;
  }

  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }

  return null;
}

/** חותמת הכניסה המדויקת - תאריך ושעה */
function intakeStamp(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadList({
  leads,
  statuses,
  subStatuses = {},
  templates = [],
  rowFields = DEFAULT_ROW_FIELDS,
  saleCampaigns = [],
}: {
  leads: LeadRow[];
  statuses: StatusDef[];
  subStatuses?: Record<string, string[]>;
  templates?: Array<{ name: string; displayName: string | null }>;
  rowFields?: RowFieldKey[];
  saleCampaigns?: Array<{ id: string; name: string; pricePerLead: number }>;
}) {
  /**
   * הסינון נשמר בכתובת.
   *
   * ככה חזרה מכרטיס ליד מחזירה אותך בדיוק לאותו סינון,
   * ואפשר גם לשמור קישור למסך מסונן או לשלוח אותו לעצמך.
   */
  const params = useSearchParams();

  /**
   * קודם קוראים מהכתובת. אם היא ריקה - מהזיכרון של הדפדפן.
   *
   * שני המקומות נחוצים: הכתובת מאפשרת לשמור סימנייה ולשתף,
   * והזיכרון שורד גם חזרה שמנקה את הכתובת.
   */
  const initial = readSaved(params);

  const [query, setQuery] = useState(initial.q);
  const [filter, setFilter] = useState<string[]>(initial.status);
  const [campaign, setCampaign] = useState<string | null>(initial.campaign);
  const [period, setPeriod] = useState<"all" | "today" | "week" | "month">(
    initial.period
  );

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [sheetFor, setSheetFor] = useState<LeadRow | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTemplate, setBulkTemplate] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [sendNow, setSendNow] = useState(true);
  const [saleCampaign, setSaleCampaign] = useState("");
  const [saleConfirm, setSaleConfirm] = useState(false);

  /**
   * שומרים את הסינון בשני מקומות, בלי לערב את הראוטר של Next.
   *
   * history.replaceState משנה רק את הכתובת בשורת הדפדפן -
   * בלי ניווט, בלי טעינה מחדש, ובלי לאפס את המסך.
   * זו הייתה הבעיה קודם: router.replace גרם לניווט שאיפס הכל.
   */
  useEffect(() => {
    const state = {
      status: filter,
      campaign,
      period,
      q: query.trim(),
    };

    try {
      sessionStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      // גלישה פרטית חוסמת לפעמים - הכתובת עדיין תעבוד
    }

    const next = new URLSearchParams();
    if (state.status.length) next.set("status", state.status.join(","));
    if (state.campaign) next.set("campaign", state.campaign);
    if (state.period !== "all") next.set("period", state.period);
    if (state.q) next.set("q", state.q);

    const qs = next.toString();
    const target = qs ? `?${qs}` : window.location.pathname;

    if (`${window.location.search}` !== (qs ? `?${qs}` : "")) {
      window.history.replaceState(null, "", target);
    }
  }, [filter, campaign, period, query]);

  /** שומר את מיקום הגלילה, כדי לחזור בדיוק לאותו מקום ברשימה */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function onScroll() {
      if (timer) return;
      timer = setTimeout(() => {
        try {
          sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
        } catch {
          // לא קריטי
        }
        timer = null;
      }, 250);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, []);

  /** מחזיר את הגלילה למקום שהיית בו, אחרי שהרשימה כבר מצוירת */
  useEffect(() => {
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(SCROLL_KEY)) || 0;
    } catch {
      return;
    }

    if (saved <= 0) return;

    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: saved, behavior: "auto" });
    });

    return () => cancelAnimationFrame(id);
    // רץ פעם אחת בטעינה בלבד
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyFilter =
    filter.length > 0 || campaign !== null || period !== "all" || query !== "";

  function clearAll() {
    setFilter([]);
    setCampaign(null);
    setPeriod("all");
    setQuery("");
    try {
      sessionStorage.removeItem(SAVE_KEY);
      sessionStorage.removeItem(SCROLL_KEY);
    } catch {
      // לא קריטי
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkSend() {
    setBulkBusy(true);
    setBulkMessage("");
    const res = await fetch("/api/leads/bulk-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadIds: Array.from(selected),
        templateName: bulkTemplate,
        sendNow,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const starts = data.startsAt ? new Date(data.startsAt) : new Date();
      const later = starts.getTime() > Date.now() + 5 * 60000;
      const clock = starts.toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      setBulkMessage(
        `${data.scheduled} הודעות בתור · ` +
          (later
            ? `יתחילו לצאת ב-${clock} (מחוץ לשעות הפעילות)`
            : "יוצאות עכשיו, אחת כל 8 שניות") +
          ` · מעקב במסך "מה המנוע עשה"`
      );
    } else {
      setBulkMessage(data.error || "הדיוור נכשל");
    }
    if (res.ok) setSelected(new Set());
    setBulkConfirm(false);
    setBulkBusy(false);
  }

  async function moveToSale() {
    setBulkBusy(true);
    setBulkMessage("");
    const res = await fetch("/api/leads/bulk-move-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadIds: Array.from(selected),
        campaignId: saleCampaign,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBulkMessage(
      res.ok
        ? `${data.moved} לידים הועברו ל"${data.campaign}"` +
            (data.alreadyThere ? ` · ${data.alreadyThere} כבר היו שם` : "") +
            ` · ₪${Math.round(data.revenue).toLocaleString("he-IL")}`
        : data.error || "ההעברה נכשלה"
    );
    if (res.ok) setSelected(new Set());
    setSaleConfirm(false);
    setBulkBusy(false);
  }

  const visible = useMemo(() => {
    const q = query.trim();
    const since = periodStart(period);

    return leads.filter((lead) => {
      if (since !== null && new Date(lead.intakeAt).getTime() < since)
        return false;
      if (campaign && lead.campaign !== campaign) return false;
      if (filter.length > 0 && !filter.includes(lead.status)) return false;

      if (!q) return true;

      const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
      const digits = q.replace(/\D/g, "");
      return (
        name.includes(q) ||
        (digits.length >= 3 && lead.phone.includes(digits))
      );
    });
  }, [leads, query, filter, campaign, period]);

  /** הקמפיינים שיש בפועל, לפי כמות לידים */
  const campaigns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.campaign) continue;
      counts.set(lead.campaign, (counts.get(lead.campaign) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  /** סיכום מהיר לקמפיין הנבחר - האם הוא שווה את הכסף */
  const campaignSummary = useMemo(() => {
    if (!campaign) return null;
    const rows = leads.filter((l) => l.campaign === campaign);
    const wonNames = new Set(
      statuses.filter((s) => s.won).map((s) => s.name)
    );
    return {
      total: rows.length,
      won: rows.filter((l) => wonNames.has(l.status)).length,
      declined: rows.filter((l) => l.status.startsWith("לא מעוניין")).length,
      existing: rows.filter((l) => l.existingCustomer).length,
    };
  }, [leads, campaign, statuses]);

  /**
   * מציגים כל סטטוס שיש בו לידים - כולל "לקוח קיים".
   * הסדר לפי הסדר שהגדרת בהגדרות, ולידו כמה לידים יש בו,
   * כדי שתדע לאן ללחוץ בלי לנחש.
   */
  const usedStatuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
    }
    return statuses
      .map((s) => ({ name: s.name, count: counts.get(s.name) ?? 0 }))
      .filter((s) => s.count > 0);
  }, [leads, statuses]);

  /** מה מוצג בשורה הראשית, לפי מה שבחרת בהגדרות */
  function inlineFor(lead: LeadRow) {
    const out: Array<{ key: string; text: string }> = [];
    for (const key of rowFields) {
      if (key === "status") out.push({ key, text: lead.status });
      else if (key === "phone")
        out.push({ key, text: displayPhone(lead.phone) });
      else if (key === "intakeAt")
        out.push({ key, text: intakeStamp(lead.intakeAt) });
      else if (key === "price" && lead.price)
        out.push({ key, text: `₪${lead.price}` });
    }
    return out;
  }

  /** מה מוצג כתגית מתחת לשורה */
  function tagsFor(lead: LeadRow) {
    const out: Array<{ key: string; text: string }> = [];
    for (const key of rowFields) {
      if (key === "subStatus" && lead.subStatus)
        out.push({ key, text: lead.subStatus });
      else if (key === "supplier" && lead.supplier)
        out.push({ key, text: `ספק: ${lead.supplier}` });
      else if (key === "campaign" && lead.campaign)
        out.push({ key, text: lead.campaign });
      else if (key === "source" && lead.source)
        out.push({ key, text: lead.source });
      else if (key === "package" && lead.package)
        out.push({ key, text: lead.package });
      else if (key === "email" && lead.email)
        out.push({ key, text: lead.email });
      else if (key === "address" && lead.address)
        out.push({ key, text: lead.address });
    }
    return out;
  }

  return (
    <>
      <div className="topbar">
        <h1>
          לידים
          <span className="count">
            {visible.length === leads.length
              ? `${leads.length}`
              : `${visible.length} מתוך ${leads.length}`}
          </span>
        </h1>
        <input
          className="search"
          placeholder="חיפוש לפי שם או טלפון"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {anyFilter && (
        <div style={{ margin: "10px 16px 0" }}>
          <button
            className="btn"
            style={{ height: 40, fontSize: 14 }}
            onClick={clearAll}
          >
            נקה את כל הסינון
          </button>
        </div>
      )}

      <div className="filters periods">
        {(
          [
            { key: "all", label: "הכל" },
            { key: "today", label: "היום" },
            { key: "week", label: "7 ימים" },
            { key: "month", label: "החודש" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            className="chip period-chip"
            data-active={period === opt.key}
            onClick={() => setPeriod(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filters">
        {campaigns.length > 0 && (
          <button
            className="chip campaign-chip"
            data-active={campaign !== null}
            onClick={() => setCampaignOpen(true)}
          >
            <span>{campaign ? `קמפיין: ${campaign}` : "כל הקמפיינים"}</span>
            <span className="chev" aria-hidden="true">
              ⌄
            </span>
          </button>
        )}

        <button
          className="chip"
          data-active={filter.length === 0}
          onClick={() => setFilter([])}
        >
          הכל
        </button>

        {usedStatuses.map((st) => (
          <button
            key={st.name}
            className="chip"
            data-active={filter.includes(st.name)}
            onClick={() =>
              setFilter(
                filter.includes(st.name)
                  ? filter.filter((f) => f !== st.name)
                  : [...filter, st.name]
              )
            }
          >
            {st.name}
            <span style={{ opacity: 0.55, marginInlineStart: 5 }}>
              {st.count}
            </span>
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 17 }}>{selected.size} נבחרו</strong>
            <button
              className="btn"
              style={{
                marginInlineStart: "auto",
                height: 34,
                flex: "0 0 auto",
                fontSize: 13,
              }}
              onClick={() => setSelected(new Set())}
            >
              נקה
            </button>
          </div>

          <select
            value={bulkTemplate}
            onChange={(e) => setBulkTemplate(e.target.value)}
          >
            <option value="">— בחר תבנית לשליחה —</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.displayName || t.name}
              </option>
            ))}
          </select>

          <button
            className="status-option"
            data-current={sendNow}
            onClick={() => setSendNow(!sendNow)}
            style={{ marginBottom: 8 }}
          >
            <span
              className="dot"
              style={{ background: sendNow ? "#12805c" : "#dbe3ea" }}
            />
            <span style={{ textAlign: "start", fontSize: 14 }}>
              שלח עכשיו, גם מחוץ לשעות הפעילות
              <span
                style={{ display: "block", fontSize: 12, opacity: 0.75 }}
              >
                {sendNow
                  ? "ההודעות יצאו מיד, אחת כל 8 שניות"
                  : "כבוי: ידחה לשעות הפעילות"}
              </span>
            </span>
          </button>

          {bulkConfirm ? (
            <div className="actions">
              <button className="btn" onClick={() => setBulkConfirm(false)}>
                ביטול
              </button>
              <button
                className="btn"
                style={{ background: "#b54708", color: "#fff", border: "none" }}
                onClick={bulkSend}
                disabled={bulkBusy}
              >
                {bulkBusy ? "שולח..." : `כן, שלח ל-${selected.size}`}
              </button>
            </div>
          ) : (
            <button
              className="btn"
              onClick={() => setBulkConfirm(true)}
              disabled={!bulkTemplate}
            >
              שלח דיוור ל-{selected.size} לידים
            </button>
          )}

          {saleCampaigns.length > 0 && (
            <>
              <div
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.25)",
                  margin: "12px 0 8px",
                  paddingTop: 10,
                  fontSize: 13,
                  opacity: 0.9,
                }}
              >
                או להעביר אותם למכירת לידים
              </div>

              <select
                value={saleCampaign}
                onChange={(e) => setSaleCampaign(e.target.value)}
              >
                <option value="">— בחר קמפיין מכירה —</option>
                {saleCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · ₪{c.pricePerLead}
                  </option>
                ))}
              </select>

              {saleConfirm ? (
                <div className="actions">
                  <button
                    className="btn"
                    onClick={() => setSaleConfirm(false)}
                  >
                    ביטול
                  </button>
                  <button
                    className="btn"
                    style={{
                      background: "#12805c",
                      color: "#fff",
                      border: "none",
                    }}
                    onClick={moveToSale}
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? "מעביר..." : `כן, העבר ${selected.size}`}
                  </button>
                </div>
              ) : (
                <button
                  className="btn"
                  onClick={() => setSaleConfirm(true)}
                  disabled={!saleCampaign}
                >
                  העבר {selected.size} למכירת לידים
                </button>
              )}
            </>
          )}

          {bulkMessage && (
            <div style={{ marginTop: 8, fontSize: 13.5 }}>{bulkMessage}</div>
          )}
        </div>
      )}

      {visible.length > 0 && templates.length > 0 && (
        <div style={{ margin: "0 16px 8px" }}>
          <button
            className="btn"
            style={{ height: 40, fontSize: 14 }}
            onClick={() =>
              setSelected(
                selected.size === visible.length
                  ? new Set()
                  : new Set(visible.map((l) => l.id))
              )
            }
          >
            {selected.size === visible.length
              ? "בטל בחירת הכל"
              : `בחר את כל ${visible.length} המוצגים`}
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                ייצוא {visible.length} הלידים המסוננים
              </div>
              <div style={{ fontSize: 12.5, color: "#98a2b3", marginTop: 2 }}>
                {filter.length > 0
                  ? filter.join(" · ")
                  : "כל הסטטוסים"}
                {campaign ? ` · ${campaign}` : ""}
              </div>
            </div>

            <a
              className="btn"
              href={`/api/leads/export?${new URLSearchParams({
                ...(filter.length ? { status: filter.join(",") } : {}),
                ...(campaign ? { campaign } : {}),
                ...(period !== "all" ? { period } : {}),
                ...(query.trim() ? { q: query.trim() } : {}),
              }).toString()}`}
              style={{
                flex: "0 0 auto",
                height: 44,
                textDecoration: "none",
                paddingInline: 18,
              }}
            >
              הורד קובץ
            </a>
          </div>

          <div style={{ fontSize: 12, color: "#98a2b3", marginTop: 10 }}>
            הקובץ מכיל שם, טלפון בפורמט בינלאומי, מייל וכל שאר הפרטים —
            מוכן להעלאה לפייסבוק כקהל מותאם ל-Lookalike.
          </div>
        </div>
      )}

      {campaignSummary && (
        <div className="campaign-summary">
          <div className="campaign-summary-name">{campaign}</div>
          <div className="campaign-summary-nums">
            <span>
              <strong>{campaignSummary.total}</strong> לידים
            </span>
            <span>
              <strong>{campaignSummary.won}</strong> נסגרו
            </span>
            <span>
              <strong>{campaignSummary.declined}</strong> לא מעוניין
            </span>
            <span>
              <strong>{campaignSummary.existing}</strong> לקוח קיים
            </span>
          </div>
          <button className="btn" onClick={() => setCampaign(null)}>
            נקה סינון
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          <strong>אין לידים להצגה</strong>
          {anyFilter
            ? "נסה לנקות את הסינון."
            : "לידים חדשים יופיעו כאן ברגע שייכנסו."}
        </div>
      ) : (
        <div className="list">
          {visible.map((lead) => {
            const name =
              `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
              displayPhone(lead.phone);

            return (
              <div className="lead" key={lead.id}>
                <span
                  className="bar"
                  style={{ background: statusColor(lead.status, statuses) }}
                />

                {templates.length > 0 && (
                  <button
                    className="lead-check"
                    data-on={selected.has(lead.id)}
                    aria-label="בחר ליד"
                    onClick={() => toggleOne(lead.id)}
                  >
                    {selected.has(lead.id) ? "☑" : "☐"}
                  </button>
                )}

                <Link href={`/leads/${lead.id}`} className="body">
                  <div className="name">
                    {name}
                    {lead.existingCustomer && (
                      <span className="existing-tag">לקוח קיים</span>
                    )}
                    {lead.duplicateOf && <span className="dup-tag">כפול</span>}
                  </div>

                  {inlineFor(lead).length > 0 && (
                    <div className="meta">
                      {inlineFor(lead).map((part, i) => (
                        <span key={part.key} style={{ display: "contents" }}>
                          {i > 0 && <span>·</span>}
                          <span
                            className={
                              part.key === "status" ? "status-text" : ""
                            }
                            style={
                              part.key === "status"
                                ? { color: statusColor(lead.status, statuses) }
                                : undefined
                            }
                          >
                            {part.text}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {tagsFor(lead).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {tagsFor(lead).map((tag) => (
                        <div
                          key={tag.key}
                          className="supplier-tag"
                          style={
                            tag.key === "subStatus"
                              ? { borderColor: "#1b4d8f", color: "#1b4d8f" }
                              : undefined
                          }
                        >
                          {tag.text}
                        </div>
                      ))}
                    </div>
                  )}
                </Link>

                <div className="row-actions">
                  <a
                    className="row-btn call"
                    href={`tel:${dialPhone(lead.phone)}`}
                    aria-label="התקשר"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ✆
                  </a>
                  <button
                    className="row-btn"
                    aria-label="שנה סטטוס"
                    onClick={() => setSheetFor(lead)}
                  >
                    ⇄
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {campaignOpen && (
        <div
          className="sheet-backdrop"
          onClick={(e) => e.target === e.currentTarget && setCampaignOpen(false)}
        >
          <div className="sheet">
            <h3>סינון לפי קמפיין</h3>

            <button
              className="status-option"
              data-current={campaign === null}
              onClick={() => {
                setCampaign(null);
                setCampaignOpen(false);
              }}
            >
              <span>כל הקמפיינים</span>
              <span style={{ marginInlineStart: "auto", color: "#98a2b3" }}>
                {leads.length}
              </span>
            </button>

            {campaigns.map((c) => (
              <button
                key={c.name}
                className="status-option"
                data-current={campaign === c.name}
                onClick={() => {
                  setCampaign(c.name);
                  setCampaignOpen(false);
                }}
              >
                <span style={{ textAlign: "start" }}>{c.name}</span>
                <span style={{ marginInlineStart: "auto", color: "#98a2b3" }}>
                  {c.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sheetFor && (
        <StatusSheet
          leadId={sheetFor.id}
          current={sheetFor.status}
          currentSub={sheetFor.subStatus}
          statuses={statuses}
          subStatuses={subStatuses}
          onClose={() => setSheetFor(null)}
        />
      )}
    </>
  );
}
