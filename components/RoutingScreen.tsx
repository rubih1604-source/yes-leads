"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  שידור וניתוב לידים
 * ============================================================
 *
 *  מסך אחד שעונה על שאלה אחת: **בשינוי לאיזה סטטוס, הליד
 *  משודר לאיזה ערוץ.**
 *
 *  עד עכשיו ההגדרה הזו הייתה מפוזרת בתוך עורך הסטטוסים,
 *  ולא היה מקום אחד שבו רואים את כל הניתוב במבט אחד - ולכן
 *  גם לא היה אפשר לדעת אם סטטוס מסוים משדר או לא.
 *
 *  מה שקורה בשינוי סטטוס שמוגדר כאן:
 *    1. הליד מקבל כניסה חדשה בערוץ שנבחר
 *    2. אם זה ערוץ מכירה - הליד יוצא מהרשימה האישית שלך
 *    3. הליד נרשם לשליחה לוובוק של הערוץ
 *
 *  ההעברה קורית **פעם אחת** לכל ליד. סטטוס שמוחזר וחוזר לא
 *  ישדר שוב, כדי שהקונה לא יקבל אותו ליד פעמיים ויחויב
 *  עליו פעמיים.
 */

export type RouteStatus = {
  id: string;
  name: string;
  color: string;
  transferChannelId: string | null;
  transferPrice: number;
};

export type RouteChannel = {
  id: string;
  name: string;
  campaignName: string;
  isSale: boolean;
  hasUrl: boolean;
  pricePerLead: number;
};

export default function RoutingScreen({
  statuses,
  channels,
}: {
  statuses: RouteStatus[];
  channels: RouteChannel[];
}) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});

  const router = useRouter();

  const valueFor = (s: RouteStatus) =>
    s.id in drafts ? drafts[s.id] : s.transferChannelId ?? "";

  const priceFor = (s: RouteStatus) =>
    s.id in prices ? prices[s.id] : String(s.transferPrice || "");

  async function saveRow(s: RouteStatus) {
    const channelId = valueFor(s);
    const price = priceFor(s);

    setBusy(s.id);
    setMessage("");
    setFailed(false);

    const res = await fetch(`/api/statuses/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transferChannelId: channelId || null,
        transferPrice: Number(price) || 0,
      }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy("");

    if (!res?.ok) {
      setFailed(true);
      setMessage(data?.error ?? "ההגדרה לא נשמרה");
      return;
    }

    const channel = channels.find((c) => c.id === channelId);

    setMessage(
      channel
        ? `מעכשיו, שינוי לסטטוס "${s.name}" משדר את הליד לערוץ "${channel.name}".`
        : `שינוי לסטטוס "${s.name}" לא משדר לשום מקום.`
    );

    router.refresh();
  }

  const active = statuses.filter((s) => s.transferChannelId);

  return (
    <>
      <div
        className="card"
        style={{ marginBottom: 14, borderInlineStart: "4px solid #2e90fa" }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          איך זה עובד
        </div>
        <div style={{ fontSize: 13, color: "#475467", lineHeight: 1.7 }}>
          לכל סטטוס אפשר לבחור ערוץ. ברגע שתשנה ליד לסטטוס הזה, הוא
          משודר לוובוק של הערוץ, ואם זה ערוץ מכירה הוא גם יוצא
          מהרשימה האישית שלך ועובר לרשימת המכירה.
          <br />
          כל ליד משודר <strong>פעם אחת בלבד</strong> — החזרת הסטטוס
          וקביעתו מחדש לא תשלח אותו שוב, כדי שהקונה לא יקבל אותו
          פעמיים.
        </div>
      </div>

      {active.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 7, fontSize: 14 }}>
            ניתוב פעיל כרגע
          </div>
          {active.map((s) => {
            const channel = channels.find((c) => c.id === s.transferChannelId);
            return (
              <div
                key={s.id}
                style={{
                  fontSize: 13.5,
                  padding: "4px 0",
                  lineHeight: 1.6,
                }}
              >
                <strong>{s.name}</strong> → {channel?.name ?? "ערוץ שנמחק"}
                {s.transferPrice > 0 && ` · ${s.transferPrice} ₪ לליד`}
                {channel && !channel.hasUrl && (
                  <span style={{ color: "#b54708" }}> · אין כתובת וובוק</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="section-title">כל הסטטוסים</div>

      {statuses.length === 0 && (
        <div className="empty">
          <strong>אין סטטוסים</strong>
          צור סטטוסים בהגדרות, ואז אפשר להגדיר לכל אחד לאן הוא משדר.
        </div>
      )}

      {statuses.map((s) => {
        const changed =
          valueFor(s) !== (s.transferChannelId ?? "") ||
          Number(priceFor(s) || 0) !== s.transferPrice;

        const chosen = channels.find((c) => c.id === valueFor(s)) ?? null;

        return (
          <div className="card" key={s.id} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 9,
              }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 999,
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <strong style={{ fontSize: 14.5 }}>{s.name}</strong>
            </div>

            <label
              style={{
                display: "block",
                fontSize: 12.5,
                color: "#667085",
                marginBottom: 4,
              }}
            >
              משדר לערוץ
            </label>

            <select
              className="field"
              style={{ width: "100%", marginBottom: 8 }}
              value={valueFor(s)}
              onChange={(e) =>
                setDrafts((p) => ({ ...p, [s.id]: e.target.value }))
              }
            >
              <option value="">— לא משדר —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.campaignName} · {c.name}
                  {c.isSale ? " (מכירה)" : ""}
                  {c.hasUrl ? "" : " — אין כתובת"}
                </option>
              ))}
            </select>

            {chosen && (
              <>
                <label
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "#667085",
                    marginBottom: 4,
                  }}
                >
                  מחיר לליד בהעברה הזו (₪)
                </label>
                <input
                  className="field"
                  style={{ width: "100%", marginBottom: 8 }}
                  value={priceFor(s)}
                  onChange={(e) =>
                    setPrices((p) => ({ ...p, [s.id]: e.target.value }))
                  }
                  inputMode="decimal"
                  placeholder={String(chosen.pricePerLead || 0)}
                />

                {!chosen.hasUrl && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "#b54708",
                      marginBottom: 8,
                      lineHeight: 1.6,
                    }}
                  >
                    לערוץ הזה אין כתובת וובוק. הליד יעבור אליו ברשימה,
                    אבל לא יישלח לאף אחד עד שתוסיף כתובת.
                  </div>
                )}
              </>
            )}

            <button
              className="btn primary"
              onClick={() => saveRow(s)}
              disabled={busy === s.id || !changed}
            >
              {busy === s.id ? "שומר..." : "שמור"}
            </button>
          </div>
        );
      })}

      {message && (
        <div
          className="card"
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            color: failed ? "#b42318" : "#027a48",
          }}
        >
          {message}
        </div>
      )}
    </>
  );
}
