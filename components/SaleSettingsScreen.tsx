"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SALE_COLUMNS,
  DEFAULT_SALE_ROW_FIELDS,
  type SaleColumnKey,
} from "@/lib/sale-report-columns";

/**
 * ============================================================
 *  הגדרות מכירת לידים
 * ============================================================
 *
 *  מה שמוצג בכל שורת ליד ברשימת המכירה.
 *
 *  הסדר על המסך קבוע לפי SALE_COLUMNS ולא לפי סדר הסימון,
 *  כדי שכל השורות ייראו אותו דבר. בחירה ריקה חוזרת לברירת
 *  המחדל - רשימה של שורות ריקות היא לא בחירה שמישהו התכוון
 *  אליה.
 */
export default function SaleSettingsScreen({
  initial,
}: {
  initial: SaleColumnKey[];
}) {
  const [picked, setPicked] = useState<Set<SaleColumnKey>>(new Set(initial));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const router = useRouter();

  async function save() {
    setBusy(true);
    setMessage("");
    setFailed(false);

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleRowFields: [...picked] }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);

    if (!res?.ok) {
      setFailed(true);
      setMessage(data?.error ?? "ההגדרה לא נשמרה");
      return;
    }

    setMessage(
      picked.size === 0
        ? "לא נבחר כלום, ולכן הוחזרה ברירת המחדל."
        : "נשמר. חזור למסך מכירת לידים כדי לראות."
    );
    router.refresh();
  }

  return (
    <>
      <div
        className="card"
        style={{ marginBottom: 14, borderInlineStart: "4px solid #2e90fa" }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          מה מוצג בכל שורת ליד
        </div>
        <div style={{ fontSize: 13, color: "#475467", lineHeight: 1.7 }}>
          סמן אילו שדות יופיעו בשורה ברשימת מכירת לידים. זה לא משנה
          את הנתונים עצמם — רק מה שרואים על המסך.
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
            gap: 4,
          }}
        >
          {SALE_COLUMNS.map((c) => (
            <label
              key={c.key}
              style={{
                display: "flex",
                gap: 7,
                alignItems: "center",
                fontSize: 13.5,
                padding: "4px 0",
              }}
            >
              <input
                type="checkbox"
                checked={picked.has(c.key)}
                onChange={(e) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(c.key);
                    else next.delete(c.key);
                    return next;
                  })
                }
              />
              {c.label}
              {c.note && (
                <span style={{ fontSize: 11.5, color: "#98a2b3" }}>
                  ({c.note})
                </span>
              )}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "שומר..." : "שמור"}
          </button>
          <button
            className="chip"
            onClick={() => setPicked(new Set(DEFAULT_SALE_ROW_FIELDS))}
          >
            חזור לברירת מחדל
          </button>
        </div>

        {message && (
          <div
            style={{
              fontSize: 13,
              marginTop: 9,
              lineHeight: 1.6,
              color: failed ? "#b42318" : "#027a48",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </>
  );
}
