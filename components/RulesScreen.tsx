"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusColor, type StatusDef } from "@/lib/statuses";

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

export type TemplateChoice = { name: string; displayName: string | null };

function humanDelay(minutes: number): string {
  if (minutes < 60) return `אחרי ${minutes} דקות`;
  if (minutes < 60 * 24) {
    const h = minutes / 60;
    return `אחרי ${Number.isInteger(h) ? h : h.toFixed(1)} שעות`;
  }
  const d = minutes / (60 * 24);
  return `אחרי ${Number.isInteger(d) ? d : d.toFixed(1)} ימים`;
}

/** מפרק דקות למספר + יחידה נוחה לעריכה */
function splitDelay(minutes: number): { amount: number; unit: string } {
  if (minutes % (60 * 24) === 0 && minutes >= 60 * 24)
    return { amount: minutes / (60 * 24), unit: "days" };
  if (minutes % 60 === 0 && minutes >= 60)
    return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

function toMinutes(amount: number, unit: string): number {
  if (unit === "days") return amount * 60 * 24;
  if (unit === "hours") return amount * 60;
  return amount;
}


function AddRule({
  statuses,
  templates,
  onDone,
}: {
  statuses: StatusDef[];
  templates: TemplateChoice[];
  onDone: () => void;
}) {
  const [triggerStatus, setTriggerStatus] = useState("");
  const [action, setAction] = useState("send_template");
  const [templateName, setTemplateName] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const [amount, setAmount] = useState("5");
  const [unit, setUnit] = useState("minutes");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");

    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        triggerStatus,
        action,
        templateName,
        targetStatus,
        delayMinutes: toMinutes(Number(amount), unit),
        note,
      }),
    });

    if (res.ok) {
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "השמירה נכשלה");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>חוק חדש</div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        כשליד עובר לסטטוס מסוים — מה יקרה, ואחרי כמה זמן.
        השליחה מדויקת עד כדי דקה, ונדחית אוטומטית לשעות הפעילות.
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        כשהליד עובר לסטטוס
      </div>
      <select
        className="field"
        value={triggerStatus}
        onChange={(e) => setTriggerStatus(e.target.value)}
      >
        <option value="">— בחר סטטוס —</option>
        {statuses.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        אחרי כמה זמן
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          className="field"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ marginBottom: 0, flex: 1 }}
        />
        <select
          className="field"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          style={{ marginBottom: 0, flex: 1 }}
        >
          <option value="minutes">דקות</option>
          <option value="hours">שעות</option>
          <option value="days">ימים</option>
        </select>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        מה יקרה
      </div>
      <select
        className="field"
        value={action}
        onChange={(e) => setAction(e.target.value)}
      >
        <option value="send_template">שלח תבנית ללקוח</option>
        <option value="notify">התרע לי</option>
        <option value="set_status">העבר לסטטוס אחר</option>
      </select>

      {action === "send_template" && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            איזו תבנית
          </div>
          <select
            className="field"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          >
            <option value="">— בחר תבנית —</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.displayName || t.name}
              </option>
            ))}
          </select>
        </>
      )}

      {action === "set_status" && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            לאיזה סטטוס
          </div>
          <select
            className="field"
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value)}
          >
            <option value="">— בחר סטטוס —</option>
            {statuses
              .filter((s) => s.name !== triggerStatus)
              .map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
          </select>
        </>
      )}

      <input
        className="field"
        placeholder="הערה לעצמך (לא חובה)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="btn" onClick={onDone} disabled={busy}>
          ביטול
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "שומר..." : "צור חוק"}
        </button>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  templates,
  color,
  onChanged,
}: {
  rule: RuleRow;
  templates: TemplateChoice[];
  color: string;
  onChanged: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initial = splitDelay(rule.delayMinutes);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(initial.amount));
  const [unit, setUnit] = useState(initial.unit);
  const [templateName, setTemplateName] = useState(rule.templateName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "השמירה נכשלה");
    }
    setBusy(false);
    onChanged();
  }

  async function save() {
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0) {
      setError("הכנס מספר תקין");
      return;
    }
    await patch({
      delayMinutes: toMinutes(num, unit),
      ...(rule.action === "send_template" ? { templateName } : {}),
    });
    setEditing(false);
  }

  return (
    <div
      className="event"
      style={{
        borderInlineStartColor: rule.active ? color : "#cbd5e1",
        opacity: rule.active ? 1 : 0.55,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {humanDelay(rule.delayMinutes)}
        {rule.action === "send_template" && " · שלח תבנית"}
        {rule.action === "notify" && " · התרע לי"}
        {rule.action === "set_status" && ` · העבר ל"${rule.targetStatus}"`}
      </div>

      {rule.templateName && !editing && (
        <div
          style={{
            direction: "ltr",
            textAlign: "left",
            fontSize: 12,
            color: "#64748b",
          }}
        >
          {rule.templateName}
        </div>
      )}

      {rule.note && !editing && <div className="when">{rule.note}</div>}

      {editing && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <select
              className="field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            >
              <option value="minutes">דקות</option>
              <option value="hours">שעות</option>
              <option value="days">ימים</option>
            </select>
          </div>

          {rule.action === "send_template" && (
            <select
              className="field"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            >
              <option value="">— בחר תבנית —</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.displayName || t.name}
                </option>
              ))}
              {templateName &&
                !templates.some((t) => t.name === templateName) && (
                  <option value={templateName}>
                    {templateName} (לא קיימת בטקסטר)
                  </option>
                )}
            </select>
          )}

          {error && <div className="error">{error}</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {editing ? (
          <>
            <button
              className="btn"
              style={{ height: 40 }}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              disabled={busy}
            >
              ביטול
            </button>
            <button
              className="btn primary"
              style={{ height: 40 }}
              onClick={save}
              disabled={busy}
            >
              {busy ? "שומר..." : "שמור"}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn"
              style={{ height: 40 }}
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              ערוך
            </button>
            <button
              className="btn"
              style={{ height: 40 }}
              onClick={() => patch({ active: !rule.active })}
              disabled={busy}
            >
              {rule.active ? "כבה" : "הדלק"}
            </button>
            {confirmDelete ? (
              <button
                className="btn"
                style={{ height: 40, color: "#b42318", fontWeight: 700 }}
                onClick={async () => {
                  setBusy(true);
                  await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
                  setBusy(false);
                  onChanged();
                }}
                disabled={busy}
              >
                בטוח?
              </button>
            ) : (
              <button
                className="btn"
                style={{ height: 40, color: "#b42318" }}
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                מחק
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function RulesScreen({
  rules,
  templates,
  statuses,
}: {
  rules: RuleRow[];
  templates: TemplateChoice[];
  statuses: StatusDef[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  async function seed() {
    setBusy(true);
    const res = await fetch("/api/rules/seed", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `נוספו ${data.created} חוקים` : data.error || "נכשל");
    setBusy(false);
    router.refresh();
  }

  const byStatus = rules.reduce<Record<string, RuleRow[]>>((acc, r) => {
    (acc[r.triggerStatus] ||= []).push(r);
    return acc;
  }, {});

  return (
    <>
      {adding ? (
        <AddRule
          statuses={statuses}
          templates={templates}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : (
        <div className="card">
          <div className="actions">
            <button className="btn primary" onClick={() => setAdding(true)}>
              הוסף חוק
            </button>
            {rules.length === 0 && (
              <button className="btn" onClick={seed} disabled={busy}>
                {busy ? "טוען..." : "טען ברירת מחדל"}
              </button>
            )}
          </div>
          {message && (
            <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
          )}
        </div>
      )}

      {rules.length === 0 && (
        <div className="empty">
          <strong>אין עדיין חוקים</strong>
          לחץ על הכפתור למעלה כדי לטעון את החוקים שהגדרנו.
        </div>
      )}

      {Object.entries(byStatus).map(([status, list]) => (
        <div key={status}>
          <div className="section-title" style={{ color: statusColor(status, statuses) }}>
            {status}
          </div>
          <div className="timeline">
            {list
              .sort((a, b) => a.stepIndex - b.stepIndex)
              .map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  templates={templates}
                  color={statusColor(status, statuses)}
                  onChanged={() => router.refresh()}
                />
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
