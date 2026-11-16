"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  שחזור לידים שהגיעו ולא הופיעו
 * ============================================================
 *
 *  יומן הקליטה שומר כל בקשה שהגיעה, גולמית. לכן ליד
 *  שנכנס ולא הופיע ברשימה לא אבד - הוא שם.
 *
 *  המסך מראה **קודם** מה חסר ורק אז מציע לשחזר, כי כלי
 *  שמשנה נתונים בלי להראות מה הוא עומד לעשות הוא כלי
 *  שאי אפשר לסמוך עליו.
 */

type Missing = {
  logId: string;
  phone: string;
  name: string;
  at: string;
  channel: "mine" | "sale";
  matchedOn: string;
  campaign: string | null;
};

const DAYS = [7, 30, 90];

export default function RecoverLeads() {
  const [days, setDays] = useState(30);
  const [missing, setMissing] = useState<Missing[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function scan() {
    setBusy("scan");
    setMessage("");

    const res = await fetch(`/api/recover-leads?days=${days}`).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) ?? {};

    if (!res?.ok || data.error) {
      setMessage(data.error || "הסריקה נכשלה");
      setBusy("");
      return;
    }

    setMissing(Array.isArray(data.missing) ? data.missing : []);
    setScanned(data.scanned ?? 0);
    setBusy("");
  }

  async function recover(logIds?: string[]) {
    setBusy(logIds?.length === 1 ? logIds[0] : "all");
    setMessage("");

    const res = await fetch("/api/recover-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days, logIds }),
    }).catch(() => null);

    const data = (await res?.json().catch(() => ({}))) ?? {};

    if (!res?.ok || data.error) {
      setMessage(data.error || "השחזור נכשל");
      setBusy("");
      return;
    }

    setMessage(
      data.recovered > 0
        ? `שוחזרו ${data.recovered} לידים. הם ברשימה לפי תאריך ההגעה האמיתי שלהם.`
        : "לא שוחזר כלום."
    );

    if (Array.isArray(data.problems) && data.problems.length) {
      setMessage(
        (m) => `${m} · לא הצליחו: ${data.problems.slice(0, 3).join(" · ")}`
      );
    }

    setBusy("");
    await scan();
    router.refresh();
  }

  const mine = missing?.filter((m) => m.channel === "mine") ?? [];

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-title">שחזור לידים שלא הופיעו</div>

      <div className="card">
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 12 }}>
          עובר על יומן הקליטה ומוצא כל הגעה שלא נוצר לה ליד. לא יוצר כלום
          לפני שתראה את הרשימה.
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {DAYS.map((d) => (
            <button
              key={d}
              className="chip"
              onClick={() => setDays(d)}
              style={{
                background: days === d ? "#1b4d8f" : "#fff",
                color: days === d ? "#fff" : "#475467",
              }}
            >
              {d} ימים
            </button>
          ))}
        </div>

        <button className="btn primary" onClick={scan} disabled={busy !== ""}>
          {busy === "scan" ? "סורק..." : "סרוק"}
        </button>

        {message ? (
          <div style={{ fontSize: 13, color: "#475467", marginTop: 10 }}>
            {message}
          </div>
        ) : null}
      </div>

      {missing !== null ? (
        missing.length === 0 ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #abefc6",
              background: "#f6fef9",
              fontSize: 13,
              color: "#027a48",
            }}
          >
            נסרקו {scanned} הגעות. לכולן יש ליד — לא חסר כלום.
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid #b42318",
                background: "#fef3f2",
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 700, color: "#b42318" }}>
                {missing.length} הגעות בלי ליד
              </div>
              <div style={{ fontSize: 13, color: "#475467", marginTop: 4 }}>
                מתוכן <strong>{mine.length}</strong> שייכות אליך. נסרקו{" "}
                {scanned} הגעות.
              </div>

              <button
                className="btn primary"
                style={{ marginTop: 10 }}
                onClick={() => recover()}
                disabled={busy !== ""}
              >
                {busy === "all" ? "משחזר..." : `שחזר את כל ה-${missing.length}`}
              </button>
            </div>

            {missing.map((m) => (
              <div className="card" key={m.logId} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 14.5 }}>{m.name}</strong>
                    <span
                      style={{
                        fontSize: 13,
                        color: "#667085",
                        direction: "ltr",
                        display: "inline-block",
                        marginInlineStart: 8,
                      }}
                    >
                      {m.phone}
                    </span>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: m.channel === "sale" ? "#b54708" : "#027a48",
                        marginTop: 2,
                      }}
                    >
                      {m.channel === "sale" ? "ייכנס למכירה" : "ייכנס אליך"} ·{" "}
                      {m.matchedOn}
                    </div>
                    {m.campaign ? (
                      <div style={{ fontSize: 12, color: "#667085" }}>
                        {m.campaign}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 12, color: "#667085" }}>
                      הגיע ב-
                      {new Date(m.at).toLocaleString("he-IL", {
                        timeZone: "Asia/Jerusalem",
                      })}
                    </div>
                  </div>

                  <button
                    className="btn"
                    onClick={() => recover([m.logId])}
                    disabled={busy !== ""}
                    style={{ alignSelf: "center" }}
                  >
                    {busy === m.logId ? "משחזר..." : "שחזר"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
