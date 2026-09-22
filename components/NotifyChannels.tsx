"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * לאן מגיעות התראות.
 * כל ערוץ נדלק ונכבה בנפרד. מה שדלוק - שם תקבל.
 */
export default function NotifyChannels({
  email,
  push,
  banner,
}: {
  email: boolean;
  push: boolean;
  banner: boolean;
}) {
  const [state, setState] = useState({ email, push, banner });
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle(key: "email" | "push" | "banner") {
    const next = { ...state, [key]: !state[key] };
    setState(next);
    setBusy(true);

    const field =
      key === "email" ? "notifyEmail" : key === "push" ? "notifyPush" : "notifyBanner";

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: next[key] }),
    });

    setBusy(false);
    router.refresh();
  }

  const options: Array<{
    key: "push" | "banner" | "email";
    label: string;
    hint: string;
  }> = [
    {
      key: "push",
      label: "נייד",
      hint: "קופץ על המסך הנעול. דורש הפעלה מהמכשיר למטה",
    },
    {
      key: "banner",
      label: "במערכת",
      hint: "באנר בראש כל מסך, נשאר עד שתסיר אותו",
    },
    {
      key: "email",
      label: "מייל",
      hint: "נשלח לכתובת שהוגדרה ברנדר",
    },
  ];

  const noneOn = !state.email && !state.push && !state.banner;

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>לאן מגיעות התראות</div>
      <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
        תזכורות על משימות — של לידים ושל העסק. מה שדלוק, שם תקבל.
      </div>

      {options.map((o) => (
        <button
          key={o.key}
          className="status-option"
          data-current={state[o.key]}
          onClick={() => toggle(o.key)}
          disabled={busy}
        >
          <span
            className="dot"
            style={{ background: state[o.key] ? "#12805c" : "#dbe3ea" }}
          />
          <span style={{ textAlign: "start" }}>
            {o.label}
            <span style={{ display: "block", fontSize: 12, color: "#98a2b3" }}>
              {o.hint}
            </span>
          </span>
          <span
            style={{
              marginInlineStart: "auto",
              fontSize: 13,
              fontWeight: 600,
              color: state[o.key] ? "#12805c" : "#98a2b3",
            }}
          >
            {state[o.key] ? "פועל" : "כבוי"}
          </span>
        </button>
      ))}

      {noneOn && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 10,
            background: "#fef3f2",
            border: "1px solid #b42318",
            color: "#7a271a",
            fontSize: 13.5,
          }}
        >
          כל הערוצים כבויים — לא תקבל שום תזכורת.
        </div>
      )}
    </div>
  );
}
