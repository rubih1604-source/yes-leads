"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readNoteTiming } from "@/lib/note-timing";

/**
 * ============================================================
 *  הערות על הליד
 * ============================================================
 *
 *  **למה זה לא רק תיבת טקסט.**
 *
 *  "נכנס עוד חודש לדירה" היא השורה שמביאה עסקה, ובדיוק
 *  השורה שנשכחת. לכן מה שכתוב כאן נקרא: אם יש בו מועד,
 *  נפתחת תזכורת שלושה ימים לפניו.
 *
 *  **מה שזוהה מוצג לך לפני השמירה.** תזכורת שנפתחת
 *  בשקט לתאריך שגוי היא יותר גרועה מאין תזכורת, כי
 *  אתה סומך עליה.
 */
export default function LeadNotes({
  leadId,
  initial,
}: {
  leadId: string;
  initial: string | null;
}) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const dirty = text.trim() !== (initial ?? "").trim();

  /** אותה קריאה בדיוק שהשרת יעשה - בלי מנגנון שני */
  const timing = readNoteTiming(text, new Date());

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);

    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: text }),
    });

    if (res.ok) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "ההערה לא נשמרה");
    }

    setBusy(false);
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>הערות</div>
      <div
        style={{
          fontSize: 12.5,
          color: "#667085",
          marginBottom: 8,
          lineHeight: 1.65,
        }}
      >
        אם תכתוב מועד — &quot;נכנס עוד חודש לדירה&quot;, &quot;מסיים חוזה
        ב-1.12&quot; — תיפתח תזכורת שלושה ימים לפניו.
      </div>

      <textarea
        className="field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="מה חשוב לזכור על הליד הזה"
        style={{ marginBottom: 8, lineHeight: 1.7, resize: "vertical" }}
      />

      {timing && (
        <div
          style={{
            background: "#f5f9ff",
            border: "1px solid #c7d7ee",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            lineHeight: 1.7,
            marginBottom: 8,
          }}
        >
          זוהה <strong>{timing.label}</strong> ·{" "}
          {timing.dueAt.toLocaleDateString("he-IL")}
          <div style={{ color: "#475467" }}>
            התראה ב-{timing.remindAt.toLocaleDateString("he-IL")}
          </div>
        </div>
      )}

      {text.trim() && !timing && (
        <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 8 }}>
          לא זוהה מועד — ההערה תישמר בלי תזכורת.
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <button
        className="btn primary"
        onClick={save}
        disabled={busy || !dirty}
        style={{ height: 40 }}
      >
        {busy ? "שומר..." : saved ? "נשמר ✓" : "שמור הערה"}
      </button>
    </div>
  );
}
