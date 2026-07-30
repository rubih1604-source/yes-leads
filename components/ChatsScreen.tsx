"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { statusColor } from "@/lib/statuses";
import { displayPhone } from "@/lib/phone";

export type ChatRow = {
  leadId: string;
  name: string;
  phone: string;
  status: string;
  lastText: string | null;
  lastAt: string;
  lastDirection: "in" | "out";
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "עכשיו";
  if (mins < 60) return `${mins} דק'`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return d.toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (hours < 48) return "אתמול";

  return d.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function ChatsScreen({ chats }: { chats: ChatRow[] }) {
  const [query, setQuery] = useState("");
  const [waitingOnly, setWaitingOnly] = useState(false);

  const waitingCount = useMemo(
    () => chats.filter((c) => c.lastDirection === "in").length,
    [chats]
  );

  const visible = useMemo(() => {
    const q = query.trim();
    return chats.filter((c) => {
      if (waitingOnly && c.lastDirection !== "in") return false;
      if (!q) return true;
      const digits = q.replace(/\D/g, "");
      return (
        c.name.includes(q) ||
        (digits.length >= 3 && c.phone.includes(digits)) ||
        (c.lastText ?? "").includes(q)
      );
    });
  }, [chats, query, waitingOnly]);

  return (
    <>
      <div className="topbar">
        <h1>
          שיחות
          <span className="count">{visible.length}</span>
        </h1>
        <input
          className="search"
          placeholder="חיפוש בשיחות"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="filters">
        <button
          className="chip"
          data-active={!waitingOnly}
          onClick={() => setWaitingOnly(false)}
        >
          הכל
        </button>
        <button
          className="chip"
          data-active={waitingOnly}
          onClick={() => setWaitingOnly(true)}
        >
          ממתינים לתשובה {waitingCount > 0 ? `(${waitingCount})` : ""}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <strong>אין שיחות</strong>
          כאן יופיעו כל ההתכתבויות בוואטסאפ, לפי ההודעה האחרונה.
        </div>
      ) : (
        <div className="list">
          {visible.map((c) => (
            <div
              className={c.lastDirection === "in" ? "lead hot" : "lead"}
              key={c.leadId}
            >
              <span
                className="bar"
                style={{ background: statusColor(c.status) }}
              />
              <Link href={`/leads/${c.leadId}`} className="body">
                <div className="name">
                  {c.name}
                  {c.lastDirection === "in" && (
                    <span className="badge-hot">ממתין</span>
                  )}
                  <span
                    style={{
                      float: "left",
                      fontSize: 12,
                      color: "#64748b",
                      fontWeight: 400,
                    }}
                  >
                    {timeLabel(c.lastAt)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: c.lastDirection === "in" ? "#0f172a" : "#64748b",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 2,
                  }}
                >
                  {c.lastDirection === "out" && "את/ה: "}
                  {c.lastText || "(ללא טקסט)"}
                </div>
                <div
                  className="meta"
                  style={{ marginTop: 2, fontSize: 12 }}
                >
                  <span style={{ color: statusColor(c.status) }}>
                    {c.status}
                  </span>
                  <span>·</span>
                  <span>{displayPhone(c.phone)}</span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
