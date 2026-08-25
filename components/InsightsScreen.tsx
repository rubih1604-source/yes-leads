"use client";

import Link from "next/link";
import type { InsightsData, Heatmap, Winner } from "@/lib/insights";
import { DAY_NAMES } from "@/lib/insights";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/periods";

/** שעות העבודה הרלוונטיות - מצמצם רעש של לילה */
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 07:00 - 23:00

function HeatGrid({ heat, color }: { heat: Heatmap; color: string }) {
  const lookup = new Map<string, number>(
    heat.cells.map((c) => [`${c.day}-${c.hour}`, c.count])
  );

  return (
    <div className="heat-wrap">
      <table className="heat">
        <thead>
          <tr>
            <th />
            {HOURS.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <tr key={day}>
              <th>{DAY_NAMES[day].slice(0, 2)}</th>
              {HOURS.map((hour) => {
                const count = lookup.get(`${day}-${hour}`) ?? 0;
                const strength = heat.max > 0 ? count / heat.max : 0;
                return (
                  <td
                    key={hour}
                    title={`${DAY_NAMES[day]} ${hour}:00 — ${count}`}
                    style={{
                      background:
                        count === 0
                          ? "#f1f5f9"
                          : `color-mix(in srgb, ${color} ${Math.round(
                              15 + strength * 85
                            )}%, white)`,
                    }}
                  >
                    {count > 0 ? count : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** מקרא: מה הצבע אומר */
function HeatLegend({ heat, color }: { heat: Heatmap; color: string }) {
  const steps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="heat-legend">
      <span>מעט</span>
      {steps.map((s, i) => (
        <span
          key={i}
          className="heat-legend-box"
          style={{
            background:
              s === 0
                ? "#f1f5f9"
                : `color-mix(in srgb, ${color} ${Math.round(
                    15 + s * 85
                  )}%, white)`,
          }}
        />
      ))}
      <span>הרבה</span>
      <span className="heat-legend-max">
        התא הכהה ביותר = {heat.max}
      </span>
    </div>
  );
}

function HeatSection({
  title,
  heat,
  color,
  insight,
  caveat,
}: {
  title: string;
  heat: Heatmap;
  color: string;
  insight: string;
  caveat?: string;
}) {
  if (heat.total === 0) return null;

  return (
    <>
      <div className="section-title">{title}</div>
      <div className="card">
        <HeatGrid heat={heat} color={color} />
        <HeatLegend heat={heat} color={color} />

        {caveat && (
          <div
            style={{
              fontSize: 12.5,
              color: "#98a2b3",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            {caveat}
          </div>
        )}

        {heat.peakDay !== null && heat.peakHour !== null && (
          <div className="insight" style={{ marginTop: 12 }}>
            השיא: <strong>יום {heat.peakDay}</strong> סביב השעה{" "}
            <strong>{heat.peakHour}:00</strong>. {insight}
          </div>
        )}
      </div>
    </>
  );
}

function WinnerList({ title, rows }: { title: string; rows: Winner[] }) {
  if (rows.length === 0) return null;

  const best = rows[0];
  const worst = rows[rows.length - 1];

  return (
    <>
      <div className="section-title">{title}</div>
      <div className="timeline">
        {rows.map((r) => (
          <div
            className="event"
            key={r.name}
            style={{
              borderInlineStartColor:
                r.rate >= best.rate * 0.8 ? "#12805c" : "#dbe3ea",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <strong style={{ fontSize: 18, color: "#12805c" }}>
                {r.rate}%
              </strong>
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ fontSize: 13, color: "#98a2b3" }}>
                {r.won}/{r.total}
              </span>
            </div>
            <div className="bars" style={{ margin: "6px 0 0" }}>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${Math.min(r.rate * 3, 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length > 1 && best.rate > worst.rate * 1.5 && (
        <div className="card insight-card">
          <strong>{best.name}</strong> סוגר {best.rate}%, לעומת{" "}
          {worst.rate}% של <strong>{worst.name}</strong>. אם התקציב מתחלק
          ביניהם — שווה להזיז אותו.
        </div>
      )}
    </>
  );
}

export default function InsightsScreen({
  data,
  period,
}: {
  data: InsightsData;
  period: PeriodKey;
}) {
  return (
    <>
      <div className="filters">
        {(
          ["this_month", "last_month", "last_3", "this_year", "all"] as PeriodKey[]
        ).map((key) => (
          <Link
            key={key}
            href={`/insights?period=${key}`}
            className="chip period-chip"
            data-active={period === key}
          >
            {PERIOD_LABELS[key]}
          </Link>
        ))}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-num">{data.totalLeads}</div>
          <div className="stat-label">לידים בתקופה</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: "#12805c" }}>
            {data.totalWon}
          </div>
          <div className="stat-label">נסגרו</div>
        </div>
        <div className="stat">
          <div className="stat-num">{data.arrivals.peakDay ?? "—"}</div>
          <div className="stat-label">היום העמוס</div>
        </div>
        <div className="stat">
          <div className="stat-num">
            {data.arrivals.peakHour !== null
              ? `${data.arrivals.peakHour}:00`
              : "—"}
          </div>
          <div className="stat-label">השעה העמוסה</div>
        </div>
      </div>

      {data.totalLeads === 0 ? (
        <div className="empty">
          <strong>אין נתונים בתקופה הזו</strong>
          נסה טווח רחב יותר.
        </div>
      ) : (
        <>
          {/* ---- מה מאפיין סגירה ---- */}
          <div className="section-title">מה מאפיין ליד שנסגר</div>
          <div className="card">
            <div
              style={{
                display: "flex",
                fontSize: 12.5,
                fontWeight: 700,
                color: "#98a2b3",
                paddingBottom: 8,
                borderBottom: "1px solid #dbe3ea",
              }}
            >
              <span style={{ flex: 1 }} />
              <span style={{ width: 90, textAlign: "center" }}>נסגרו</span>
              <span style={{ width: 90, textAlign: "center" }}>לא נסגרו</span>
            </div>

            {data.comparisons.map((c) => (
              <div key={c.label}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "11px 0",
                    borderBottom: "1px solid #f1f5f9",
                    fontSize: 14.5,
                  }}
                >
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <strong
                    style={{
                      width: 90,
                      textAlign: "center",
                      color: "#12805c",
                      fontFamily: "Rubik, sans-serif",
                    }}
                  >
                    {c.won}
                  </strong>
                  <strong
                    style={{
                      width: 90,
                      textAlign: "center",
                      color: "#98a2b3",
                      fontFamily: "Rubik, sans-serif",
                    }}
                  >
                    {c.lost}
                  </strong>
                </div>
                {c.hint && <div className="insight">{c.hint}</div>}
              </div>
            ))}
          </div>

          <WinnerList title="מי סוגר — לפי קמפיין" rows={data.byCampaign} />
          <WinnerList title="מי סוגר — לפי ספק נוכחי" rows={data.bySupplier} />
          <WinnerList
            title="מי סוגר — לפי התבנית הראשונה"
            rows={data.byTemplate}
          />

          {/* ---- מפות חום ---- */}
          <HeatSection
            title="מתי נכנסים לידים"
            heat={data.arrivals}
            color="#1b4d8f"
            insight="שם שווה להעלות תקציב, ושם חייבים להיות זמינים."
          />
          <HeatSection
            title="מתי לקוחות עונים"
            heat={data.replies}
            color="#12805c"
            insight="זו השעה שבה תבנית שתצא תקבל הכי הרבה מענה."
          />
          <HeatSection
            title="מתי נסגרות עסקאות"
            heat={data.closings}
            color="#7c3aed"
            insight="השעות שבהן אתה הכי אפקטיבי. שווה לפנות אותן."
            caveat="נמדד לפי הרגע שבו שינית את הסטטוס במערכת. סגירות שעודכנו מטעינת דוח לא נספרות כאן, כדי שלא ייווצר שיא מדומה ביום שבו טענת את הקובץ."
          />
        </>
      )}
    </>
  );
}
