"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * המשימות של הליד, בתוך הכרטיס שלו.
 *
 * עד היום היומן רק ציין שנוצרה משימה - בלי לומר איזו.
 * כאן רואים את הכותרת, הפרטים, השעה שנקבעה, והאם כבר יצא
 * עליה מייל. אפשר גם לסמן בוצע בלי לצאת מהכרטיס.
 */

type Task = {
  id: string;
  title: string;
  body: string | null;
  dueAt: string | null;
  urgent: boolean;
  needsReview: boolean;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
  notifiedAt: string | null;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadTasks({ leadId }: { leadId: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        cache: "no-store",
      });
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch {
      setTasks([]);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  async function complete(id: string, done: boolean) {
    setBusy(id);
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    setBusy(null);
    load();
  }

  if (tasks === null || tasks.length === 0) return null;

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const list = showDone ? done : open;

  return (
    <>
      <div className="section-title">
        משימות
        {open.length > 0 && (
          <span style={{ color: "#1b4d8f" }}> · {open.length} פתוחות</span>
        )}
      </div>

      {done.length > 0 && (
        <div className="filters" style={{ paddingTop: 0 }}>
          <button
            className="chip"
            data-active={!showDone}
            onClick={() => setShowDone(false)}
          >
            פתוחות {open.length}
          </button>
          <button
            className="chip"
            data-active={showDone}
            onClick={() => setShowDone(true)}
          >
            בוצעו {done.length}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty" style={{ margin: "0 16px" }}>
          <strong>אין משימות פתוחות</strong>
          הכל טופל.
        </div>
      ) : (
        <div className="timeline">
          {list.map((task) => {
            const late =
              !task.done &&
              task.dueAt !== null &&
              new Date(task.dueAt).getTime() < Date.now();

            return (
              <div
                className="event"
                key={task.id}
                style={{
                  borderInlineStartColor: task.done
                    ? "#98a2b3"
                    : task.urgent
                    ? "#12805c"
                    : late
                    ? "#b42318"
                    : task.needsReview
                    ? "#b54708"
                    : "#1b4d8f",
                  borderInlineStartWidth: task.urgent && !task.done ? 5 : 3,
                  opacity: task.done ? 0.65 : 1,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {task.urgent && !task.done && "🔥 "}
                  {task.title}
                </div>

                {task.body && (
                  <div
                    style={{
                      fontSize: 14,
                      whiteSpace: "pre-wrap",
                      marginTop: 4,
                      color: "#475467",
                    }}
                  >
                    {task.body}
                  </div>
                )}

                <div className="when">
                  {task.dueAt ? (
                    <>
                      לשעה {formatWhen(task.dueAt)}
                      {late && " · עבר הזמן"}
                    </>
                  ) : (
                    "בלי שעה"
                  )}
                  {task.needsReview && !task.done && " · צריך בדיקה שלך"}
                  {task.notifiedAt && " · נשלחה תזכורת"}
                  {task.done && task.doneAt && ` · בוצע ${formatWhen(task.doneAt)}`}
                </div>

                <div style={{ marginTop: 10 }}>
                  <button
                    className={task.done ? "btn" : "btn primary"}
                    style={{ height: 40 }}
                    onClick={() => complete(task.id, !task.done)}
                    disabled={busy !== null}
                  >
                    {busy === task.id
                      ? "שומר..."
                      : task.done
                      ? "החזר לפתוחות"
                      : "בוצע"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
