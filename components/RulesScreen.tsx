"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusColor } from "@/lib/statuses";

export type RuleRow = {
  id: string;
  triggerStatus: string;
  stepIndex: number;
  delayMinutes: number;
  action: string;
  templateName: string | null;
  targetStatus: string | null;
  note: string | null;
  active: boolean;
};

function humanDelay(minutes: number): string {
  if (minutes < 60) return `אחרי ${minutes} דקות`;
  if (minutes < 60 * 24) {
    const h = Math.round(minutes / 60);
    return `אחרי ${h} שעות`;
  }
  const d = Math.round(minutes / (60 * 24));
  return `אחרי ${d} ימים`;
}

export default function RulesScreen({ rules }: { rules: RuleRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function seed() {
    setBusy("seed");
    const res = await fetch("/api/rules/seed", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `נוספו ${data.created} חוקים` : data.error || "נכשל");
    setBusy(null);
    router.refresh();
  }

  async function toggle(id: string, active: boolean) {
    setBusy(id);
    await fetch(`/api/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setBusy(null);
    router.refresh();
  }

  const byStatus = rules.reduce<Record<string, RuleRow[]>>((acc, r) => {
    (acc[r.triggerStatus] ||= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <div className="card">
        <button className="btn primary" onClick={seed} disabled={busy !== null}>
          {busy === "seed" ? "טוען..." : "טען חוקי ברירת מחדל"}
        </button>
        {message && (
          <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
        )}
      </div>

      {rules.length === 0 && (
        <div className="empty">
          <strong>אין עדיין חוקים</strong>
          לחץ על הכפתור למעלה כדי לטעון את החוקים שהגדרנו.
        </div>
      )}

      {Object.entries(byStatus).map(([status, list]) => (
        <div key={status}>
          <div className="section-title" style={{ color: statusColor(status) }}>
            {status}
          </div>
          <div className="timeline">
            {list
              .sort((a, b) => a.stepIndex - b.stepIndex)
              .map((r) => (
                <div
                  className="event"
                  key={r.id}
                  style={{
                    borderInlineStartColor: r.active ? statusColor(status) : "#cbd5e1",
                    opacity: r.active ? 1 : 0.55,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {humanDelay(r.delayMinutes)}
                    {r.action === "send_template" && " · שלח תבנית"}
                    {r.action === "notify" && " · התרע לי"}
                    {r.action === "set_status" && ` · העבר ל"${r.targetStatus}"`}
                  </div>
                  {r.templateName && (
                    <div
                      style={{
                        direction: "ltr",
                        textAlign: "left",
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      {r.templateName}
                    </div>
                  )}
                  {r.note && <div className="when">{r.note}</div>}

                  <button
                    className="btn"
                    style={{ marginTop: 10, height: 40 }}
                    onClick={() => toggle(r.id, !r.active)}
                    disabled={busy !== null}
                  >
                    {r.active ? "כבה חוק" : "הדלק חוק"}
                  </button>
                </div>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
