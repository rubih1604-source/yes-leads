"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkPhone } from "@/lib/phone-valid";

/**
 * ============================================================
 *  תיקון פרטי הליד
 * ============================================================
 *
 *  **למה זה נחוץ.** לקוח משאיר מספר שגוי בטופס ואז שולח
 *  את הנכון בהודעה. בלי מסך תיקון הליד נשאר לנצח עם מספר
 *  שלא עונה, ואתה מגלה את זה רק אחרי שלוש שיחות.
 *
 *  **הבדיקה רצה בזמן הקלדה**, לפני השמירה: אם המספר
 *  החדש עדיין שגוי, עדיף לדעת עכשיו ולא בשיחה הבאה.
 */

export default function EditLeadDetails({
  leadId,
  firstName,
  lastName,
  phone,
  email,
  address,
}: {
  leadId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  email: string | null;
  address: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    phone,
    email: email ?? "",
    address: address ?? "",
  });

  const router = useRouter();

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** בדיקה חיה, כדי שלא תשמור מספר שגוי בלי לדעת */
  const phoneCheck = checkPhone(form.phone);
  const phoneChanged = form.phone.trim() !== phone;

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");

    const res = await fetch(`/api/leads/${leadId}/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);

    const data = (await res?.json().catch(() => ({}))) ?? {};

    if (!res?.ok || data.error) {
      setError(data.error || "השמירה נכשלה");
      setBusy(false);
      return;
    }

    setMessage(
      data.phoneNote
        ? `נשמר. שים לב: ${data.phoneNote}`
        : data.changed
          ? "נשמר"
          : "לא היה מה לשנות"
    );

    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        <button
          className="btn"
          onClick={() => setOpen(true)}
          style={{ fontSize: 13 }}
        >
          תקן פרטים
        </button>

        {message ? (
          <span
            style={{ fontSize: 12.5, color: "#475467", marginInlineStart: 8 }}
          >
            {message}
          </span>
        ) : null}
      </div>
    );
  }

  const FIELDS = [
    { key: "firstName" as const, label: "שם פרטי", ltr: false },
    { key: "lastName" as const, label: "שם משפחה", ltr: false },
    { key: "phone" as const, label: "טלפון", ltr: true },
    { key: "email" as const, label: "מייל", ltr: true },
    { key: "address" as const, label: "כתובת", ltr: false },
  ];

  return (
    <div className="card" style={{ marginTop: 10 }}>
      {FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 12.5, color: "#667085" }}>
            {f.label}
          </label>
          <input
            className="field"
            style={{
              width: "100%",
              direction: f.ltr ? "ltr" : "rtl",
              textAlign: f.ltr ? "left" : "right",
            }}
            value={form[f.key]}
            onChange={(e) => set(f.key)(e.target.value)}
          />
        </div>
      ))}

      {/*
        אזהרה ולא חסימה.

        ייתכן שהלקוח באמת מסר מספר חריג, ולא נכון לחסום
        אותך מלתקן - אבל כן נכון לומר לך את זה עכשיו.
      */}
      {form.phone.trim() && !phoneCheck.valid ? (
        <div
          style={{
            fontSize: 12.5,
            color: "#b42318",
            background: "#fef3f2",
            padding: "6px 10px",
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          המספר עדיין נראה שגוי: {phoneCheck.reason}
        </div>
      ) : null}

      {phoneChanged && phoneCheck.valid ? (
        <div style={{ fontSize: 12.5, color: "#027a48", marginBottom: 8 }}>
          מספר {phoneCheck.kind} תקין
        </div>
      ) : null}

      {error ? (
        <div style={{ fontSize: 13, color: "#b42318", marginBottom: 8 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "שומר..." : "שמור"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          disabled={busy}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
