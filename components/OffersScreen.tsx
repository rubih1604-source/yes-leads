"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OfferRow = {
  id: string;
  title: string;
  price: string | null;
  decoders: string | null;
  streaming: string | null;
  sports: string | null;
  freeText: string | null;
  targets: { statuses: string[]; subStatuses: string[] };
  active: boolean;
};

export type SubStatusOption = { statusName: string; name: string };
export type StatusOption = { name: string; color: string };
export type TemplateChoice = { name: string; displayName: string | null };

function OfferForm({
  statuses,
  subStatuses,
  existing,
  onDone,
}: {
  statuses: StatusOption[];
  subStatuses: SubStatusOption[];
  existing?: OfferRow;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [price, setPrice] = useState(existing?.price ?? "");
  const [decoders, setDecoders] = useState(existing?.decoders ?? "");
  const [streaming, setStreaming] = useState(existing?.streaming ?? "");
  const [sports, setSports] = useState(existing?.sports ?? "");
  const [freeText, setFreeText] = useState(existing?.freeText ?? "");
  const [statusTargets, setStatusTargets] = useState<string[]>(
    existing?.targets.statuses ?? []
  );
  const [subTargets, setSubTargets] = useState<string[]>(
    existing?.targets.subStatuses ?? []
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allStatusNames = statuses.map((s) => s.name);
  const allSubNames = subStatuses.map((s) => s.name);

  const everythingSelected =
    allStatusNames.every((n) => statusTargets.includes(n)) &&
    allSubNames.every((n) => subTargets.includes(n)) &&
    (allStatusNames.length > 0 || allSubNames.length > 0);

  function toggleStatus(name: string) {
    setStatusTargets((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  function toggleSub(name: string) {
    setSubTargets((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  function toggleEverything() {
    if (everythingSelected) {
      setStatusTargets([]);
      setSubTargets([]);
    } else {
      setStatusTargets(allStatusNames);
      setSubTargets(allSubNames);
    }
  }

  const totalSelected = statusTargets.length + subTargets.length;

  async function save() {
    if (!title.trim()) {
      setError("צריך שם למבצע");
      return;
    }
    setBusy(true);
    setError("");

    const payload = {
      title,
      price,
      decoders,
      streaming,
      sports,
      freeText,
      targets: { statuses: statusTargets, subStatuses: subTargets },
    };

    const res = existing
      ? await fetch(`/api/offers/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {existing ? "עריכת מבצע" : "מבצע חדש"}
      </div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        הפרטים כאן הם ההגדרה שלך למבצע — לפיהם תדע איזו תבנית להכין
        ולמי לשלוח. ההודעה עצמה נשלחת מתבנית מאושרת בטקסטר.
      </div>

      <input
        className="field"
        placeholder="שם המבצע — למשל: מבצע ספורט אוגוסט"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="field"
        placeholder="מחיר החבילה"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <input
        className="field"
        placeholder="כמות ממירים"
        value={decoders}
        onChange={(e) => setDecoders(e.target.value)}
      />
      <input
        className="field"
        placeholder="הטבות סטרימינג"
        value={streaming}
        onChange={(e) => setStreaming(e.target.value)}
      />
      <input
        className="field"
        placeholder="הטבות ספורט"
        value={sports}
        onChange={(e) => setSports(e.target.value)}
      />
      <textarea
        className="field"
        style={{ height: 90, padding: 12, resize: "vertical" }}
        placeholder="פרטים נוספים"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
      />

      <div style={{ fontSize: 13, fontWeight: 600, margin: "6px 2px 8px" }}>
        למי המבצע הזה מתאים
        {totalSelected > 0 && (
          <span style={{ color: "#98a2b3", fontWeight: 400 }}>
            {" "}
            · {totalSelected} נבחרו
          </span>
        )}
      </div>

      <button
        className="status-option"
        data-current={everythingSelected}
        onClick={toggleEverything}
      >
        <span
          className="dot"
          style={{ background: everythingSelected ? "#12805c" : "#dbe3ea" }}
        />
        <span style={{ fontWeight: 700 }}>הכל</span>
      </button>

      <div style={{ fontSize: 12.5, fontWeight: 700, margin: "12px 2px 6px", color: "#98a2b3" }}>
        לפי סטטוס
      </div>

      {statuses.map((st) => (
        <button
          key={st.name}
          className="status-option"
          data-current={statusTargets.includes(st.name)}
          onClick={() => toggleStatus(st.name)}
        >
          <span
            className="dot"
            style={{
              background: statusTargets.includes(st.name) ? "#12805c" : "#dbe3ea",
            }}
          />
          <span style={{ textAlign: "start" }}>{st.name}</span>
          <span
            className="dot"
            style={{
              background: st.color,
              marginInlineStart: "auto",
              width: 9,
              height: 9,
            }}
          />
        </button>
      ))}

      <div style={{ fontSize: 12.5, fontWeight: 700, margin: "12px 2px 6px", color: "#98a2b3" }}>
        לפי מה שחשוב ללקוח
      </div>

      {subStatuses.length === 0 ? (
        <div className="empty" style={{ margin: "0 0 10px" }}>
          <strong>אין עדיין תת-סטטוסים</strong>
          אפשר להוסיף אותם בהגדרות.
        </div>
      ) : (
        subStatuses.map((sub) => (
          <button
            key={sub.name}
            className="status-option"
            data-current={subTargets.includes(sub.name)}
            onClick={() => toggleSub(sub.name)}
          >
            <span
              className="dot"
              style={{
                background: subTargets.includes(sub.name) ? "#12805c" : "#dbe3ea",
              }}
            />
            <span style={{ textAlign: "start" }}>
              {sub.name}
              <span style={{ display: "block", fontSize: 12, color: "#98a2b3" }}>
                {sub.statusName}
              </span>
            </span>
          </button>
        ))
      )}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="btn" onClick={onDone} disabled={busy}>
          ביטול
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  statuses,
  subStatuses,
  templates,
  onChanged,
}: {
  offer: OfferRow;
  statuses: StatusOption[];
  subStatuses: SubStatusOption[];
  templates: TemplateChoice[];
  onChanged: () => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  async function loadCount() {
    setBusy(true);
    const res = await fetch(`/api/offers/${offer.id}/send`);
    const data = await res.json().catch(() => ({}));
    setCount(typeof data.count === "number" ? data.count : 0);
    setBusy(false);
  }

  async function send() {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/offers/${offer.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateName: template }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(
      res.ok
        ? `${data.scheduled} הודעות נכנסו לתור. הן ייצאו בקצב מבוקר — אפשר לעקוב במסך "מה המנוע עשה".`
        : data.error || "הדיוור נכשל"
    );
    setConfirming(false);
    setBusy(false);
    onChanged();
  }

  if (editing) {
    return (
      <OfferForm
        statuses={statuses}
        subStatuses={subStatuses}
        existing={offer}
        onDone={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  const details = [
    offer.price ? `מחיר: ${offer.price}` : null,
    offer.decoders ? `ממירים: ${offer.decoders}` : null,
    offer.streaming ? `סטרימינג: ${offer.streaming}` : null,
    offer.sports ? `ספורט: ${offer.sports}` : null,
  ].filter(Boolean);

  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 17 }}>{offer.title}</div>

      {details.length > 0 && (
        <div style={{ fontSize: 14, color: "#475467", marginTop: 6 }}>
          {details.join(" · ")}
        </div>
      )}

      {offer.freeText && (
        <div
          style={{
            fontSize: 14,
            marginTop: 8,
            whiteSpace: "pre-wrap",
            color: "#475467",
          }}
        >
          {offer.freeText}
        </div>
      )}

      <div style={{ fontSize: 13, color: "#98a2b3", marginTop: 8 }}>
        {offer.targets.statuses.length + offer.targets.subStatuses.length > 0
          ? [
              offer.targets.statuses.length
                ? `סטטוסים: ${offer.targets.statuses.join(" · ")}`
                : null,
              offer.targets.subStatuses.length
                ? `חשוב ללקוח: ${offer.targets.subStatuses.join(" · ")}`
                : null,
            ]
              .filter(Boolean)
              .join("  |  ")
          : "לא נבחר קהל יעד"}
      </div>

      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn" style={{ height: 42 }} onClick={loadCount} disabled={busy}>
          {count === null ? "כמה לידים מתאימים?" : `${count} לידים`}
        </button>
        <button
          className="btn"
          style={{ height: 42 }}
          onClick={() => setEditing(true)}
        >
          ערוך
        </button>
      </div>

      {count !== null && count > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, margin: "14px 2px 8px" }}>
            באיזו תבנית לשלוח
          </div>
          <select
            className="field"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">— בחר תבנית מטקסטר —</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.displayName || t.name}
              </option>
            ))}
          </select>

          {confirming ? (
            <div className="actions">
              <button className="btn" onClick={() => setConfirming(false)}>
                ביטול
              </button>
              <button
                className="btn primary"
                onClick={send}
                disabled={busy}
                style={{ background: "#b54708", borderColor: "#b54708" }}
              >
                {busy ? "שולח..." : `כן, שלח ל-${count}`}
              </button>
            </div>
          ) : (
            <button
              className="btn primary"
              onClick={() => setConfirming(true)}
              disabled={!template || busy}
            >
              שלח דיוור ל-{count} לידים
            </button>
          )}
        </>
      )}

      {message && (
        <div style={{ marginTop: 10, fontSize: 14 }}>{message}</div>
      )}
    </div>
  );
}

export default function OffersScreen({
  offers,
  statuses,
  subStatuses,
  templates,
}: {
  offers: OfferRow[];
  statuses: StatusOption[];
  subStatuses: SubStatusOption[];
  templates: TemplateChoice[];
}) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  return (
    <>
      {adding ? (
        <OfferForm
          statuses={statuses}
          subStatuses={subStatuses}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : (
        <div className="card">
          <button className="btn primary" onClick={() => setAdding(true)}>
            מבצע חדש
          </button>
        </div>
      )}

      {offers.length === 0 && !adding ? (
        <div className="empty">
          <strong>אין מבצעים</strong>
          הגדר מבצע, סמן למי הוא מתאים, והמערכת תבנה לך את רשימת הלידים.
        </div>
      ) : (
        offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            statuses={statuses}
            subStatuses={subStatuses}
            templates={templates}
            onChanged={() => router.refresh()}
          />
        ))
      )}
    </>
  );
}
