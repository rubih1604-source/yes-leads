"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignStat } from "@/lib/lead-sales";

export default function LeadSalesScreen({
  campaigns,
  totalMonth,
  revenueMonth,
  unregistered,
  monthLabel,
}: {
  campaigns: CampaignStat[];
  totalMonth: number;
  revenueMonth: number;
  unregistered: Array<{ name: string; count: number }>;
  monthLabel: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [buyer, setBuyer] = useState("");
  const [moveExisting, setMoveExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rates, setRates] = useState<Record<string, string>>({});
  const router = useRouter();

  const money = (n: number) => `₪${n.toLocaleString("he-IL")}`;

  async function add() {
    if (!name || !price) {
      setError("צריך לבחור קמפיין ולהגדיר מחיר");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch("/api/sales-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        pricePerLead: Number(price),
        buyer,
        moveExisting,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setMessage(
        data.moved > 0
          ? `הקמפיין נרשם · ${data.moved} לידים קיימים הועברו לכאן`
          : "הקמפיין נרשם"
      );
      setName("");
      setPrice("");
      setBuyer("");
      setAdding(false);
      router.refresh();
    } else {
      setError(data.error || "הרישום נכשל");
    }
    setBusy(false);
  }

  async function savePrice(id: string, value: string) {
    setBusy(true);
    await fetch(`/api/sales-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePerLead: Number(value) || 0 }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`/api/sales-campaigns/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setMessage(
      res.ok
        ? `הקמפיין הוסר · ${data.returned} לידים חזרו לרשימה הרגילה`
        : "ההסרה נכשלה"
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      {/* הצג הראשי - כמה כסף החודש */}
      <div className="revenue">
        <div className="revenue-head">
          <div>
            <span className="revenue-num">{money(revenueMonth)}</span>
          </div>
          <span className="revenue-meta">
            {totalMonth} לידים · {monthLabel}
          </span>
        </div>
      </div>

      {message && (
        <div className="card" style={{ fontSize: 14 }}>
          {message}
        </div>
      )}

      {adding ? (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            רישום קמפיין מכירה
          </div>
          <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
            הלידים מהקמפיין הזה לא יופיעו ברשימת הלידים ולא יקבלו שום
            הודעה אוטומטית. הם רק ייספרו כאן.
          </div>

          <select
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
          >
            <option value="">— בחר קמפיין —</option>
            {unregistered.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count} לידים)
              </option>
            ))}
          </select>

          <input
            className="field"
            type="number"
            min={0}
            placeholder="מחיר לליד בשקלים"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />

          <input
            className="field"
            placeholder="למי מוכרים (לא חובה)"
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
          />

          <button
            className="status-option"
            data-current={moveExisting}
            onClick={() => setMoveExisting(!moveExisting)}
          >
            <span
              className="dot"
              style={{ background: moveExisting ? "#12805c" : "#dbe3ea" }}
            />
            <span>העבר לכאן גם לידים שכבר נכנסו מהקמפיין הזה</span>
          </button>

          {error && <div className="error">{error}</div>}

          <div className="actions">
            <button
              className="btn"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              ביטול
            </button>
            <button className="btn primary" onClick={add} disabled={busy}>
              {busy ? "שומר..." : "רשום"}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <button className="btn primary" onClick={() => setAdding(true)}>
            רשום קמפיין מכירה
          </button>
          {unregistered.length === 0 && (
            <div style={{ fontSize: 13, color: "#98a2b3", marginTop: 10 }}>
              אין קמפיינים לא רשומים כרגע.
            </div>
          )}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="empty">
          <strong>אין עדיין קמפיינים של מכירת לידים</strong>
          רשום קמפיין, הגדר מחיר לליד, וכל מה שייכנס ממנו ייספר כאן
          במקום להיכנס לרשימת הלידים.
        </div>
      ) : (
        campaigns.map((c) => (
          <div className="card" key={c.id}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
            {c.buyer && (
              <div style={{ fontSize: 13, color: "#98a2b3", marginTop: 2 }}>
                נמכר ל{c.buyer}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                margin: "12px 0",
                fontSize: 13,
                color: "#475467",
              }}
            >
              <span>
                <strong
                  style={{
                    fontFamily: "Rubik, sans-serif",
                    fontSize: 20,
                    color: "#101828",
                  }}
                >
                  {c.leadsMonth}
                </strong>{" "}
                לידים החודש
              </span>
              <span>
                <strong
                  style={{
                    fontFamily: "Rubik, sans-serif",
                    fontSize: 20,
                    color: "#12805c",
                  }}
                >
                  {money(c.revenueMonth)}
                </strong>
              </span>
              <span>
                <strong
                  style={{
                    fontFamily: "Rubik, sans-serif",
                    fontSize: 20,
                    color: c.existingPercent > 25 ? "#b54708" : "#101828",
                  }}
                >
                  {c.existingPercent}%
                </strong>{" "}
                לקוחות קיימים
              </span>
              <span style={{ color: "#98a2b3" }}>
                {c.leadsTotal} מאז ומעולם
              </span>
            </div>

            {c.existingPercent > 25 && (
              <div className="insight">
                יותר מרבע מהלידים בקמפיין הזה כבר לקוחות yes. שווה לצמצם
                אותם בהגדרות הקהל — הקונה משלם על לידים פחות איכותיים.
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
              <span style={{ fontSize: 14 }}>₪ לליד</span>
              <button
                className="btn"
                style={{ flex: "0 0 auto", height: 50 }}
                onClick={() =>
                  savePrice(c.id, rates[c.id] ?? String(c.pricePerLead))
                }
                disabled={busy}
              >
                שמור
              </button>
            </div>

            <button
              className="btn"
              style={{ marginTop: 10, color: "#b42318" }}
              onClick={() => remove(c.id)}
              disabled={busy}
            >
              הסר מקמפיין מכירה
            </button>
          </div>
        ))
      )}
    </>
  );
}
