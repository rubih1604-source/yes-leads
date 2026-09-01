"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignPerf } from "@/lib/campaign-monitor";
import type { StatusDef } from "@/lib/statuses";

function when(iso: string | null): string {
  if (!iso) return "עוד לא נבדק";
  return new Date(iso).toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function CampaignAlertsScreen({
  campaigns,
  statuses,
  closeStatuses,
  defaultTarget,
  defaultGrace,
  defaultRecheck,
  rules,
}: {
  campaigns: Array<
    Omit<CampaignPerf, "lastCheckedAt" | "firstLeadAt"> & {
      lastCheckedAt: string | null;
      firstLeadAt: string | null;
    }
  >;
  statuses: StatusDef[];
  closeStatuses: string[];
  defaultTarget: number;
  defaultGrace: number;
  defaultRecheck: number;
  rules: Array<{ id: string; campaignName: string | null }>;
}) {
  const [picked, setPicked] = useState<string[]>(closeStatuses);
  const [target, setTarget] = useState(String(defaultTarget));
  const [grace, setGrace] = useState(String(defaultGrace));
  const [recheck, setRecheck] = useState(String(defaultRecheck));
  const [editing, setEditing] = useState<string | null>(null);
  const [oneTarget, setOneTarget] = useState("");
  const [oneGrace, setOneGrace] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function call(url: string, body?: unknown, method = "POST") {
    setBusy(true);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(data.error || "הפעולה נכשלה");
    setBusy(false);
    router.refresh();
    return { ok: res.ok, data };
  }

  const failing = campaigns.filter((c) => !c.inGrace && !c.passed && c.leads >= 5);

  return (
    <>
      {failing.length > 0 && (
        <div
          className="card"
          style={{ borderInlineStart: "4px solid #b42318" }}
        >
          <div style={{ fontWeight: 700, color: "#b42318" }}>
            {failing.length} קמפיינים מתחת ליעד
          </div>
          <div style={{ fontSize: 13, color: "#475467", marginTop: 4 }}>
            {failing.map((c) => c.name).join(" · ")}
          </div>
        </div>
      )}

      {/* ---- הגדרת ברירת מחדל ---- */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          היעד שחל על כל הקמפיינים
        </div>
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
          מרגע שהקמפיין מתחיל להביא לידים ועד סוף ימי החסד, המערכת
          נותנת לו לרוץ. אחר כך היא בודקת, ואם הוא מתחת ליעד — מתריעה.
          משם והלאה בדיקה חוזרת בכל מחזור.
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, width: 62 }}>יעד %</span>
          <input
            className="field"
            type="number"
            min={0}
            max={100}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ marginBottom: 0, flex: 1 }}
          />
          <span style={{ fontSize: 13, width: 62 }}>ימי חסד</span>
          <input
            className="field"
            type="number"
            min={0}
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
            style={{ marginBottom: 0, flex: 1 }}
          />
        </div>

        <div
          style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}
        >
          <span style={{ fontSize: 13, width: 62 }}>כל כמה ימים</span>
          <input
            className="field"
            type="number"
            min={1}
            value={recheck}
            onChange={(e) => setRecheck(e.target.value)}
            style={{ marginBottom: 0, flex: 1 }}
          />
          <button
            className="btn primary"
            style={{ flex: 1, height: 50 }}
            onClick={() =>
              call("/api/campaign-rules", {
                targetPercent: Number(target),
                graceDays: Number(grace),
                recheckDays: Number(recheck),
              })
            }
            disabled={busy}
          >
            שמור
          </button>
        </div>
      </div>

      {/* ---- אילו סטטוסים נחשבים סגירה ---- */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          מה נחשב סגירה
        </div>
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
          לפי אלה מחושב אחוז המכירה. 2 מתוך 10 לידים = 20%.
        </div>

        {statuses.map((s) => (
          <button
            key={s.name}
            className="status-option"
            data-current={picked.includes(s.name)}
            onClick={() =>
              setPicked(
                picked.includes(s.name)
                  ? picked.filter((n) => n !== s.name)
                  : [...picked, s.name]
              )
            }
          >
            <span
              className="dot"
              style={{
                background: picked.includes(s.name) ? "#12805c" : "#dbe3ea",
              }}
            />
            <span>{s.name}</span>
            <span
              className="dot"
              style={{
                background: s.color,
                marginInlineStart: "auto",
                width: 9,
                height: 9,
              }}
            />
          </button>
        ))}

        <button
          className="btn primary"
          onClick={() =>
            call("/api/settings", { closeStatuses: picked }, "PATCH")
          }
          disabled={busy}
        >
          שמור
        </button>
      </div>

      <div className="card">
        <button
          className="btn"
          onClick={async () => {
            const { ok, data } = await call("/api/campaign-rules", {
              runNow: true,
            });
            if (ok)
              setMessage(
                `נבדקו ${data.checked} קמפיינים · ${data.failing} מתחת ליעד`
              );
          }}
          disabled={busy}
        >
          {busy ? "בודק..." : "הרץ בדיקה עכשיו"}
        </button>
        {message && (
          <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
        )}
      </div>

      {/* ---- הקמפיינים ---- */}
      <div className="section-title">הקמפיינים</div>

      {campaigns.length === 0 ? (
        <div className="empty">
          <strong>אין עדיין נתונים</strong>
          קמפיינים יופיעו כאן ברגע שייכנסו מהם לידים.
        </div>
      ) : (
        <div className="timeline">
          {campaigns.map((c) => {
            const color = c.inGrace
              ? "#98a2b3"
              : c.passed
              ? "#12805c"
              : "#b42318";

            return (
              <div
                className="event"
                key={c.name}
                style={{ borderInlineStartColor: color }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <strong style={{ fontSize: 19, color }}>{c.percent}%</strong>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 13, color: "#98a2b3" }}>
                    יעד {c.target}%
                  </span>
                </div>

                <div className="bars" style={{ margin: "6px 0 4px" }}>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.min(
                          (c.percent / Math.max(c.target, 1)) * 100,
                          100
                        )}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>

                <div className="when">
                  {c.closes} סגירות מתוך {c.leads} לידים · רץ {c.ageDays} ימים
                  {c.inGrace
                    ? ` · בימי חסד (${c.graceDays})`
                    : c.passed
                    ? " · עומד ביעד"
                    : " · מתחת ליעד"}
                  {" · נבדק "}
                  {when(c.lastCheckedAt)}
                </div>

                {editing === c.name ? (
                  <div
                    style={{ display: "flex", gap: 8, marginTop: 10 }}
                  >
                    <input
                      className="field"
                      type="number"
                      placeholder="יעד %"
                      value={oneTarget}
                      onChange={(e) => setOneTarget(e.target.value)}
                      style={{ marginBottom: 0, flex: 1 }}
                    />
                    <input
                      className="field"
                      type="number"
                      placeholder="ימי חסד"
                      value={oneGrace}
                      onChange={(e) => setOneGrace(e.target.value)}
                      style={{ marginBottom: 0, flex: 1 }}
                    />
                    <button
                      className="btn primary"
                      style={{ flex: "0 0 auto", height: 50 }}
                      onClick={async () => {
                        await call("/api/campaign-rules", {
                          campaignName: c.name,
                          targetPercent: Number(oneTarget || c.target),
                          graceDays: Number(oneGrace || c.graceDays),
                          recheckDays: c.recheckDays,
                        });
                        setEditing(null);
                      }}
                      disabled={busy}
                    >
                      שמור
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    style={{ height: 38, marginTop: 10, fontSize: 13 }}
                    onClick={() => {
                      setEditing(c.name);
                      setOneTarget(String(c.target));
                      setOneGrace(String(c.graceDays));
                    }}
                  >
                    {c.hasOwnRule ? "ערוך יעד אישי" : "קבע יעד לקמפיין הזה"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
