"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
}: {
  leads: LeadRow[];
  statuses: StatusDef[];
  subStatuses?: Record<string, string[]>;
  templates?: Array<{ name: string; displayName: string | null }>;
  rowFields?: RowFieldKey[];
}) {
  /**
   * הסינון נשמר בכתובת.
   *
   * ככה חזרה מכרטיס ליד מחזירה אותך בדיוק לאותו סינון,
   * ואפשר גם לשמור קישור למסך מסונן או לשלוח אותו לעצמך.
   */
  const params = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<string | null>(params.get("status"));
  const [campaign, setCampaign] = useState<string | null>(
    params.get("campaign")
  );
  const [period, setPeriod] = useState<"all" | "today" | "week" | "month">(
    (params.get("period") as "all" | "today" | "week" | "month") ?? "all"
  );

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [sheetFor, setSheetFor] = useState<LeadRow | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTemplate, setBulkTemplate] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(false);

  // כל שינוי בסינון נכתב לכתובת, בלי להוסיף רשומה להיסטוריה
  useEffect(() => {
    const next = new URLSearchParams();
    if (filter) next.set("status", filter);
    if (campaign) next.set("campaign", campaign);
    if (period !== "all") next.set("period", period);
    if (query.trim()) next.set("q", query.trim());

    const qs = next.toString();
    const target = qs ? `/?${qs}` : "/";
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (target !== currentUrl) {
      router.replace(target, { scroll: false });
    }
  }, [filter, campaign, period, query, router]);

  const anyFilter =
    filter !== null || campaign !== null || period !== "all" || query !== "";

  function clearAll() {
    setFilter(null);
    setCampaign(null);
    setPeriod("all");
    setQuery("");
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
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBulkMessage(
      res.ok
        ? `${data.scheduled} הודעות נכנסו לתור ויֵצאו בקצב מבוקר`
        : data.error || "הדיוור נכשל"
    );
    if (res.ok) setSelected(new Set());
    setBulkConfirm(false);
    setBulkBusy(false);
  }

  const visible = useMemo(() => {
    const q = query.trim();
    const since = periodStart(period);

    return leads.filter((lead) => {
      if (since !== null && new Date(lead.intakeAt).getTime() < since)
        return false;
      if (campaign && lead.campaign !== campaign) return false;
      if (filter && lead.status !== filter) return false;

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
      existing: rows.filter((l) => l.status === "לקוח קיים").length,
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
          data-active={filter === null}
          onClick={() => setFilter(null)}
        >
          הכל
        </button>

        {usedStatuses.map((st) => (
          <button
            key={st.name}
            className="chip"
            data-active={filter === st.name}
            onClick={() => setFilter(filter === st.name ? null : st.name)}
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
