"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  verdictOf,
  type CampaignResult,
  type Totals,
} from "@/lib/campaign-performance";

/**
 * ============================================================
 *  ביצועי קמפיינים
 * ============================================================
 *
 *  מסודר לפי הגרוע ביותר קודם, כי שם מתקבלות ההחלטות.
 *  קמפיין שמרוויח לא צריך את תשומת הלב שלך; קמפיין ששורף
 *  כן.
 */

function money(value: number): string {
  return `${Math.round(value).toLocaleString("he-IL")} ₪`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdPerformanceScreen({
  rows,
  totals,
  hasSpend,
  lastSync,
}: {
  rows: CampaignResult[];
  totals: Totals;
  hasSpend: boolean;
  lastSync: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function sync() {
    setBusy(true);
    setMessage("שולף מפייסבוק...");

    const res = await fetch("/api/facebook/insights?days=60", {
      method: "POST",
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);

    if (!res?.ok) {
      setMessage(data?.error ?? "השליפה נכשלה");
      return;
    }

    setMessage(`נשמרו ${data.נשמרו} שורות · ${data.טווח}`);
    router.refresh();
  }

  return (
    <>
      {!hasSpend && (
        <div
          className="card"
          style={{ borderInlineStart: "4px solid #b54708", marginBottom: 12 }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            עוד לא נשלפה הוצאת פרסום
          </div>
          <div style={{ fontSize: 13.5, color: "#475467", lineHeight: 1.6 }}>
            בלי צד ההוצאה אפשר לראות רק כמה לידים נכנסו — לא כמה הם
            עלו ולא מה נשאר. לחץ על שליפה; אם חסרה הרשאה, ההודעה
            תגיד בדיוק מה להקצות בפייסבוק.
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span>
            <div style={{ fontSize: 12.5, color: "#667085" }}>הוצאה</div>
            <strong style={{ fontSize: 19 }}>{money(totals.spend)}</strong>
          </span>
          <span>
            <div style={{ fontSize: 12.5, color: "#667085" }}>הכנסה</div>
            <strong style={{ fontSize: 19, color: "#12805c" }}>
              {money(totals.revenue)}
            </strong>
          </span>
          <span>
            <div style={{ fontSize: 12.5, color: "#667085" }}>רווח</div>
            <strong
              style={{
                fontSize: 19,
                color: totals.profit >= 0 ? "#12805c" : "#b42318",
              }}
            >
              {money(totals.profit)}
            </strong>
          </span>
          <span>
            <div style={{ fontSize: 12.5, color: "#667085" }}>לסגירה</div>
            <strong style={{ fontSize: 19 }}>
              {totals.costPerClose === null ? "—" : money(totals.costPerClose)}
            </strong>
          </span>
        </div>

        <div
          style={{
            fontSize: 12.5,
            color: "#667085",
            marginTop: 10,
            lineHeight: 1.6,
          }}
        >
          {totals.leads} לידים · {totals.closed} סגירות ·{" "}
          {totals.closeRate}% סגירה
          {totals.costPerLead !== null && ` · ${money(totals.costPerLead)} לליד`}
          <br />
          ההוצאה כאן לא נכנסת לתמונת הרווח במסך ההוצאות, כדי שלא
          תיספר פעמיים.
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={sync} disabled={busy}>
            {busy ? "רגע..." : "שלוף מפייסבוק"}
          </button>
          {lastSync && (
            <span style={{ fontSize: 12.5, color: "#98a2b3", alignSelf: "center" }}>
              עודכן {when(lastSync)}
            </span>
          )}
        </div>

        {message && (
          <div style={{ fontSize: 13, color: "#475467", marginTop: 9, lineHeight: 1.6 }}>
            {message}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <strong>אין נתונים החודש</strong>
          ברגע שייכנסו לידים או תישלף הוצאה, הקמפיינים יופיעו כאן.
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={row.campaignId ?? row.name}
            className="card"
            style={{
              marginBottom: 10,
              borderInlineStart: `4px solid ${
                row.profit > 0 ? "#12805c" : row.spend > 0 ? "#b42318" : "#d0d5dd"
              }`,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>{row.name}</div>

            <div
              style={{
                fontSize: 13.5,
                color: row.profit > 0 ? "#12805c" : "#b42318",
                fontWeight: 600,
                marginTop: 3,
              }}
            >
              {verdictOf(row)}
            </div>

            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                marginTop: 9,
                fontSize: 13,
                color: "#475467",
              }}
            >
              <span>הוצאה {money(row.spend)}</span>
              <span>{row.leads} לידים</span>
              {row.costPerLead !== null && <span>{money(row.costPerLead)} לליד</span>}
              <span>
                {row.closed} סגירות ({row.closeRate}%)
              </span>
              {row.revenue > 0 && <span>הכנסה {money(row.revenue)}</span>}
            </div>

            {row.missing !== null && row.missing > 0 && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "#b54708",
                  marginTop: 7,
                  lineHeight: 1.6,
                }}
              >
                פייסבוק מדווחת על {row.missing} לידים נוספים שלא נקלטו
                אצלך. פער קבוע כאן אומר שלידים לא מגיעים — זה הדבר
                היקר שקורה בשקט.
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
