"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  הוספת ליד ידני
 * ============================================================
 *
 *  שני שימושים, אותו טופס:
 *
 *    **mine** - ליד שנכנס לרשימה האישית שלך.
 *    **sale** - ליד שנכנס לערוץ של קונה, ונשלח אליו מיד.
 *
 *  הליד הידני עובר את אותו מסלול כמו ליד אמיתי מפייסבוק,
 *  ולכן אפשר לבדוק בעזרתו שהשרשרת כולה עובדת - בלי לחכות
 *  לליד אמיתי.
 */

export type ChannelChoice = {
  id: string;
  name: string;
  isSale: boolean;
  hasUrl: boolean;
};

export default function AddLeadForm({
  mode,
  channels,
}: {
  mode: "mine" | "sale";
  channels: ChannelChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [campaign, setCampaign] = useState("");
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const router = useRouter();

  const saleChannels = channels.filter((c) => c.isSale);
  const pick = mode === "sale" ? saleChannels : channels;
  const chosen = pick.find((c) => c.id === channelId) ?? null;

  async function submit() {
    if (mode === "sale" && !channelId) {
      setFailed(true);
      setMessage("בחר לאיזה ערוץ הליד נכנס");
      return;
    }

    setBusy(true);
    setMessage("");
    setFailed(false);

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        firstName,
        lastName,
        email,
        campaign,
        channelId: channelId || null,
      }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);

    if (!res?.ok) {
      setFailed(true);
      setMessage(data?.error ?? "הליד לא נוסף");
      return;
    }

    setMessage(data?.verdict ?? "הליד נוסף");
    setPhone("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setCampaign("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        className="btn"
        style={{ marginBottom: 12 }}
        onClick={() => setOpen(true)}
      >
        + הוסף ליד ידני
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 9,
        }}
      >
        <strong style={{ fontSize: 14.5 }}>
          {mode === "sale" ? "ליד ידני לערוץ של קונה" : "ליד ידני לרשימה שלך"}
        </strong>
        <button
          className="chip"
          style={{ marginInlineStart: "auto" }}
          onClick={() => setOpen(false)}
        >
          סגור
        </button>
      </div>

      {mode === "sale" && (
        <>
          <select
            className="field"
            style={{ width: "100%", marginBottom: 8 }}
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">— בחר ערוץ —</option>
            {saleChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.hasUrl ? "" : " (אין כתובת וובוק)"}
              </option>
            ))}
          </select>

          {saleChannels.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: "#b54708",
                marginBottom: 9,
                lineHeight: 1.6,
              }}
            >
              אין ערוצי מכירה. צור ערוץ במסך &quot;קמפיינים וערוצים&quot;,
              סמן אותו כמכירה, והוסף לו כתובת וובוק.
            </div>
          )}

          {chosen && !chosen.hasUrl && (
            <div
              style={{
                fontSize: 13,
                color: "#b54708",
                marginBottom: 9,
                lineHeight: 1.6,
              }}
            >
              לערוץ הזה אין כתובת וובוק, ולכן הליד ייכנס אליו אבל לא
              יישלח לאף אחד.
            </div>
          )}
        </>
      )}

      <input
        className="field"
        style={{ width: "100%", marginBottom: 8 }}
        placeholder="טלפון (חובה) — למשל 0521234567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="שם פרטי"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="שם משפחה"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <input
        className="field"
        style={{ width: "100%", marginBottom: 8 }}
        placeholder='דוא"ל (לא חובה)'
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        inputMode="email"
      />

      <input
        className="field"
        style={{ width: "100%", marginBottom: 9 }}
        placeholder="שם קמפיין (לא חובה)"
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
      />

      <button className="btn primary" onClick={submit} disabled={busy}>
        {busy ? "מוסיף..." : "הוסף ליד"}
      </button>

      {message && (
        <div
          style={{
            fontSize: 13,
            marginTop: 9,
            lineHeight: 1.6,
            color: failed ? "#b42318" : "#027a48",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
