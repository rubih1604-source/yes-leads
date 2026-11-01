"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusColor, type StatusDef } from "@/lib/statuses";
import { parsePool, poolLabel } from "@/lib/template-pool";

export type RuleRow = {
  id: string;
  triggerStatus: string;
  stepIndex: number;
  delayMinutes: number;
  action: string;
  templateName: string | null;
  /** בנק תבניות מתחלפות, מופרדות בפסיק */
  templatePool: string | null;
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


/**
 * ============================================================
 *  בוחר בנק התבניות
 * ============================================================
 *
 *  **למה בחירה מרובה ולא תבנית אחת.**
 *
 *  כשיש שלוש תבניות לאותו שלב, הן יוצאות בסבב שווה -
 *  ליד ראשון מקבל את הראשונה, שני את השנייה וכן הלאה.
 *  חלוקה שווה היא מה שמאפשר להשוות ניסוחים: אם אחת
 *  הייתה יוצאת יותר, לא היה אפשר לדעת אם היא ניצחה או
 *  רק קיבלה יותר הזדמנויות.
 *
 *  תבנית אחת מסומנת = בדיוק ההתנהגות הישנה.
 */
function PoolPicker({
  templates,
  selected,
  onChange,
}: {
  templates: TemplateChoice[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(name: string) {
    onChange(
      selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name]
    );
  }

  /** תבניות שמופו בחוק אבל כבר לא קיימות בטקסטר - לא נעלמות מהמסך */
  const missing = selected.filter(
    (name) => !templates.some((t) => t.name === name)
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        אילו תבניות ישלחו
      </div>
      <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 8, lineHeight: 1.6 }}>
        סימון של יותר מאחת מפעיל סבב שווה ביניהן, כדי שתוכל לדעת
        איזה ניסוח מביא יותר תגובות.
      </div>

      <div
        style={{
          border: "1px solid #dbe3ea",
          borderRadius: 9,
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        {templates.length === 0 && (
          <div style={{ padding: 10, fontSize: 13, color: "#667085" }}>
            אין עדיין תבניות מאושרות
          </div>
        )}
        {templates.map((t) => {
          const on = selected.includes(t.name);
          return (
            <label
              key={t.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 11px",
                borderBottom: "1px solid #f2f4f7",
                background: on ? "#f5f9ff" : "#fff",
                cursor: "pointer",
                fontSize: 13.5,
              }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(t.name)}
                style={{ width: 17, height: 17, flexShrink: 0 }}
              />
              <span>{t.displayName || t.name}</span>
            </label>
          );
        })}
        {missing.map((name) => (
          <label
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "9px 11px",
              borderBottom: "1px solid #f2f4f7",
              background: "#fffbeb",
              cursor: "pointer",
              fontSize: 13.5,
            }}
          >
            <input
              type="checkbox"
              checked
              onChange={() => toggle(name)}
              style={{ width: 17, height: 17, flexShrink: 0 }}
            />
            <span>{name} · לא קיימת בטקסטר</span>
          </label>
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: "#475467", marginTop: 6 }}>
        {poolLabel(selected.join(","))}
      </div>
    </div>
  );
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
  const [pool, setPool] = useState<string[]>([]);
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
        /** תבנית אחת נשמרת כתבנית אחת; יותר מאחת נשמרות כבנק */
        templateName: pool.length === 1 ? pool[0] : "",
        templatePool: pool.length > 1 ? pool : [],
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
        <PoolPicker
          templates={templates}
          selected={pool}
          onChange={setPool}
        />
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
  /**
   * הבנק והתבנית הבודדת הם אותה שאלה במסך אחד: מה יישלח.
   * תבנית בודדת ישנה נטענת כבנק של אחת, ולכן אין שתי
   * דרכים לערוך את אותו דבר.
   */
  const [pool, setPool] = useState<string[]>(() => {
    const fromPool = parsePool(rule.templatePool);
    if (fromPool.length > 0) return fromPool;
    return rule.templateName ? [rule.templateName] : [];
  });
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
    if (rule.action === "send_template" && pool.length === 0) {
      setError("צריך לסמן לפחות תבנית אחת");
      return;
    }

    await patch({
      delayMinutes: toMinutes(num, unit),
      ...(rule.action === "send_template"
        ? {
            templateName: pool[0] ?? "",
            templatePool: pool.length > 1 ? pool : [],
          }
        : {}),
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

      {!editing && pool.length > 0 && (
        <>
          <div
            style={{
              direction: "ltr",
              textAlign: "left",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {pool.join(" · ")}
          </div>
          {pool.length > 1 && (
            <div style={{ fontSize: 12, color: "#0891b2", fontWeight: 600 }}>
              {poolLabel(pool.join(","))}
            </div>
          )}
        </>
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
            <PoolPicker
              templates={templates}
              selected={pool}
              onChange={setPool}
            />
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
