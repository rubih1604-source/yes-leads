"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { statusColor, type StatusDef } from "@/lib/statuses";
import { displayPhone } from "@/lib/phone";
import StatusSheet from "./StatusSheet";

export type LeadRow = {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  intakeAt: string;
  campaign: string | null;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}

export default function LeadList({
  leads,
  statuses,
}: {
  leads: LeadRow[];
  statuses: StatusDef[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<LeadRow | null>(null);
  const [campaign, setCampaign] = useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim();
    return leads.filter((lead) => {
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
  }, [leads, query, filter, campaign]);

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

  const usedStatuses = useMemo(() => {
    const set = new Set(leads.map((l) => l.status));
    return statuses.map((s) => s.name).filter((s) => set.has(s));
  }, [leads, statuses]);

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

      <div className="filters">
        {campaigns.length > 0 && (
          <button
            className="chip campaign-chip"
            data-active={campaign !== null}
            onClick={() => setCampaignOpen(true)}
          >
            {campaign ? `קמפיין: ${campaign}` : "כל הקמפיינים"}
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
        {usedStatuses.map((s) => (
          <button
            key={s}
            className="chip"
            data-active={filter === s}
            onClick={() => setFilter(filter === s ? null : s)}
          >
            {s}
          </button>
        ))}
      </div>

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
          {leads.length === 0 ? (
            <>
              <strong>עוד לא נכנסו לידים</strong>
              חבר את ליד מנגר לכתובת ה־webhook, או שנה סטטוס לליד אמיתי
              כדי לראות אותו מופיע כאן.
            </>
          ) : (
            <>
              <strong>אין תוצאות</strong>
              נסה חיפוש אחר או בטל את הסינון.
            </>
          )}
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
                <Link href={`/leads/${lead.id}`} className="body">
                  <div className="name">{name}</div>
                  <div className="meta">
                    <span
                      className="status-text"
                      style={{ color: statusColor(lead.status, statuses) }}
                    >
                      {lead.status}
                    </span>
                    <span>·</span>
                    <span>{timeAgo(lead.intakeAt)}</span>
                  </div>
                </Link>
                <button
                  className="go"
                  aria-label="שנה סטטוס"
                  onClick={() => setSheetFor(lead)}
                >
                  ⇄
                </button>
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
          statuses={statuses}
          onClose={() => setSheetFor(null)}
        />
      )}
    </>
  );
}
