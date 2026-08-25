"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExpenseRow, CategoryTotal, MoneyPicture } from "@/lib/expenses";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/periods";

const money = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function ExpensesScreen({
  rows,
  categories,
  moneyPicture,
  label,
  period,
}: {
  rows: ExpenseRow[];
  categories: CategoryTotal[];
  moneyPicture: MoneyPicture;
  label: string;
  period: PeriodKey;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [at, setAt] = useState(new Date().toISOString().slice(0, 10));
  const [recurring, setRecurring] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("");
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

  async function addExpense() {
    if (!title.trim() || !amount) {
      setMessage("צריך תיאור וסכום");
      return;
    }
    const { ok } = await call("/api/expenses", {
      title,
      amount: Number(amount),
      categoryId,
      at,
      recurring,
    });
    if (ok) {
      setTitle("");
      setAmount("");
      setMessage("נוסף");
      setAdding(false);
    }
  }

  const profitColor = moneyPicture.profit >= 0 ? "#12805c" : "#b42318";

  return (
    <>
      <div className="filters">
        {(
          ["this_month", "last_month", "last_3", "this_year", "all"] as PeriodKey[]
        ).map((key) => (
          <Link
            key={key}
            href={`/expenses?period=${key}`}
            className="chip period-chip"
            data-active={period === key}
          >
            {PERIOD_LABELS[key]}
          </Link>
        ))}
      </div>

      {/* התמונה במקום אחד */}
      <div className="revenue">
        <div className="revenue-head">
          <div>
            <span className="revenue-num" style={{ color: "#fff" }}>
              {money(moneyPicture.profit)}
            </span>
            <span className="revenue-target"> רווח · {label}</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginTop: 12,
            fontSize: 13,
            opacity: 0.85,
          }}
        >
          <span>עמלות {money(moneyPicture.commissions)}</span>
          <span>מכירת לידים {money(moneyPicture.leadSales)}</span>
          <span>הוצאות {money(moneyPicture.expenses)}</span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-num" style={{ color: "#12805c" }}>
            {money(moneyPicture.income)}
          </div>
          <div className="stat-label">נכנס</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: "#b42318" }}>
            {money(moneyPicture.expenses)}
          </div>
          <div className="stat-label">יצא</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: profitColor }}>
            {money(moneyPicture.profit)}
          </div>
          <div className="stat-label">נשאר</div>
        </div>
        <div className="stat">
          <div className="stat-num">{rows.length}</div>
          <div className="stat-label">הוצאות</div>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>קטגוריות</div>
          <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
            טען את הקטגוריות המוכנות: פרסום, מרכזייה, תפעול לידים,
            כלים ותוכנה, רכב ונסיעות, אחר.
          </div>
          <button
            className="btn primary"
            onClick={() => call("/api/expense-categories", { seed: true })}
            disabled={busy}
          >
            טען קטגוריות
          </button>
        </div>
      ) : (
        <>
          <div className="section-title">לפי קטגוריה</div>
          <div className="timeline">
            {categories.map((c) => (
              <div
                className="event"
                key={c.id}
                style={{ borderInlineStartColor: c.color }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <strong style={{ color: c.color, fontSize: 17 }}>
                    {money(c.total)}
                  </strong>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 13, color: "#98a2b3" }}>
                    {c.percent}%
                  </span>
                </div>
                {c.total > 0 && (
                  <div className="bars" style={{ margin: "6px 0 0" }}>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.min(c.percent, 100)}%`,
                          background: c.color,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {adding ? (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 10 }}>הוצאה חדשה</div>

          <input
            className="field"
            placeholder="על מה — למשל: פייסבוק אוגוסט"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="field"
            type="number"
            min={0}
            placeholder="סכום"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select
            className="field"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— קטגוריה —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="field"
            type="date"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />

          <button
            className="status-option"
            data-current={recurring}
            onClick={() => setRecurring(!recurring)}
          >
            <span
              className="dot"
              style={{ background: recurring ? "#12805c" : "#dbe3ea" }}
            />
            <span>הוצאה חודשית קבועה</span>
          </button>

          <div className="actions">
            <button className="btn" onClick={() => setAdding(false)}>
              ביטול
            </button>
            <button
              className="btn primary"
              onClick={addExpense}
              disabled={busy}
            >
              הוסף
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="actions">
            <button className="btn primary" onClick={() => setAdding(true)}>
              הוסף הוצאה
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              className="field"
              placeholder="קטגוריה חדשה"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <button
              className="btn"
              style={{ flex: "0 0 auto", height: 50 }}
              onClick={async () => {
                const { ok } = await call("/api/expense-categories", {
                  name: newCategory,
                });
                if (ok) setNewCategory("");
              }}
              disabled={busy || !newCategory.trim()}
            >
              הוסף
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="card" style={{ fontSize: 14 }}>
          {message}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="section-title">הוצאות בתקופה</div>
          <div className="timeline">
            {rows.map((r) => (
              <div
                className="event"
                key={r.id}
                style={{ borderInlineStartColor: r.categoryColor }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <strong style={{ fontSize: 16 }}>{money(r.amount)}</strong>
                  <span style={{ flex: 1 }}>{r.title}</span>
                </div>
                <div className="when">
                  {when(r.at)}
                  {r.categoryName ? ` · ${r.categoryName}` : ""}
                  {r.recurring ? " · חודשי קבוע" : ""}
                </div>
                <button
                  className="btn"
                  style={{ height: 36, marginTop: 8, color: "#b42318" }}
                  onClick={() =>
                    call(`/api/expenses/${r.id}`, undefined, "DELETE")
                  }
                  disabled={busy}
                >
                  מחק
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
