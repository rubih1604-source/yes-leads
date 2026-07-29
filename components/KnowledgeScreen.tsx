"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type KnowledgeRow = {
  id: string;
  topic: string;
  answer: string;
  active: boolean;
};

export default function KnowledgeScreen({
  items,
  prefill = "",
}: {
  items: KnowledgeRow[];
  prefill?: string;
}) {
  const [topic, setTopic] = useState(prefill);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const router = useRouter();

  async function add() {
    if (!topic.trim() || !answer.trim()) {
      setError("צריך גם נושא וגם תשובה");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, answer }),
    });
    if (res.ok) {
      setTopic("");
      setAnswer("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "ההוספה נכשלה");
    }
    setBusy(false);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    await fetch(`/api/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: editTopic, answer: editAnswer }),
    });
    setEditing(null);
    setBusy(false);
    router.refresh();
  }

  async function toggle(id: string, active: boolean) {
    setBusy(true);
    await fetch(`/api/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  async function seed() {
    setBusy(true);
    const res = await fetch("/api/knowledge/seed", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setError(res.ok ? "" : "הטעינה נכשלה");
    if (res.ok && data.created === 0) setError("התשובות המוכנות כבר קיימות");
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      {items.length === 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            טען את התשובות המוכנות
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
            ניתוק מהחברה הקודמת, ושירות ותמיכה טכנית — בדיוק כפי שהכתבת אותן.
          </div>
          <button className="btn primary" onClick={seed} disabled={busy}>
            {busy ? "טוען..." : "טען"}
          </button>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {prefill ? "למד את העוזר לענות על זה" : "הוסף ידע חדש"}
        </div>
        {prefill && (
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #dde3ea",
              borderRadius: 10,
              padding: 10,
              fontSize: 14,
              marginBottom: 10,
              whiteSpace: "pre-wrap",
            }}
          >
            השאלה של הלקוח: &quot;{prefill}&quot;
          </div>
        )}
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
          העוזר שולח את הטקסט <strong>מילה במילה</strong> כפי שתכתוב אותו כאן.
          הוא לא מנסח מחדש ולא ממציא. מה שלא כתוב כאן — הוא לא עונה עליו.
        </div>

        <input
          className="field"
          placeholder={
            prefill
              ? "תן לזה שם קצר — למשל: חיבור לנטפליקס"
              : "נושא — למשל: חיבור לנטפליקס"
          }
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <textarea
          className="field"
          style={{ height: 110, padding: 12, resize: "vertical" }}
          placeholder="התשובה כפי שתרצה שהעוזר יגיד ללקוח, מילה במילה"
          autoFocus={Boolean(prefill)}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" onClick={add} disabled={busy}>
          {busy ? "שומר..." : "הוסף"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <strong>מאגר הידע ריק</strong>
          עד שתוסיף ידע, העוזר לא ישלח תשובות שירות — הוא רק יפתח לך משימה
          ויתריע. הוא לא ימציא תשובות.
        </div>
      ) : (
        <div className="timeline">
          {items.map((item) => (
            <div
              className="event"
              key={item.id}
              style={{
                borderInlineStartColor: item.active ? "#2563eb" : "#cbd5e1",
                opacity: item.active ? 1 : 0.55,
              }}
            >
              {editing === item.id ? (
                <>
                  <input
                    className="field"
                    value={editTopic}
                    onChange={(e) => setEditTopic(e.target.value)}
                  />
                  <textarea
                    className="field"
                    style={{ height: 110, padding: 12, resize: "vertical" }}
                    value={editAnswer}
                    onChange={(e) => setEditAnswer(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      style={{ height: 40 }}
                      onClick={() => setEditing(null)}
                    >
                      ביטול
                    </button>
                    <button
                      className="btn primary"
                      style={{ height: 40 }}
                      onClick={() => saveEdit(item.id)}
                      disabled={busy}
                    >
                      שמור
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600 }}>{item.topic}</div>
                  <div
                    style={{ fontSize: 14, whiteSpace: "pre-wrap", marginTop: 4 }}
                  >
                    {item.answer}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      className="btn"
                      style={{ height: 40 }}
                      onClick={() => {
                        setEditing(item.id);
                        setEditTopic(item.topic);
                        setEditAnswer(item.answer);
                      }}
                    >
                      ערוך
                    </button>
                    <button
                      className="btn"
                      style={{ height: 40 }}
                      onClick={() => toggle(item.id, !item.active)}
                      disabled={busy}
                    >
                      {item.active ? "כבה" : "הדלק"}
                    </button>
                    <button
                      className="btn"
                      style={{ height: 40, color: "#dc2626" }}
                      onClick={() => remove(item.id)}
                      disabled={busy}
                    >
                      מחק
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
