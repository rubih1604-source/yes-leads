"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * משימות עסק שאינן קשורות לליד.
 * אותו מנוע תזכורות - בזמן שקבעת יקפוץ באנר על המסך.
 */

export type GeneralTask = {
  id: string;
  title: string;
  body: string | null;
  dueAt: string | null;
  urgent: boolean;
  done: boolean;
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** קיצורי זמן נפוצים */
function presets(): Array<{ label: string; value: () => Date }> {
  return [
    {
      label: "בעוד שעה",
      value: () => new Date(Date.now() + 3600_000),
    },
    {
      label: "היום ב-17:00",
      value: () => {
        const d = new Date();
        d.setHours(17, 0, 0, 0);
        return d;
      },
    },
    {
      label: "מחר ב-9:00",
      value: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
    {
      label: "בעוד שבוע",
      value: () => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function GeneralTasks({ tasks }: { tasks: GeneralTask[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState(toLocalInput(new Date(Date.now() + 3600_000)));
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function add() {
    if (!title.trim()) {
      setMessage("צריך כותרת");
      return;
    }
    setBusy(true);
    setMessage("");

    const res = await fetch("/api/tasks/general", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        dueAt: new Date(due).toISOString(),
        urgent,
      }),
    });

    if (res.ok) {
      setTitle("");
      setBody("");
      setMessage("נוספה");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "ההוספה נכשלה");
    }
    setBusy(false);
  }

  async function complete(id: string, done: boolean) {
    setBusy(true);
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/tasks/general/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>משימה חדשה</div>
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
          כל דבר שקשור לעסק ולא לליד מסוים. בזמן שתקבע — יקפוץ באנר
          על המסך, בלי תלות במייל.
        </div>

        <input
          className="field"
          placeholder="מה צריך לעשות"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="field"
          style={{ height: 70, padding: 12, resize: "vertical" }}
          placeholder="פרטים (לא חובה)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <div className="filters" style={{ padding: "0 0 10px" }}>
          {presets().map((p) => (
            <button
              key={p.label}
              className="chip"
              onClick={() => setDue(toLocalInput(p.value()))}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          className="field"
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />

        <button
          className="status-option"
          data-current={urgent}
          onClick={() => setUrgent(!urgent)}
        >
          <span
            className="dot"
            style={{ background: urgent ? "#b42318" : "#dbe3ea" }}
          />
          <span>דחוף</span>
        </button>

        <button className="btn primary" onClick={add} disabled={busy}>
          {busy ? "שומר..." : "הוסף משימה"}
        </button>

        {message && (
          <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
        )}
      </div>

      {open.length === 0 ? (
        <div className="empty">
          <strong>אין משימות פתוחות</strong>
          משימות עסק שתוסיף יופיעו כאן.
        </div>
      ) : (
        <>
          <div className="section-title">פתוחות · {open.length}</div>
          <div className="timeline">
            {open.map((t) => {
              const late =
                t.dueAt !== null && new Date(t.dueAt).getTime() < Date.now();

              return (
                <div
                  className="event"
                  key={t.id}
                  style={{
                    borderInlineStartColor: t.urgent
                      ? "#b42318"
                      : late
                      ? "#b54708"
                      : "#1b4d8f",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {t.urgent && "🔥 "}
                    {t.title}
                  </div>

                  {t.body && (
                    <div
                      style={{
                        fontSize: 14,
                        color: "#475467",
                        whiteSpace: "pre-wrap",
                        marginTop: 3,
                      }}
                    >
                      {t.body}
                    </div>
                  )}

                  <div className="when">
                    {t.dueAt ? when(t.dueAt) : "בלי שעה"}
                    {late && " · עבר הזמן"}
                  </div>

                  <div className="actions" style={{ marginTop: 10 }}>
                    <button
                      className="btn primary"
                      style={{ height: 40 }}
                      onClick={() => complete(t.id, true)}
                      disabled={busy}
                    >
                      בוצע
                    </button>
                    <button
                      className="btn"
                      style={{ height: 40, color: "#b42318" }}
                      onClick={() => remove(t.id)}
                      disabled={busy}
                    >
                      מחק
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <div className="section-title">בוצעו · {done.length}</div>
          <div className="timeline">
            {done.map((t) => (
              <div
                className="event"
                key={t.id}
                style={{ borderInlineStartColor: "#98a2b3", opacity: 0.65 }}
              >
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                <button
                  className="btn"
                  style={{ height: 36, marginTop: 8 }}
                  onClick={() => complete(t.id, false)}
                  disabled={busy}
                >
                  החזר לפתוחות
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
