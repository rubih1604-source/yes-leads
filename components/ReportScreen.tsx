"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReportData, Slice } from "@/lib/reports";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/periods";

function Section({ title, slices }: { title: string; slices: Slice[] }) {
  if (slices.length === 0) return null;

  return (
    <>
      <div className="section-title">{title}</div>
      <div className="timeline">
        {slices.map((s) => (
          <div
            className="event"
            key={s.name}
            style={{ borderInlineStartColor: s.color }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <strong style={{ color: s.color, fontSize: 18 }}>
                {s.count}
              </strong>
              <span style={{ flex: 1 }}>{s.name}</span>
              <strong style={{ fontSize: 15 }}>{s.percent}%</strong>
            </div>
            <div className="bars" style={{ margin: "6px 0 0" }}>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(s.percent, 100)}%`,
                    background: s.color,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function ReportScreen({
  report,
  period,
  from,
  to,
}: {
  report: ReportData;
  period: PeriodKey;
  from: string;
  to: string;
}) {
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const query =
    period === "custom"
      ? `period=custom&from=${customFrom}&to=${customTo}`
      : `period=${period}`;

  return (
    <>
      <div className="filters">
        {(
          [
            "this_month",
            "last_month",
            "last_3",
            "this_year",
            "last_year",
            "all",
            "custom",
          ] as PeriodKey[]
        ).map((key) => (
          <Link
            key={key}
            href={`/reports?period=${key}`}
            className="chip period-chip"
            data-active={period === key}
          >
            {PERIOD_LABELS[key]}
          </Link>
        ))}
      </div>

      {period === "custom" && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            בחר טווח
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="field"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <span style={{ fontSize: 14 }}>עד</span>
            <input
              className="field"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
          </div>
          <Link
            href={`/reports?period=custom&from=${customFrom}&to=${customTo}`}
            className="btn primary"
            style={{ marginTop: 10, textDecoration: "none" }}
          >
            הצג
          </Link>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-num">{report.total}</div>
          <div className="stat-label">לידים</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: "#12805c" }}>
            {report.won}
          </div>
          <div className="stat-label">נסגרו</div>
        </div>
        <div className="stat">
          <div className="stat-num">{report.winPercent}%</div>
          <div className="stat-label">אחוז סגירה</div>
        </div>
        <div className="stat">
          <div
            className="stat-num"
            style={{
              color: report.existingPercent > 25 ? "#b54708" : undefined,
            }}
          >
            {report.existingCustomers}
          </div>
          <div className="stat-label">
            לקוחות קיימים · {report.existingPercent}%
          </div>
        </div>
      </div>

      <div className="card">
        <a
          className="btn primary"
          href={`/api/reports/export?${query}`}
          style={{ textDecoration: "none" }}
        >
          הורד את הדוח כקובץ
        </a>
        <div style={{ fontSize: 12.5, color: "#98a2b3", marginTop: 8 }}>
          נפתח באקסל, עם כל הפילוחים והאחוזים.
        </div>
      </div>

      <Section title="לפי סטטוס" slices={report.byStatus} />
      <Section title="לפי קמפיין" slices={report.byCampaign} />
      <Section title="לפי ספק נוכחי" slices={report.bySupplier} />
    </>
  );
}
