"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { statusColor, STATUS_NAMES } from "@/lib/statuses";
import { displayPhone } from "@/lib/phone";
import StatusSheet from "./StatusSheet";

export type LeadRow = {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  intakeAt: string;
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
  openTasks = 0,
  waitingReply = 0,
}: {
  leads: LeadRow[];
  openTasks?: number;
  waitingReply?: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<LeadRow | null>(null);

  const visible = useMemo(() => {
    const q = query.trim();
    return leads.filter((lead) => {
      if (filter && lead.status !== filter) return false;
      if (!q) return true;
      const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
      const digits = q.replace(/\D/g, "");
      return (
        name.includes(q) ||
        (digits.length >= 3 && lead.phone.includes(digits))
      );
    });
  }, [leads, query, filter]);

  const usedStatuses = useMemo(() => {
    const set = new Set(leads.map((l) => l.status));
    return STATUS_NAMES.filter((s) => set.has(s));
  }, [leads]);

  return (
    <>
      <div className="topbar">
        <h1>
          לידים
          <span className="count">{visible.length} מתוך {leads.length}</span>
          <span style={{ float: "left", display: "flex", gap: 12 }}>
            <Link href="/today" className="count" style={{ color: "#fff", opacity: 0.85 }}>
              היום{openTasks > 0 ? ` (${openTasks})` : ""}
            </Link>
            <Link href="/chats" className="count" style={{ color: "#fff", opacity: 0.85 }}>
              שיחות{waitingReply > 0 ? ` (${waitingReply})` : ""}
            </Link>
            <Link href="/alerts" className="count" style={{ color: "#fff", opacity: 0.85 }}>
              התראות
            </Link>
            <Link href="/rules" className="count" style={{ color: "#fff", opacity: 0.85 }}>
              חוקים
            </Link>
            <Link href="/knowledge" className="count" style={{ color: "#fff", opacity: 0.85 }}>
              ידע
            </Link>
            <Link href="/settings" className="count" style={{ color: "#fff", opacity: 0.85 }}>
              הגדרות
            </Link>
            <Link href="/templates" className="count" style={{ color: "#fff", opacity: 0.85 }}>
              תבניות
            </Link>
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
                  style={{ background: statusColor(lead.status) }}
                />
                <Link href={`/leads/${lead.id}`} className="body">
                  <div className="name">{name}</div>
                  <div className="meta">
                    <span
                      className="status-text"
                      style={{ color: statusColor(lead.status) }}
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

      {sheetFor && (
        <StatusSheet
          leadId={sheetFor.id}
          current={sheetFor.status}
          onClose={() => setSheetFor(null)}
        />
      )}
    </>
  );
}
