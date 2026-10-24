"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { displayPhone } from "@/lib/phone";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/data-export";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/periods";

/**
 * ============================================================
 *  דאטה
 * ============================================================
 *
 *  כל מי שהתעניין ולא נסגר. זה נכס: אפשר לפנות אליו במבצע,
 *  לדוור לו, או לבנות ממנו קהל לוק-אלייק בפייסבוק.
 *
 *  הסטטוסים שיוצאים מכאן נבחרים על ידך, כי "נסגר" אצלך
 *  יכול להיקרא אחרת ממה שאני אנחש.
 */

export type DataRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  campaign: string | null;
  at: string;
};

export default function DataScreen({
  rows,
  total,
  period,
  from,
  to,
  excluded,
  statuses,
  rangeLabel,
}: {
  rows: DataRow[];
  total: number;
  period: PeriodKey;
  from: string;
  to: string;
  excluded: string[];
  statuses: string[];
  rangeLabel: string;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(excluded));
  const [format, setFormat] = useState<ExportFormat>("lookalike");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  const router = useRouter();

  async function saveStatuses() {
    setBusy(true);
    setMessage("");

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataExcludeStatuses: [...picked] }),
    }).catch(() => null);

    setBusy(false);

    if (!res?.ok) {
      setMessage("ההגדרה לא נשמרה");
      return;
    }

    setMessage("נשמר");
    setOpen(false);
    router.refresh();
  }

  const query = new URLSearchParams({ period, format });
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  return (
    <>
      {/* בורר תקופה */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
          <Link
            key={key}
            href={`/data?period=${key}`}
            className="chip"
            style={
              period === key
                ? { background: "#1b4d8f", color: "#fff", borderColor: "#1b4d8f" }
                : undefined
            }
          >
            {PERIOD_LABELS[key]}
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 26 }}>{total.toLocaleString()}</strong>
          <span style={{ fontSize: 14, color: "#475467" }}>
            אנשים בדאטה · {rangeLabel}
          </span>
        </div>

        <div
          style={{
            fontSize: 12.5,
            color: "#667085",
            marginTop: 6,
            lineHeight: 1.7,
          }}
        >
          {excluded.length === 0
            ? "לא הוחרג אף סטטוס — כולם נכנסים."
            : `לא נכנסים: ${excluded.join(" · ")}`}
          <button
            className="chip"
            style={{ marginInlineStart: 8 }}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "סגור" : "שנה"}
          </button>
        </div>

        {open && (
          <div style={{ marginTop: 11 }}>
            <div
              style={{
                fontSize: 13,
                color: "#475467",
                marginBottom: 8,
                lineHeight: 1.6,
              }}
            >
              סמן את הסטטוסים ש<strong>לא</strong> ייכנסו לדאטה.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 4,
              }}
            >
              {statuses.map((s) => (
                <label
                  key={s}
                  style={{
                    display: "flex",
                    gap: 7,
                    alignItems: "center",
                    fontSize: 13.5,
                    padding: "3px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(s)}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s);
                        else next.delete(s);
                        return next;
                      })
                    }
                  />
                  {s}
                </label>
              ))}
            </div>

            <button
              className="btn primary"
              style={{ marginTop: 9 }}
              onClick={saveStatuses}
              disabled={busy}
            >
              {busy ? "שומר..." : "שמור"}
            </button>
          </div>
        )}

        {message && (
          <div style={{ fontSize: 13, color: "#027a48", marginTop: 8 }}>
            {message}
          </div>
        )}
      </div>

      {/* הורדה */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 7 }}>הורדת הקובץ</div>

        {EXPORT_FORMATS.map((f) => (
          <label
            key={f.key}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 13.5,
              padding: "5px 0",
              lineHeight: 1.6,
            }}
          >
            <input
              type="radio"
              name="format"
              checked={format === f.key}
              onChange={() => setFormat(f.key)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>{f.label}</strong>
              <br />
              <span style={{ fontSize: 12.5, color: "#667085" }}>{f.note}</span>
            </span>
          </label>
        ))}

        <a
          className="btn primary"
          style={{ marginTop: 11, display: "inline-block" }}
          href={`/api/data/export?${query}`}
        >
          הורד {total.toLocaleString()} אנשים
        </a>
      </div>

      <div className="section-title">
        {rows.length < total ? `${rows.length} ראשונים מתוך ${total}` : "הרשימה"}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <strong>אין דאטה בתקופה הזו</strong>
          נסה טווח אחר, או שנה אילו סטטוסים מוחרגים.
        </div>
      ) : (
        <div className="list">
          {rows.map((r) => (
            <div className="lead" key={r.id}>
              <span className="bar" style={{ background: "#7a5af8" }} />
              <Link href={`/leads/${r.id}`} className="body">
                <div className="name">{r.name}</div>
                <div className="meta">
                  <span dir="ltr">{displayPhone(r.phone)}</span>
                  <span>·</span>
                  <span>{r.status}</span>
                  <span>·</span>
                  <span>{r.at}</span>
                </div>
                {r.campaign && (
                  <div className="supplier-tag">{r.campaign}</div>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
