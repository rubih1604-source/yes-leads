"use client";

import { useState } from "react";
import type { TemplateDraft } from "@/lib/template-drafts";

/**
 * ============================================================
 *  תבניות להקמה בטקסטר
 * ============================================================
 *
 *  **למה המסך הזה קיים.**
 *
 *  חוק שולח תבנית לפי שם. שם שלא קיים בטקסטר = שליחה
 *  שנכשלת על כל ליד שמגיע לסטטוס, בשקט. מבחוץ זה נראה
 *  בדיוק כמו "אף אחד לא ענה", ולכן אפשר לאבד שבוע בלי
 *  לדעת.
 *
 *  כאן רואים בדיוק מה חסר: כל תבנית עם השם המדויק
 *  והטקסט המלא, מוכנים להעתקה. ברגע שהקמת אותה בטקסטר
 *  היא עוברת ל"מוכנות" והרשימה מתקצרת לבד.
 */

export type DraftRow = TemplateDraft & { exists: boolean };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      className="btn"
      style={{ height: 36, fontSize: 13 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "הועתק ✓" : label}
    </button>
  );
}

function DraftCard({ row }: { row: DraftRow }) {
  return (
    <div
      className="card"
      style={{
        marginBottom: 10,
        borderInlineStart: `4px solid ${row.exists ? "#16a34a" : "#f59e0b"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            direction: "ltr",
            textAlign: "left",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {row.name}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: row.exists ? "#15803d" : "#b45309",
            whiteSpace: "nowrap",
          }}
        >
          {row.exists ? "קיימת בטקסטר" : "צריך להקים"}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 8 }}>
        {row.status} · {row.when}
      </div>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e4e9ef",
          borderRadius: 8,
          padding: 10,
          fontSize: 14,
          lineHeight: 1.75,
          marginBottom: 8,
        }}
      >
        {row.body}
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: "#475467",
          lineHeight: 1.65,
          marginBottom: 10,
        }}
      >
        {row.why}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <CopyButton text={row.name} label="העתק שם" />
        <CopyButton text={row.body} label="העתק טקסט" />
      </div>
    </div>
  );
}

export default function TemplateDraftsScreen({ rows }: { rows: DraftRow[] }) {
  const [onlyMissing, setOnlyMissing] = useState(true);

  const missing = rows.filter((r) => !r.exists);
  const shown = onlyMissing ? missing : rows;

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          תבניות להקמה
          <span className="count">
            {missing.length === 0
              ? "הכל מוקם"
              : `${missing.length} חסרות`}
          </span>
        </h1>
      </div>

      <div
        className="card"
        style={{
          background: "#f5f9ff",
          border: "1px solid #c7d7ee",
          marginBottom: 12,
          fontSize: 13.5,
          lineHeight: 1.8,
        }}
      >
        <strong>השם חייב להיות זהה בדיוק.</strong> החוק מחפש את
        התבנית לפי השם, ולכן שם שונה בטקסטר פירושו שליחה שנכשלת
        על כל ליד - בלי הודעת שגיאה שתראה. העתק את השם מכאן, אל
        תקליד אותו.
        <div style={{ marginTop: 8 }}>
          {"{{1}}"} הוא השם הפרטי של הלקוח. בטקסטר זה משתנה אחד.
        </div>
      </div>

      <button
        className="btn"
        style={{ marginBottom: 12 }}
        onClick={() => setOnlyMissing((v) => !v)}
      >
        {onlyMissing ? "הצג את כולן" : "הצג רק את החסרות"}
      </button>

      {shown.length === 0 && (
        <div className="card" style={{ background: "#f0fdf4" }}>
          כל התבניות קיימות בטקסטר. אפשר להדליק את החוקים במסך
          &quot;חוקים&quot;.
        </div>
      )}

      {shown.map((row) => (
        <DraftCard key={row.name} row={row} />
      ))}
    </div>
  );
}
