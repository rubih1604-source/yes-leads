"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type TaskRow = {
  id: string;
  leadId: string | null;
  title: string;
  body: string | null;
  dueAt: string | null;
  needsReview: boolean;
  urgent: boolean;
  createdAt: string;
};

function formatDue(iso: string | null): string {
  if (!iso) return "בלי שעה";
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TodayScreen({ tasks }: { tasks: TaskRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  async function complete(id: string) {
    setBusy(id);
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    setBusy(null);
    router.refresh();
  }

  if (tasks.length === 0) {
    return (
      <div className="empty">
        <strong>אין משימות פתוחות</strong>
        כשלקוח יענה או יבקש שתחזור אליו, המשימה תופיע כאן.
      </div>
    );
  }

  const overdue = Date.now();

  return (
    <div className="timeline" style={{ marginTop: 16 }}>
      {tasks.map((t) => {
        const late = t.dueAt ? new Date(t.dueAt).getTime() < overdue : false;
        return (
          <div
            className="event"
            key={t.id}
            style={{
              borderInlineStartColor: t.urgent
                ? "#16a34a"
                : t.needsReview
                ? "#f59e0b"
                : "#2563eb",
              borderInlineStartWidth: t.urgent ? 5 : 3,
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {t.urgent && "🔥 "}
              {t.title}
            </div>

            {t.body && (
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", marginTop: 4 }}>
                {t.body}
              </div>
            )}

            <div className="when">
              {formatDue(t.dueAt)}
              {late && t.dueAt ? " · עבר הזמן" : ""}
              {t.needsReview ? " · צריך בדיקה שלך" : ""}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {t.leadId && (
                <Link
                  href={`/leads/${t.leadId}`}
                  className="btn"
                  style={{ height: 40, textDecoration: "none" }}
                >
                  פתח ליד
                </Link>
              )}
              <button
                className="btn primary"
                style={{ height: 40 }}
                onClick={() => complete(t.id)}
                disabled={busy !== null}
              >
                {busy === t.id ? "שומר..." : "בוצע"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
