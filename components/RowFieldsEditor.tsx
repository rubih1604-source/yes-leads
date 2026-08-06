"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROW_FIELDS, type RowFieldKey } from "@/lib/row-fields";

/**
 * בוחר מה מוצג בשורת הליד.
 * הסדר שבו תסמן הוא הסדר שבו זה יופיע.
 */
export default function RowFieldsEditor({
  current,
}: {
  current: RowFieldKey[];
}) {
  const [picked, setPicked] = useState<RowFieldKey[]>(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  function toggle(key: RowFieldKey) {
    setPicked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadRowFields: picked }),
    });
    setMessage(res.ok ? "נשמר" : "השמירה נכשלה");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        מה מוצג בשורת הליד
      </div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 14 }}>
        השם תמיד מוצג. סמן מה עוד תרצה לראות — הסדר שתסמן הוא הסדר שיופיע.
        {picked.length > 0 && (
          <span style={{ color: "#98a2b3" }}> · {picked.length} נבחרו</span>
        )}
      </div>

      {ROW_FIELDS.map((field) => {
        const index = picked.indexOf(field.key);
        const on = index >= 0;
        return (
          <button
            key={field.key}
            className="status-option"
            data-current={on}
            onClick={() => toggle(field.key)}
          >
            <span
              className="dot"
              style={{ background: on ? "#12805c" : "#dbe3ea" }}
            />
            <span style={{ textAlign: "start" }}>
              {field.label}
              {field.hint && (
                <span
                  style={{ display: "block", fontSize: 12, color: "#98a2b3" }}
                >
                  {field.hint}
                </span>
              )}
            </span>
            {on && (
              <span
                style={{
                  marginInlineStart: "auto",
                  color: "#98a2b3",
                  fontSize: 13,
                }}
              >
                {index + 1}
              </span>
            )}
          </button>
        );
      })}

      {message && (
        <div style={{ margin: "8px 2px", fontSize: 14 }}>{message}</div>
      )}

      <button className="btn primary" onClick={save} disabled={busy}>
        {busy ? "שומר..." : "שמור תצוגה"}
      </button>
    </div>
  );
}
