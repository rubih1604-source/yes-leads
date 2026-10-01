"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DIALER_PRESETS,
  DEFAULT_DIALER,
  dialHref,
  type DialerPreset,
} from "@/lib/dialer";

/**
 * ============================================================
 *  בחירת חייגן
 * ============================================================
 *
 *  כפתור החיוג במערכת פותח `tel:` כברירת מחדל, וזה תמיד
 *  מגיע לחייגן של המכשיר. כאן בוחרים לאן הוא ילך במקום.
 *
 *  נייד ומחשב נבחרים בנפרד, כי זו לא אותה אפליקציה.
 *
 *  יש גם אפשרות להזין תבנית בעצמך, כדי שאפליקציה שלא
 *  ברשימה תעבוד בלי שאצטרך לשנות קוד.
 */

const TEST_NUMBER = "0501234567";

function PresetPicker({
  title,
  hint,
  where,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  where: "mobile" | "desktop";
  value: string;
  onChange: (template: string) => void;
}) {
  const options = DIALER_PRESETS.filter(
    (p) => p.where === where || p.where === "both"
  );

  const matched = options.find((p) => p.template === value);
  const [custom, setCustom] = useState(matched ? "" : value);
  const isCustom = !matched;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#475467", margin: "3px 0 10px" }}>
        {hint}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {options.map((opt: DialerPreset) => (
          <label
            key={opt.id}
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              padding: "8px 10px",
              borderRadius: 9,
              border: `1px solid ${
                value === opt.template ? "#1b4d8f" : "#dbe3ea"
              }`,
              background: value === opt.template ? "#f2f7fd" : "#fff",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name={`dialer-${where}`}
              checked={value === opt.template}
              onChange={() => onChange(opt.template)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ fontWeight: 500 }}>{opt.label}</span>
              {opt.note && (
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "#667085",
                  }}
                >
                  {opt.note}
                </span>
              )}
            </span>
          </label>
        ))}

        {/* תבנית משלך - לאפליקציה שלא ברשימה */}
        <label
          style={{
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
            padding: "8px 10px",
            borderRadius: 9,
            border: `1px solid ${isCustom ? "#1b4d8f" : "#dbe3ea"}`,
            background: isCustom ? "#f2f7fd" : "#fff",
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name={`dialer-${where}`}
            checked={isCustom}
            onChange={() => onChange(custom || "sip:{phone}")}
            style={{ marginTop: 3 }}
          />
          <span style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>אפליקציה אחרת</span>
            <span
              style={{ display: "block", fontSize: 12.5, color: "#667085" }}
            >
              הזן תבנית. המילה {"{phone}"} תוחלף במספר
            </span>
            {isCustom && (
              <input
                className="search"
                style={{ marginTop: 7, width: "100%", direction: "ltr" }}
                value={custom}
                placeholder="myapp:{phone}"
                onChange={(e) => {
                  setCustom(e.target.value);
                  onChange(e.target.value);
                }}
              />
            )}
          </span>
        </label>
      </div>

      {/* בדיקה - רואים מיד מה ייפתח */}
      <div
        style={{
          marginTop: 11,
          paddingTop: 11,
          borderTop: "1px solid #eef2f7",
          fontSize: 13,
        }}
      >
        <div style={{ color: "#475467", marginBottom: 5 }}>
          כך ייראה הקישור:
        </div>
        <code
          style={{
            direction: "ltr",
            display: "block",
            background: "#f8fafc",
            padding: "7px 9px",
            borderRadius: 7,
            fontSize: 12.5,
            wordBreak: "break-all",
          }}
        >
          {dialHref(value, TEST_NUMBER)}
        </code>
        <a
          href={dialHref(value, TEST_NUMBER)}
          style={{ display: "inline-block", marginTop: 8, color: "#1b4d8f" }}
        >
          נסה עכשיו (מספר דמה)
        </a>
      </div>
    </div>
  );
}

export default function DialerSettings({
  mobile,
  desktop,
}: {
  mobile: string;
  desktop: string;
}) {
  const [m, setM] = useState(mobile || DEFAULT_DIALER);
  const [d, setD] = useState(desktop || DEFAULT_DIALER);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function save() {
    if (!m.includes("{phone}") || !d.includes("{phone}")) {
      setMessage("התבנית חייבת לכלול {phone} — אחרת אין לאן לחייג");
      return;
    }

    setBusy(true);
    setMessage("");

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dialerMobile: m, dialerDesktop: d }),
    }).catch(() => null);

    setBusy(false);
    setMessage(res?.ok ? "נשמר" : "לא נשמר, נסה שוב");
    if (res?.ok) router.refresh();
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div className="section-title">חייגן</div>

      <PresetPicker
        title="מהנייד"
        hint="לאיזו אפליקציה כפתור החיוג יפתח כשאתה בטלפון"
        where="mobile"
        value={m}
        onChange={setM}
      />

      <PresetPicker
        title="מהמחשב"
        hint="לאיזו אפליקציה כפתור החיוג יפתח כשאתה במחשב"
        where="desktop"
        value={d}
        onChange={setD}
      />

      <button className="btn primary" onClick={save} disabled={busy}>
        {busy ? "שומר..." : "שמור"}
      </button>

      {message && (
        <div style={{ marginTop: 9, fontSize: 13.5, color: "#475467" }}>
          {message}
        </div>
      )}

      <div className="insight" style={{ marginTop: 12 }}>
        אם לחצת על כפתור החיוג ולא קרה כלום — סימן שהאפליקציה לא רשומה
        לסכמה הזו במכשיר. במחשב אפשר להגדיר אותה כברירת מחדל להתקשרות,
        ובנייד לוודא שהאפליקציה מותקנת ונפתחה לפחות פעם אחת.
      </div>
    </div>
  );
}
