"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type KnowledgeRow = {
  id: string;
  topic: string;
  answer: string;
  active: boolean;
};

export default function KnowledgeScreen({ items }: { items: KnowledgeRow[] }) {
  const [topic, setTopic] = useState("");
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

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>הוסף ידע חדש</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
          כל מה שתכתוב כאן - העוזר יידע לענות עליו ללקוחות. מה שלא כתוב כאן,
          הוא לא ימציא.
        </div>

        <input
          className="field"
          placeholder="נושא — למשל: חיבור לנטפליקס"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <textarea
          className="field"
          style={{ height: 110, padding: 12, resize: "vertical" }}
          placeholder="התשובה כפי שתרצה שהעוזר יגיד ללקוח"
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
          עד שתוסיף ידע, העוזר יענה ללקוח &quot;אני בודק ונחזור אליך&quot;
          ויפתח לך משימה. הוא לא ימציא תשובות.
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
