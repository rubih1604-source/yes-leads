"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ListRow = {
  id: string;
  name: string;
  contacts: number;
  createdAt: string;
  lastSend: {
    templateName: string;
    sent: number;
    failed: number;
    total: number;
    state: string;
  } | null;
};

export default function BroadcastScreen({
  lists,
  templates,
}: {
  lists: ListRow[];
  templates: Array<{ name: string; displayName: string | null }>;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{
    rows: number;
    contacts: number;
    invalid: number;
    duplicates: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [template, setTemplate] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const router = useRouter();

  async function readFile(file: File) {
    setError("");
    setPreview(null);

    if (/\.xlsx?$/i.test(file.name)) {
      setError(
        "אקסל לא נקרא ישירות. פתח באקסל ← קובץ ← שמירה בשם ← CSV UTF-8."
      );
      return;
    }

    setText(await file.text());
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
  }

  async function check() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "רשימה", text, dryRun: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setPreview(data);
    else setError(data.error || "הבדיקה נכשלה");
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`הרשימה נוצרה · ${data.contacts} אנשי קשר`);
      setName("");
      setText("");
      setPreview(null);
      router.refresh();
    } else {
      setError(data.error || "השמירה נכשלה");
    }
    setBusy(false);
  }

  /** שולח מנה אחר מנה עד שנגמר, ומעדכן התקדמות */
  async function runSend(listId: string) {
    const chosen = template[listId];
    if (!chosen) return;

    setBusy(true);
    setConfirming(null);

    let sendId: string | undefined;
    let guard = 0;

    while (guard++ < 500) {
      const res = await fetch(`/api/broadcast/${listId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateName: chosen, sendId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setProgress((p) => ({
          ...p,
          [listId]: data.error || "הדיוור נכשל",
        }));
        break;
      }

      sendId = data.sendId;

      setProgress((p) => ({
        ...p,
        [listId]: `נשלחו ${data.sent} מתוך ${data.total}${
          data.failed ? ` · ${data.failed} נכשלו` : ""
        }${data.finished ? " · הסתיים" : "..."}`,
      }));

      if (data.finished) break;
    }

    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>רשימה חדשה</div>
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
          העלה קובץ CSV עם עמודת טלפון (ואם יש, גם שם). אלה לא לידים —
          הם לא נכנסים לרשימה ואין עליהם אוטומציה.
        </div>

        <input
          className="field"
          placeholder="שם הרשימה"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="field"
          type="file"
          accept=".csv,.txt,text/csv"
          style={{ paddingTop: 12 }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
          }}
        />

        {error && <div className="error">{error}</div>}

        {preview && (
          <div className="stat-grid" style={{ padding: "0 0 12px" }}>
            <div className="stat">
              <div className="stat-num">{preview.contacts}</div>
              <div className="stat-label">אנשי קשר</div>
            </div>
            <div className="stat">
              <div className="stat-num">{preview.duplicates}</div>
              <div className="stat-label">כפילויות</div>
            </div>
            <div className="stat">
              <div className="stat-num">{preview.invalid}</div>
              <div className="stat-label">בלי טלפון</div>
            </div>
            <div className="stat">
              <div className="stat-num">{preview.rows}</div>
              <div className="stat-label">שורות</div>
            </div>
          </div>
        )}

        <div className="actions">
          <button className="btn" onClick={check} disabled={busy || !text}>
            בדוק
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={busy || !preview}
          >
            שמור רשימה
          </button>
        </div>

        {message && (
          <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
        )}
      </div>

      {lists.length === 0 ? (
        <div className="empty">
          <strong>אין עדיין רשימות דיוור</strong>
          העלה קובץ ותוכל לשלוח אליו תבנית מאושרת.
        </div>
      ) : (
        lists.map((list) => (
          <div className="card" key={list.id}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{list.name}</div>
            <div style={{ fontSize: 13, color: "#98a2b3", marginTop: 2 }}>
              {list.contacts} אנשי קשר
            </div>

            {list.lastSend && (
              <div className="insight" style={{ marginTop: 10 }}>
                דיוור אחרון: {list.lastSend.templateName} · נשלחו{" "}
                {list.lastSend.sent} מתוך {list.lastSend.total}
                {list.lastSend.failed > 0 &&
                  ` · ${list.lastSend.failed} נכשלו`}
              </div>
            )}

            <select
              className="field"
              style={{ marginTop: 12 }}
              value={template[list.id] ?? ""}
              onChange={(e) =>
                setTemplate((p) => ({ ...p, [list.id]: e.target.value }))
              }
            >
              <option value="">— בחר תבנית —</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.displayName || t.name}
                </option>
              ))}
            </select>

            {confirming === list.id ? (
              <div className="actions">
                <button className="btn" onClick={() => setConfirming(null)}>
                  ביטול
                </button>
                <button
                  className="btn"
                  style={{
                    background: "#b54708",
                    color: "#fff",
                    border: "none",
                  }}
                  onClick={() => runSend(list.id)}
                  disabled={busy}
                >
                  כן, שלח ל-{list.contacts}
                </button>
              </div>
            ) : (
              <button
                className="btn primary"
                onClick={() => setConfirming(list.id)}
                disabled={busy || !template[list.id]}
              >
                שלח דיוור ל-{list.contacts}
              </button>
            )}

            {progress[list.id] && (
              <div style={{ marginTop: 10, fontSize: 14 }}>
                {progress[list.id]}
              </div>
            )}

            <button
              className="btn"
              style={{ marginTop: 10, color: "#b42318" }}
              onClick={async () => {
                await fetch(`/api/broadcast/${list.id}`, { method: "DELETE" });
                router.refresh();
              }}
              disabled={busy}
            >
              מחק רשימה
            </button>
          </div>
        ))
      )}
    </>
  );
}
