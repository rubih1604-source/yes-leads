"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CampaignStat,
  BuyerStat,
  SaleEntryRow,
} from "@/lib/lead-sales";

const money = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

function when(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadSalesScreen({
  campaigns,
  buyers,
  entries,
  totalMonth,
  revenueMonth,
  unregistered,
  monthLabel,
  missingEntries,
  period,
  from,
  to,
}: {
  campaigns: CampaignStat[];
  buyers: BuyerStat[];
  entries: SaleEntryRow[];
  totalMonth: number;
  revenueMonth: number;
  unregistered: Array<{ name: string; count: number }>;
  monthLabel: string;
  missingEntries: number;
  period: string;
  from: string;
  to: string;
}) {
  const [customFrom, setCustomFrom] = useState(
    from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  );
  const [customTo, setCustomTo] = useState(
    to || new Date().toISOString().slice(0, 10)
  );
  const [tab, setTab] = useState<"leads" | "campaigns" | "buyers">("leads");
  const [filter, setFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  // טפסים
  const [addingCampaign, setAddingCampaign] = useState(false);
  const [cName, setCName] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [cBuyer, setCBuyer] = useState("");
  const [moveExisting, setMoveExisting] = useState(true);

  const [addingBuyer, setAddingBuyer] = useState(false);
  const [bName, setBName] = useState("");

  const [rates, setRates] = useState<Record<string, string>>({});

  const visible = useMemo(
    () => (filter ? entries.filter((e) => e.campaign === filter) : entries),
    [entries, filter]
  );

  const filteredRevenue = useMemo(
    () => visible.reduce((s, e) => s + (e.billable ? e.price : 0), 0),
    [visible]
  );

  const excludedCount = useMemo(
    () => visible.filter((e) => !e.billable).length,
    [visible]
  );

  async function toggleBillable(id: string, billable: boolean) {
    setBusy(true);
    await fetch(`/api/lead-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billable }),
    });
    setBusy(false);
    router.refresh();
  }

  const existingTotal = useMemo(() => {
    const count = campaigns.reduce((s, c) => s + c.existingMonth, 0);
    return {
      count,
      percent: totalMonth > 0 ? Math.round((count / totalMonth) * 1000) / 10 : 0,
    };
  }, [campaigns, totalMonth]);

  const excludedTotal = useMemo(
    () => campaigns.reduce((s, c) => s + c.excludedMonth, 0),
    [campaigns]
  );

  async function call(url: string, body?: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMessage(data.error || "הפעולה נכשלה");
    router.refresh();
    return { ok: res.ok, data };
  }

  async function addCampaign() {
    if (!cName || !cPrice) {
      setMessage("צריך לבחור קמפיין ולהגדיר מחיר");
      return;
    }
    const { ok, data } = await call("/api/sales-campaigns", {
      name: cName,
      pricePerLead: Number(cPrice),
      buyerId: cBuyer || null,
      moveExisting,
    });
    if (ok) {
      setMessage(
        data.moved > 0
          ? `נרשם · ${data.moved} לידים קיימים הועברו לכאן`
          : "הקמפיין נרשם"
      );
      setCName("");
      setCPrice("");
      setAddingCampaign(false);
    }
  }

  return (
    <>
      <div className="filters periods">
        {(
          [
            { key: "this_month", label: "החודש" },
            { key: "last_month", label: "חודש קודם" },
            { key: "last_3", label: "3 חודשים" },
            { key: "this_year", label: "השנה" },
            { key: "all", label: "הכל" },
            { key: "custom", label: "טווח" },
          ] as const
        ).map((opt) => (
          <Link
            key={opt.key}
            href={`/lead-sales?period=${opt.key}`}
            className="chip period-chip"
            data-active={period === opt.key}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {period === "custom" && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            בחר טווח תאריכים
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
            href={`/lead-sales?period=custom&from=${customFrom}&to=${customTo}`}
            className="btn primary"
            style={{ marginTop: 10, textDecoration: "none" }}
          >
            הצג
          </Link>
        </div>
      )}

      {/* ציר ההכנסות */}
      <div className="revenue">
        <div className="revenue-head">
          <div>
            <span className="revenue-num">
              {money(filter ? filteredRevenue : revenueMonth)}
            </span>
          </div>
          <span className="revenue-meta">
            {filter
              ? `${visible.length} לידים · ${filter}`
              : `${totalMonth} לידים · ${monthLabel}`}
            {excludedCount > 0 && ` · ${excludedCount} לא לחיוב`}
          </span>
        </div>
      </div>

      {missingEntries > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            השלמת לידים ותיקים
          </div>
          <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
            <strong>{missingEntries}</strong> לידים נכנסו לפני שהתחלנו לספור
            כניסות. השלם אותם כדי שייכללו בחישוב.
          </div>
          <button
            className="btn primary"
            onClick={async () => {
              const { ok, data } = await call(
                "/api/maintenance/backfill-entries"
              );
              if (ok) setMessage(`${data.created} כניסות הושלמו`);
            }}
            disabled={busy}
          >
            {busy ? "משלים..." : "השלם"}
          </button>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>חישוב מחדש</div>
          <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
            עובר על כל הדאטה ומיישר אותו למצב הנוכחי — כולל מה שיובא
            מקובץ. שינית מחיר לליד? זה יעדכן גם אחורה.
            הסימונים הידניים של &quot;לא לחיוב&quot; לא ייפגעו.
          </div>
          <button
            className="btn"
            onClick={async () => {
              const { ok, data } = await call(
                "/api/maintenance/recalc-sales"
              );
              if (ok)
                setMessage(
                  `נסרקו ${data.scanned} כניסות · ${data.marked} סומנו כמכירה · ${data.repriced} עודכן מחיר · ${data.unmarked} הוסרו`
                );
            }}
            disabled={busy}
          >
            {busy ? "מחשב..." : "חשב הכל מחדש"}
          </button>
        </div>
      )}

      {message && (
        <div className="card" style={{ fontSize: 14 }}>
          {message}
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-num">{totalMonth}</div>
            <div className="stat-label">לידים</div>
          </div>
          <div className="stat">
            <div className="stat-num" style={{ color: "#12805c" }}>
              {money(revenueMonth)}
            </div>
            <div className="stat-label">לתשלום</div>
          </div>
          <div className="stat">
            <div
              className="stat-num"
              style={{ color: existingTotal.percent > 25 ? "#b54708" : undefined }}
            >
              {existingTotal.count}
            </div>
            <div className="stat-label">
              לקוחות קיימים · {existingTotal.percent}%
            </div>
          </div>
          <div className="stat">
            <div className="stat-num">{excludedTotal}</div>
            <div className="stat-label">לא לחיוב</div>
          </div>
        </div>
      )}

      <div className="filters">
        {(
          [
            { key: "leads", label: `לידים ${entries.length}` },
            { key: "campaigns", label: `קמפיינים ${campaigns.length}` },
            { key: "buyers", label: `לקוחות ${buyers.length}` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            className="chip"
            data-active={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- לידים ---------- */}
      {tab === "leads" && (
        <>
          {campaigns.length > 0 && (
            <div className="filters">
              <button
                className="chip"
                data-active={filter === null}
                onClick={() => setFilter(null)}
              >
                כל הקמפיינים
              </button>
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  className="chip"
                  data-active={filter === c.name}
                  onClick={() => setFilter(filter === c.name ? null : c.name)}
                >
                  {c.name}
                  <span style={{ opacity: 0.55, marginInlineStart: 5 }}>
                    {money(c.pricePerLead)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="empty">
              <strong>אין עדיין לידים למכירה</strong>
              רשום קמפיין מכירה, וכל ליד שייכנס ממנו יופיע כאן.
            </div>
          ) : (
            <div className="list">
              {visible.map((e) => (
                <div
                  className="lead"
                  key={e.id}
                  style={e.billable ? undefined : { opacity: 0.62 }}
                >
                  <span
                    className="bar"
                    style={{ background: e.billable ? "#12805c" : "#98a2b3" }}
                  />
                  <Link href={`/leads/${e.leadId}`} className="body">
                    <div className="name">
                      {e.name}
                      {e.existingCustomer && (
                        <span className="existing-tag">לקוח קיים</span>
                      )}
                      {!e.billable && (
                        <span
                          className="dup-tag"
                          style={{
                            background: "#eef2f6",
                            borderColor: "#98a2b3",
                            color: "#475467",
                          }}
                        >
                          הועבר אליי
                        </span>
                      )}
                    </div>
                    <div className="meta">
                      <span
                        className="status-text"
                        style={{
                          color: e.billable ? "#12805c" : "#98a2b3",
                          textDecoration: e.billable ? "none" : "line-through",
                        }}
                      >
                        {money(e.price)}
                      </span>
                      <span>·</span>
                      <span>{when(e.at)}</span>
                    </div>
                    {e.campaign && (
                      <div className="supplier-tag">{e.campaign}</div>
                    )}
                  </Link>

                  <div className="row-actions">
                    <button
                      className="row-btn"
                      style={{ color: e.billable ? "#98a2b3" : "#12805c" }}
                      aria-label={
                        e.billable ? "סמן כהועבר אליי" : "החזר לחיוב"
                      }
                      title={e.billable ? "סמן כהועבר אליי" : "החזר לחיוב"}
                      onClick={() => toggleBillable(e.id, !e.billable)}
                      disabled={busy}
                    >
                      {e.billable ? "⊘" : "↺"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------- קמפיינים ---------- */}
      {tab === "campaigns" && (
        <>
          {addingCampaign ? (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                רישום קמפיין מכירה
              </div>
              <div
                style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}
              >
                לידים מהקמפיין הזה לא יופיעו ברשימת הלידים ולא יקבלו שום
                הודעה אוטומטית.
              </div>

              <select
                className="field"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              >
                <option value="">— בחר קמפיין —</option>
                {unregistered.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name} ({u.count})
                  </option>
                ))}
              </select>

              <input
                className="field"
                type="number"
                min={0}
                placeholder="מחיר לליד"
                value={cPrice}
                onChange={(e) => setCPrice(e.target.value)}
              />

              <select
                className="field"
                value={cBuyer}
                onChange={(e) => setCBuyer(e.target.value)}
              >
                <option value="">— לקוח (לא חובה) —</option>
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <button
                className="status-option"
                data-current={moveExisting}
                onClick={() => setMoveExisting(!moveExisting)}
              >
                <span
                  className="dot"
                  style={{ background: moveExisting ? "#12805c" : "#dbe3ea" }}
                />
                <span>העבר לכאן גם לידים שכבר נכנסו מהקמפיין</span>
              </button>

              <div className="actions">
                <button
                  className="btn"
                  onClick={() => setAddingCampaign(false)}
                  disabled={busy}
                >
                  ביטול
                </button>
                <button
                  className="btn primary"
                  onClick={addCampaign}
                  disabled={busy}
                >
                  רשום
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <button
                className="btn primary"
                onClick={() => setAddingCampaign(true)}
              >
                רשום קמפיין מכירה
              </button>
            </div>
          )}

          {campaigns.map((c) => (
            <div className="card" key={c.id}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
              {c.buyerName && (
                <div style={{ fontSize: 13, color: "#98a2b3", marginTop: 2 }}>
                  {c.buyerName}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  margin: "12px 0",
                  fontSize: 13,
                  color: "#475467",
                }}
              >
                <span>
                  <strong style={{ fontSize: 19, color: "#101828" }}>
                    {c.leadsMonth}
                  </strong>{" "}
                  החודש
                </span>
                <span>
                  <strong style={{ fontSize: 19, color: "#12805c" }}>
                    {money(c.revenueMonth)}
                  </strong>
                </span>
                <span>
                  <strong
                    style={{
                      fontSize: 19,
                      color: c.existingPercent > 25 ? "#b54708" : "#101828",
                    }}
                  >
                    {c.existingMonth}
                  </strong>{" "}
                  לקוחות קיימים
                  <span
                    style={{
                      color: c.existingPercent > 25 ? "#b54708" : "#98a2b3",
                      fontWeight: 600,
                    }}
                  >
                    {" "}
                    ({c.existingPercent}%)
                  </span>
                </span>
                {c.excludedMonth > 0 && (
                  <span style={{ color: "#98a2b3" }}>
                    {c.excludedMonth} לא לחיוב
                  </span>
                )}
                <span style={{ color: "#98a2b3" }}>{c.leadsTotal} סה"כ</span>
              </div>

              {c.existingPercent > 25 && (
                <div className="insight">
                  יותר מרבע מהלידים כאן כבר לקוחות yes. שווה לצמצם אותם
                  בהגדרות הקהל.
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={rates[c.id] ?? String(c.pricePerLead)}
                  onChange={(e) =>
                    setRates((p) => ({ ...p, [c.id]: e.target.value }))
                  }
                  style={{ marginBottom: 0, flex: 1 }}
                />
                <span style={{ fontSize: 14 }}>₪</span>
                <button
                  className="btn"
                  style={{ flex: "0 0 auto", height: 50 }}
                  onClick={() =>
                    call(
                      `/api/sales-campaigns/${c.id}`,
                      {
                        pricePerLead: Number(
                          rates[c.id] ?? c.pricePerLead
                        ),
                      },
                      "PATCH"
                    )
                  }
                  disabled={busy}
                >
                  שמור
                </button>
              </div>

              {buyers.length > 0 && (
                <select
                  className="field"
                  style={{ marginTop: 10 }}
                  value={c.buyerId ?? ""}
                  onChange={(e) =>
                    call(
                      `/api/sales-campaigns/${c.id}`,
                      { buyerId: e.target.value || null },
                      "PATCH"
                    )
                  }
                >
                  <option value="">— בלי לקוח —</option>
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                className="btn"
                style={{ marginTop: 10, color: "#b42318" }}
                onClick={async () => {
                  const { ok, data } = await call(
                    `/api/sales-campaigns/${c.id}`,
                    undefined,
                    "DELETE"
                  );
                  if (ok)
                    setMessage(
                      `הוסר · ${data.returned} לידים חזרו לרשימה הרגילה`
                    );
                }}
                disabled={busy}
              >
                הסר מקמפיין מכירה
              </button>
            </div>
          ))}
        </>
      )}

      {/* ---------- לקוחות ---------- */}
      {tab === "buyers" && (
        <>
          {addingBuyer ? (
            <div className="card">
              <input
                className="field"
                placeholder="שם הלקוח"
                value={bName}
                onChange={(e) => setBName(e.target.value)}
              />
              <div className="actions">
                <button
                  className="btn"
                  onClick={() => setAddingBuyer(false)}
                  disabled={busy}
                >
                  ביטול
                </button>
                <button
                  className="btn primary"
                  onClick={async () => {
                    const { ok } = await call("/api/lead-buyers", {
                      name: bName,
                    });
                    if (ok) {
                      setBName("");
                      setAddingBuyer(false);
                    }
                  }}
                  disabled={busy}
                >
                  הוסף
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <button
                className="btn primary"
                onClick={() => setAddingBuyer(true)}
              >
                הוסף לקוח
              </button>
            </div>
          )}

          {buyers.length === 0 ? (
            <div className="empty">
              <strong>אין עדיין לקוחות</strong>
              הוסף לקוח, שייך אליו קמפיינים, ותראה כמה כסף מגיע לך מכל אחד.
            </div>
          ) : (
            buyers.map((b) => (
              <div className="card" key={b.id}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{b.name}</div>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    margin: "10px 0",
                    fontSize: 13,
                    color: "#475467",
                  }}
                >
                  <span>
                    <strong style={{ fontSize: 22, color: "#12805c" }}>
                      {money(b.revenueMonth)}
                    </strong>{" "}
                    החודש
                  </span>
                  <span>{b.leadsMonth} לידים</span>
                  <span>{b.campaigns} קמפיינים</span>
                </div>
                <button
                  className="btn"
                  style={{ color: "#b42318" }}
                  onClick={() =>
                    call(`/api/lead-buyers/${b.id}`, undefined, "DELETE")
                  }
                  disabled={busy}
                >
                  מחק לקוח
                </button>
              </div>
            ))
          )}
        </>
      )}
    </>
  );
}
