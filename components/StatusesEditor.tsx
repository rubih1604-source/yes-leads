"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusDef } from "@/lib/statuses";
import { hookTokens } from "@/lib/hook-payload";

const PALETTE = [
  "#2563eb",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#f59e0b",
  "#15803d",
  "#12805c",
  "#dc2626",
  "#64748b",
];

export default function StatusesEditor({
  statuses,
  buyers = [],
  channels = [],
}: {
  statuses: StatusDef[];
  /** הקונים, להגדרות ותיקות מלפני הערוצים */
  buyers?: Array<{ id: string; name: string }>;
  /** הערוצים - זו הדרך המועדפת להעביר ליד */
  channels?: Array<{ id: string; label: string }>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [won, setWon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [transferPrices, setTransferPrices] = useState<Record<string, string>>(
    {}
  );
  const [openTransfer, setOpenTransfer] = useState<Record<string, boolean>>({});
  const [openHook, setOpenHook] = useState<Record<string, boolean>>({});
  const [hooks, setHooks] = useState<
    Record<string, { url: string; template: string; secret: string; headers: string }>
  >({});
  const [error, setError] = useState("");
  const router = useRouter();

  async function add() {
    if (!name.trim()) {
      setError("צריך שם לסטטוס");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, won }),
    });
    if (res.ok) {
      setName("");
      setWon(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "ההוספה נכשלה");
    }
    setBusy(false);
  }

  async function saveCommission(id: string, value: string) {
    setBusy(true);
    await fetch(`/api/statuses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commission: Number(value) || 0 }),
    });
    setBusy(false);
    router.refresh();
  }

  /**
   * סטטוס שמעביר ליד לקונה.
   *
   * זה ההיפך מעמלה: עמלה היא מה שאתה מקבל על סגירה, וזה
   * מה שהקונה משלם לך על ליד שהעברת אליו.
   */
  async function saveTransfer(
    id: string,
    channelId: string | null,
    price: string
  ) {
    setBusy(true);
    setError("");

    const res = await fetch(`/api/statuses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transferChannelId: channelId,
        transferPrice: Number(price) || 0,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || "ההגדרה לא נשמרה");
    }

    setBusy(false);
    router.refresh();
  }

  /**
   * וובוק יוצא: כתובת שאליה נשלחת הודעה בשינוי לסטטוס הזה.
   * שולח בלבד - לא מוכר את הליד ולא מזיז אותו.
   */
  function hookOf(s: StatusDef) {
    const saved = hooks[s.id!];
    return (
      saved ?? {
        url: s.hookUrl ?? "",
        template: s.hookTemplate ?? "",
        secret: s.hookSecret ?? "",
        headers: "",
      }
    );
  }

  async function saveHook(id: string) {
    const h = hooks[id];
    if (!h) return;

    setBusy(true);
    setError("");

    const res = await fetch(`/api/statuses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hookUrl: h.url,
        hookTemplate: h.template,
        hookSecret: h.secret,
        hookHeaders: h.headers,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || "הוובוק לא נשמר");
    }

    setBusy(false);
    router.refresh();
  }

  async function remove(id?: string) {
    if (!id) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/statuses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "המחיקה נכשלה");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>סטטוסים</div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        אפשר להוסיף סטטוסים משלך. הם יופיעו בכל מקום — ברשימה, בסינון,
        ובחוקים.
      </div>

      <div className="timeline" style={{ margin: "0 0 14px" }}>
        {statuses.map((s) => (
          <div
            className="event"
            key={s.name}
            style={{ borderInlineStartColor: s.color }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="dot"
                style={{
                  background: s.color,
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  display: "inline-block",
                }}
              />
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              {s.won && (
                <span style={{ fontSize: 11, color: "#12805c", fontWeight: 700 }}>
                  סגירה
                </span>
              )}
              {s.won && s.id && (
                <span
                  style={{
                    marginInlineStart: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <input
                    className="field"
                    type="number"
                    min={0}
                    placeholder="עמלה"
                    value={rates[s.id] ?? String(s.commission ?? 0)}
                    onChange={(e) =>
                      setRates((p) => ({ ...p, [s.id!]: e.target.value }))
                    }
                    style={{
                      marginBottom: 0,
                      width: 90,
                      minHeight: 36,
                      fontSize: 14,
                    }}
                  />
                  <button
                    className="btn"
                    style={{ height: 36, flex: "0 0 auto", fontSize: 13 }}
                    onClick={() =>
                      saveCommission(s.id!, rates[s.id!] ?? String(s.commission ?? 0))
                    }
                    disabled={busy}
                  >
                    ₪
                  </button>
                </span>
              )}
              {s.transferBuyerId && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#b54708",
                    fontWeight: 700,
                  }}
                >
                  מעביר לקונה
                </span>
              )}
              {!s.builtin && (
                <button
                  className="btn"
                  style={{
                    height: 32,
                    flex: "0 0 auto",
                    fontSize: 13,
                    color: "#b42318",
                  }}
                  onClick={() => remove(s.id)}
                  disabled={busy}
                >
                  מחק
                </button>
              )}
            </div>

            {/**
              * העברה לקונה לפי סטטוס.
              *
              * ברגע שליד מקבל את הסטטוס הזה הוא נמכר: נרשמת
              * כניסת מכירה, הליד יוצא מהרשימה האישית ונשלח
              * לקונה. ההעברה נעשית פעם אחת לכל ליד.
              */}
            {/**
              * וובוק יוצא. מוצג לכל סטטוס, גם בלי קונים מוגדרים,
              * כי הוא לא קשור למכירה - הוא עדכון למערכת אחרת.
              */}
            {s.id && (
              <div style={{ marginTop: 7 }}>
                <button
                  className="chip"
                  onClick={() =>
                    setOpenHook((p) => ({ ...p, [s.id!]: !p[s.id!] }))
                  }
                >
                  וובוק יוצא
                  {s.hookUrl ? " · מוגדר" : ""}
                  {openHook[s.id] ? " ⌃" : " ⌄"}
                </button>

                {openHook[s.id] && (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "#475467",
                        marginBottom: 7,
                        lineHeight: 1.6,
                      }}
                    >
                      כשליד יקבל את הסטטוס הזה תישלח הודעה לכתובת.
                      <strong> שולח בלבד</strong> — לא מוכר את הליד ולא
                      מוציא אותו מהרשימה שלך. כל ניסיון נרשם בציר הזמן
                      של הליד, וכשל יוצר התראה.
                    </div>

                    <input
                      className="field"
                      style={{ width: "100%", direction: "ltr" }}
                      placeholder="https://..."
                      value={hookOf(s).url}
                      onChange={(e) =>
                        setHooks((p) => ({
                          ...p,
                          [s.id!]: { ...hookOf(s), url: e.target.value },
                        }))
                      }
                    />

                    <input
                      className="field"
                      style={{ width: "100%", direction: "ltr" }}
                      placeholder="סוד לאימות (לא חובה)"
                      value={hookOf(s).secret}
                      onChange={(e) =>
                        setHooks((p) => ({
                          ...p,
                          [s.id!]: { ...hookOf(s), secret: e.target.value },
                        }))
                      }
                    />

                    <textarea
                      className="field"
                      style={{
                        width: "100%",
                        minHeight: 54,
                        direction: "ltr",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                      placeholder="כותרות, שורה לכל אחת: X-API-Key=..."
                      value={hookOf(s).headers}
                      onChange={(e) =>
                        setHooks((p) => ({
                          ...p,
                          [s.id!]: { ...hookOf(s), headers: e.target.value },
                        }))
                      }
                    />

                    <div
                      style={{
                        fontSize: 12,
                        color: "#667085",
                        margin: "4px 0 6px",
                        lineHeight: 1.6,
                      }}
                    >
                      תבנית גוף הבקשה. ריק = נשלחים כל השדות. אסימונים:
                      <br />
                      <span
                        dir="ltr"
                        style={{ fontFamily: "monospace", fontSize: 11 }}
                      >
                        {hookTokens()
                          .map((t) => `{${t}}`)
                          .join(" ")}
                      </span>
                    </div>

                    <textarea
                      className="field"
                      style={{
                        width: "100%",
                        minHeight: 90,
                        direction: "ltr",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                      placeholder={
                        '{\n  "name": "{full_name}",\n  "phone": "{phone}",\n  "status": "{status}"\n}'
                      }
                      value={hookOf(s).template}
                      onChange={(e) =>
                        setHooks((p) => ({
                          ...p,
                          [s.id!]: { ...hookOf(s), template: e.target.value },
                        }))
                      }
                    />

                    <button
                      className="btn"
                      onClick={() => saveHook(s.id!)}
                      disabled={busy || !hooks[s.id]}
                    >
                      שמור וובוק
                    </button>
                  </div>
                )}
              </div>
            )}

            {s.id && channels.length > 0 && (
              <div style={{ marginTop: 7 }}>
                <button
                  className="chip"
                  onClick={() =>
                    setOpenTransfer((p) => ({ ...p, [s.id!]: !p[s.id!] }))
                  }
                >
                  העברה לערוץ
                  {s.transferChannelId
                    ? ` · ${
                        channels.find((c) => c.id === s.transferChannelId)
                          ?.label ?? "מוגדר"
                      }`
                    : ""}
                  {openTransfer[s.id] ? " ⌃" : " ⌄"}
                </button>

                {openTransfer[s.id] && (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "#475467",
                        marginBottom: 7,
                        lineHeight: 1.6,
                      }}
                    >
                      ליד שיקבל את הסטטוס הזה יעבור לערוץ שתבחר:
                      נרשמת לו כניסה בערוץ, והוא נשלח לכתובת של הערוץ.
                      אם זה ערוץ מכירה — הוא גם יוצא מהרשימה האישית
                      שלך. ההעברה נעשית פעם אחת לכל ליד.
                      <br />
                      המחיר מגיע מהערוץ עצמו.
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select
                        className="field"
                        style={{ marginBottom: 0, flex: "1 1 150px" }}
                        value={s.transferChannelId ?? ""}
                        onChange={(e) =>
                          saveTransfer(
                            s.id!,
                            e.target.value || null,
                            transferPrices[s.id!] ??
                              String(s.transferPrice ?? 0)
                          )
                        }
                      >
                        <option value="">— לא מעביר —</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>


                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <input
        className="field"
        placeholder="שם הסטטוס החדש"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div style={{ fontSize: 13, fontWeight: 600, margin: "2px 2px 8px" }}>
        צבע
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={c}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: c,
              border: color === c ? "3px solid #101828" : "1px solid #dbe3ea",
            }}
          />
        ))}
      </div>

      <button
        className="status-option"
        data-current={won}
        onClick={() => setWon(!won)}
      >
        <span
          className="dot"
          style={{ background: won ? "#12805c" : "#dbe3ea" }}
        />
        <span>זה סטטוס של סגירת עסקה</span>
      </button>

      {error && <div className="error">{error}</div>}

      <button className="btn primary" onClick={add} disabled={busy}>
        {busy ? "שומר..." : "הוסף סטטוס"}
      </button>
    </div>
  );
}
