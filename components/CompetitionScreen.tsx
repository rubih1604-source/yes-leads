"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { displayPhone } from "@/lib/phone";
import type { CompetitionData } from "@/lib/competition";

/**
 * ============================================================
 *  המסך שמראה איפה הלקוחות הולכים למישהו אחר
 * ============================================================
 *
 *  הכלל כאן: **מסקנה אחת בראש, ואחריה הראיות.**
 *
 *  לא עוד מסך של גרפים שצריך לפענח - אלא משפט אחד שאומר
 *  מה לעשות אחרת, ומתחתיו המספרים שממנו הוא נגזר.
 */

const PERIODS = [
  { key: "this_month", label: "החודש" },
  { key: "last_month", label: "חודש שעבר" },
  { key: "last_3", label: "3 חודשים" },
  { key: "this_year", label: "השנה" },
  { key: "all", label: "הכל" },
];

function hours(n: number | null): string {
  if (n === null) return "—";
  if (n < 1) return `${Math.round(n * 60)} דקות`;
  if (n < 48) return `${Math.round(n)} שעות`;
  return `${Math.round(n / 24)} ימים`;
}

export default function CompetitionScreen({
  data,
  period,
  statuses,
  selected,
}: {
  data: CompetitionData;
  period: string;
  statuses: string[];
  selected: string[];
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [setupOpen, setSetupOpen] = useState(!data.configured);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function save() {
    setBusy(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lostStatuses: picked }),
    }).catch(() => null);
    setBusy(false);
    setSetupOpen(false);
    router.refresh();
  }

  /**
   * המסקנה. נבנית מהנתונים, לא כתובה מראש.
   */
  const verdict = (() => {
    if (data.lost === 0) {
      return "אין מספיק נתונים לתקופה הזו. בחר טווח ארוך יותר";
    }

    const slower =
      data.firstTouchLost !== null &&
      data.firstTouchWon !== null &&
      data.firstTouchLost > data.firstTouchWon;

    if (data.neverContactedLost > 0 && data.neverContactedLost >= data.lost / 3) {
      return `${data.neverContactedLost} מתוך ${data.lost} הלידים שהתחברו למישהו אחר — לא יצאה אליהם ממך אף הודעה`;
    }

    if (slower && data.halfLostWithinHours !== null) {
      return `מחצית מההפסדים קורים תוך ${data.halfLostWithinHours} שעות מהכניסה. בלידים שהפסדת הגעת אחרי ${hours(
        data.firstTouchLost
      )}, ובאלה שסגרת אחרי ${hours(data.firstTouchWon)}`;
    }

    if (data.halfLostWithinHours !== null) {
      return `מחצית מההפסדים קורים תוך ${data.halfLostWithinHours} שעות מרגע שהליד נכנס`;
    }

    return `${data.lostPercent}% מהלידים התחברו למישהו אחר`;
  })();

  return (
    <>
      <div className="filters periods">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/competition?period=${p.key}`}
            className="chip period-chip"
            data-active={period === p.key}
            style={{ textDecoration: "none" }}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* הגדרה: אילו סטטוסים נחשבים הפסד */}
      {(setupOpen || !data.configured) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>
            אילו סטטוסים אומרים "התחבר, אבל לא דרכי"
          </div>
          <div style={{ fontSize: 13, color: "#475467", margin: "3px 0 10px" }}>
            {data.configured
              ? "בחר את הסטטוסים שמייצגים לקוח שסגר עם משווק אחר."
              : "עוד לא הגדרת. בינתיים ניחשתי לפי שמות הסטטוסים, וזה לא מדויק."}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {statuses.map((name) => (
              <button
                key={name}
                className="chip"
                data-active={picked.includes(name)}
                onClick={() =>
                  setPicked((prev) =>
                    prev.includes(name)
                      ? prev.filter((x) => x !== name)
                      : [...prev, name]
                  )
                }
              >
                {name}
              </button>
            ))}
          </div>

          <button
            className="btn primary"
            style={{ marginTop: 11 }}
            onClick={save}
            disabled={busy || picked.length === 0}
          >
            {busy ? "שומר..." : "שמור"}
          </button>
        </div>
      )}

      {/* המסקנה */}
      <div
        className="card"
        style={{ borderInlineStart: "4px solid #b42318", marginBottom: 14 }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.5 }}>
          {verdict}
        </div>
        <div style={{ fontSize: 13, color: "#475467", marginTop: 6 }}>
          {data.lost} מתוך {data.totalLeads} לידים · {data.lostPercent}% ·
          לעומת {data.won} שנסגרו אצלך
        </div>
        {data.configured && (
          <button
            className="chip"
            style={{ marginTop: 10 }}
            onClick={() => setSetupOpen((v) => !v)}
          >
            שנה סטטוסים
          </button>
        )}
      </div>

      {/* חלון ההפסד */}
      {data.lost > 0 && (
        <>
          <div className="section-title">תוך כמה זמן הם אבדו</div>
          <div className="card">
            {data.lossWindow.map((b) => (
              <div key={b.label} style={{ marginBottom: 9 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13.5,
                    marginBottom: 3,
                  }}
                >
                  <span>{b.label}</span>
                  <span style={{ color: "#475467" }}>
                    {b.count} · {b.percent}%
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "#eef2f7",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${b.percent}%`,
                      height: "100%",
                      background: "#b42318",
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="insight">
              זה הזמן שיש לך. אחרי זה הלקוח כבר מדבר עם מישהו אחר.
            </div>
          </div>
        </>
      )}

      {/* ההשוואה */}
      <div className="section-title">מה היה שונה בלידים שסגרת</div>
      <div className="card">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: 13, color: "#475467" }}>
              זמן עד ההודעה הראשונה
            </div>
            <div style={{ fontSize: 15, marginTop: 4 }}>
              נסגר אצלך: <strong>{hours(data.firstTouchWon)}</strong>
            </div>
            <div style={{ fontSize: 15, color: "#b42318" }}>
              נסגר אצל אחר: <strong>{hours(data.firstTouchLost)}</strong>
            </div>
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: 13, color: "#475467" }}>
              כמה פניות יצאו
            </div>
            <div style={{ fontSize: 15, marginTop: 4 }}>
              נסגר אצלך: <strong>{data.attemptsWon ?? "—"}</strong>
            </div>
            <div style={{ fontSize: 15, color: "#b42318" }}>
              נסגר אצל אחר: <strong>{data.attemptsLost ?? "—"}</strong>
            </div>
          </div>
        </div>

        {data.neverContactedLost > 0 && (
          <div className="insight">
            <strong>{data.neverContactedLost}</strong> לידים שהתחברו למישהו
            אחר לא קיבלו ממך אף הודעה. אלה המכירות הכי קלות שאיבדת.
          </div>
        )}
      </div>

      {/* בסיכון עכשיו */}
      {data.atRisk.length > 0 && (
        <>
          <div className="section-title">
            בסיכון עכשיו
            <span className="count">{data.atRisk.length}</span>
          </div>
          <div className="card" style={{ paddingBottom: 6 }}>
            <div style={{ fontSize: 13, color: "#475467", marginBottom: 10 }}>
              לידים פתוחים שעברו ארבע שעות ומעלה. מסודרים מהוותיק לחדש.
            </div>

            {data.atRisk.slice(0, 25).map((l) => (
              <Link
                key={l.id}
                href={`/leads/${l.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderTop: "1px solid #eef2f7",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span>
                  <span style={{ fontWeight: 500 }}>{l.name}</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      color: "#667085",
                    }}
                  >
                    {displayPhone(l.phone)} · {l.status}
                    {l.contacted ? "" : " · לא נוצר קשר"}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: l.contacted ? "#b54708" : "#b42318",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.hoursWaiting < 48
                    ? `${l.hoursWaiting} שעות`
                    : `${Math.round(l.hoursWaiting / 24)} ימים`}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* לפי קמפיין */}
      {data.byCampaign.length > 0 && (
        <>
          <div className="section-title">איפה אתה מאבד הכי הרבה</div>
          <div className="card" style={{ paddingBottom: 6 }}>
            {data.byCampaign.slice(0, 10).map((c) => (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: "1px solid #eef2f7",
                  fontSize: 13.5,
                }}
              >
                <span>{c.name}</span>
                <span style={{ color: "#475467", whiteSpace: "nowrap" }}>
                  {c.lost}/{c.leads} · {c.lostPercent}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
