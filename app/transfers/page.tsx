import Link from "next/link";
import { db } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import { resolveRange, type PeriodKey } from "@/lib/periods";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  פעילות - מה הועבר לקונים
 * ============================================================
 *
 *  **למה המסך הזה קיים.**
 *
 *  ליד שהעברת לאלעד יוצא מהרשימה שלך - זה הכלל, וזה נכון.
 *  אבל "יצא מהרשימה" לא יכול להיות "נעלם": צריך מקום אחד
 *  שאומר כמה העברת, למי, ומתי.
 *
 *  המסך קורא את מה שכבר נרשם - אירוע ההעברה שנוצר ברגע
 *  שינוי הסטטוס. אין כאן ספירה חוזרת ואין טבלה נוספת.
 */

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "היום" },
  { key: "this_week", label: "השבוע" },
  { key: "this_month", label: "החודש" },
  { key: "last_month", label: "חודש שעבר" },
];

export default async function TransfersPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const period = (searchParams?.period as PeriodKey) ?? "this_month";
  const range = resolveRange(period);

  const events = await db.leadEvent
    .findMany({
      where: {
        type: "transferred_to_buyer",
        createdAt: { gte: range.from, lt: range.to },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        toStatus: true,
        payload: true,
        lead: {
          select: { id: true, phone: true, firstName: true, lastName: true },
        },
      },
      take: 1000,
    })
    .catch(() => []);

  /** סיכום לפי קונה */
  const byTarget = new Map<string, { count: number; total: number }>();

  for (const event of events) {
    const payload =
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {};

    const target =
      typeof payload.target === "string" && payload.target.trim()
        ? payload.target.trim()
        : "קונה לא מזוהה";

    const price = Number(payload.price ?? 0) || 0;

    const row = byTarget.get(target) ?? { count: 0, total: 0 };
    row.count++;
    row.total += price;
    byTarget.set(target, row);
  }

  const summary = [...byTarget.entries()].sort((a, b) => b[1].count - a[1].count);
  const grandTotal = summary.reduce((sum, [, row]) => sum + row.total, 0);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          העברות לקונים
          <span className="count">{events.length} לידים</span>
        </h1>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 16px" }}>
        {PERIODS.map((option) => {
          const active = option.key === period;
          return (
            <a
              key={option.key}
              href={`/transfers?period=${option.key}`}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 13.5,
                textDecoration: "none",
                border: "1px solid #dbe3ea",
                background: active ? "#1b4d8f" : "#fff",
                color: active ? "#fff" : "#475467",
              }}
            >
              {option.label}
            </a>
          );
        })}
      </div>

      {summary.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          {summary.map(([target, row]) => (
            <div
              key={target}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "7px 0",
                borderBottom: "1px solid #f2f4f7",
                fontSize: 14,
              }}
            >
              <strong>{target}</strong>
              <span style={{ color: "#475467" }}>
                {row.count} לידים · {row.total.toLocaleString("he-IL")} ₪
              </span>
            </div>
          ))}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: 9,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            <span>סך הכל</span>
            <span>
              {events.length} לידים · {grandTotal.toLocaleString("he-IL")} ₪
            </span>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="empty">
          <strong>לא הועברו לידים בתקופה הזו</strong>
          ליד עובר לקונה כשאתה משנה לו סטטוס שמוגדר כמעביר.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {events.map((event) => {
            const payload =
              event.payload && typeof event.payload === "object"
                ? (event.payload as Record<string, unknown>)
                : {};

            const name =
              `${event.lead?.firstName ?? ""} ${event.lead?.lastName ?? ""}`.trim() ||
              displayPhone(event.lead?.phone ?? "");

            return (
              <div key={event.id} className="card">
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {event.lead ? (
                    <Link
                      href={`/leads/${event.lead.id}`}
                      style={{
                        fontWeight: 600,
                        fontSize: 14.5,
                        color: "#101828",
                        textDecoration: "none",
                      }}
                    >
                      {name}
                    </Link>
                  ) : (
                    <strong style={{ fontSize: 14.5 }}>{name}</strong>
                  )}

                  <span
                    style={{ fontSize: 12.5, color: "#667085", direction: "ltr" }}
                  >
                    {displayPhone(event.lead?.phone ?? "")}
                  </span>

                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 9px",
                      borderRadius: 999,
                      background: "#eef2f7",
                      color: "#475467",
                    }}
                  >
                    {String(payload.target ?? "קונה")}
                  </span>
                </div>

                <div style={{ fontSize: 12.5, color: "#667085", marginTop: 4 }}>
                  {event.createdAt.toLocaleString("he-IL", {
                    timeZone: "Asia/Jerusalem",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {event.toStatus ? ` · ${event.toStatus}` : ""}
                  {Number(payload.price ?? 0)
                    ? ` · ${Number(payload.price)} ₪`
                    : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
