"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ============================================================
 *  תצוגות שמורות
 * ============================================================
 *
 *  ברירת המחדל מציגה את הרשימה הרגילה. תצוגה שמורה מצמצמת
 *  לקמפיינים ולערוצים שבחרת, ונשמרת בשם.
 *
 *  התצוגה היא **הגדרה ולא רשימה**: ליד שייכנס מחר לערוץ
 *  שבתצוגה יופיע בה מעצמו.
 */

export type ViewOption = {
  id: string;
  name: string;
  summary: string;
};

export type PickerCampaign = {
  id: string;
  name: string;
  channels: Array<{ id: string; name: string; isSale: boolean }>;
  /**
   * כמה לידים נכנסו מהקמפיין הזה ב-60 הימים האחרונים.
   *
   * זה מה שמבדיל בין קמפיין חי לקמפיין שסיים את דרכו
   * לפני חצי שנה ועדיין תופס מקום ברשימה.
   */
  recent?: number;
};

export default function ViewPicker({
  views,
  campaigns,
  activeId,
}: {
  views: ViewOption[];
  campaigns: PickerCampaign[];
  activeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pickedCampaigns, setPickedCampaigns] = useState<Set<string>>(new Set());
  const [pickedChannels, setPickedChannels] = useState<Set<string>>(new Set());
  const [includeSale, setIncludeSale] = useState(false);

  /**
   * ============================================================
   *  מציגים רק קמפיינים בשימוש
   * ============================================================
   *
   *  הרשימה צברה כל קמפיין שאי פעם רץ, ואחרי שנה היא
   *  ארוכה מדי מכדי למצוא בה משהו. ברירת המחדל היא מה
   *  שחי עכשיו; מה שנגמר עדיין נגיש בלחיצה.
   */
  const [onlyActive, setOnlyActive] = useState(true);

  /** קמפיין "חי" = נכנסו ממנו לידים לאחרונה */
  const liveCampaigns = campaigns.filter((c) => (c.recent ?? 0) > 0);

  /** יש בכלל מה להסתיר? אם לא, אין טעם להציג מתג */
  const hasQuiet =
    liveCampaigns.length > 0 && liveCampaigns.length < campaigns.length;

  const shown = onlyActive && hasQuiet ? liveCampaigns : campaigns;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const router = useRouter();

  function choose(id: string | null) {
    const url = id ? `/?view=${encodeURIComponent(id)}` : "/";
    router.push(url);
  }

  async function save() {
    if (!name.trim()) {
      setMessage("צריך שם לתצוגה");
      return;
    }

    if (pickedCampaigns.size === 0 && pickedChannels.size === 0) {
      setMessage("בחר לפחות קמפיין או ערוץ אחד");
      return;
    }

    setBusy(true);
    setMessage("");

    const res = await fetch("/api/lead-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        campaignIds: [...pickedCampaigns],
        channelIds: [...pickedChannels],
        includeSale,
      }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);

    if (!res?.ok) {
      setMessage(data?.error ?? "התצוגה לא נשמרה");
      return;
    }

    setName("");
    setPickedCampaigns(new Set());
    setPickedChannels(new Set());
    setOpen(false);
    choose(data.id);
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/lead-views?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);

    if (activeId === id) choose(null);
    else router.refresh();
  }

  const active = views.find((v) => v.id === activeId) ?? null;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          className="chip"
          style={
            !activeId
              ? { background: "#eff8ff", borderColor: "#2e90fa" }
              : undefined
          }
          onClick={() => choose(null)}
        >
          הכל
        </button>

        {views.map((view) => (
          <button
            key={view.id}
            className="chip"
            style={
              activeId === view.id
                ? { background: "#eff8ff", borderColor: "#2e90fa" }
                : undefined
            }
            onClick={() => choose(view.id)}
          >
            {view.name}
          </button>
        ))}

        <button
          className="chip"
          style={{ marginInlineStart: "auto" }}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "בטל" : "תצוגה חדשה"}
        </button>
      </div>

      {active && (
        <div
          style={{
            fontSize: 12.5,
            color: "#667085",
            marginTop: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span>{active.summary}</span>
          <button
            className="chip"
            style={{ color: "#b42318" }}
            onClick={() => remove(active.id)}
            disabled={busy}
          >
            מחק תצוגה
          </button>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 11 }}>
          {shown.length === 0 && campaigns.length > 0 ? (
            <div style={{ fontSize: 13, color: "#475467", lineHeight: 1.6 }}>
              אין קמפיינים עם לידים ב-60 הימים האחרונים.{" "}
              <button
                className="btn"
                style={{ fontSize: 12.5, padding: "4px 10px" }}
                onClick={() => setOnlyActive(false)}
              >
                הצג את כולם
              </button>
            </div>
          ) : campaigns.length === 0 ? (
            <div style={{ fontSize: 13, color: "#b54708", lineHeight: 1.6 }}>
              אין עוד קמפיינים וערוצים. צור אותם קודם במסך
              &quot;קמפיינים וערוצים&quot;, ואז אפשר לשמור תצוגה.
            </div>
          ) : (
            <>
              <input
                className="field"
                style={{ width: "100%" }}
                placeholder="שם התצוגה — למשל: רק לידים שלי"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              {/* מתג בין "בשימוש" לבין הכל */}
              {hasQuiet ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    margin: "10px 0 12px",
                    fontSize: 12.5,
                  }}
                >
                  {[
                    { on: true, label: `בשימוש (${liveCampaigns.length})` },
                    { on: false, label: `הכל (${campaigns.length})` },
                  ].map((opt) => (
                    <button
                      key={String(opt.on)}
                      className="chip"
                      onClick={() => setOnlyActive(opt.on)}
                      style={{
                        background: onlyActive === opt.on ? "#1b4d8f" : "#fff",
                        color: onlyActive === opt.on ? "#fff" : "#475467",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {shown.map((campaign) => (
                <div key={campaign.id} style={{ marginBottom: 9 }}>
                  <label
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={pickedCampaigns.has(campaign.id)}
                      onChange={(e) =>
                        setPickedCampaigns((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(campaign.id);
                          else next.delete(campaign.id);
                          return next;
                        })
                      }
                    />
                    {campaign.name}
                    <span style={{ fontSize: 12, color: "#98a2b3", fontWeight: 400 }}>
                      (כל הערוצים)
                    </span>
                  </label>

                  <div style={{ paddingInlineStart: 24 }}>
                    {campaign.channels.map((channel) => (
                      <label
                        key={channel.id}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          fontSize: 13,
                          padding: "3px 0",
                          opacity: pickedCampaigns.has(campaign.id) ? 0.5 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            pickedChannels.has(channel.id) ||
                            pickedCampaigns.has(campaign.id)
                          }
                          disabled={pickedCampaigns.has(campaign.id)}
                          onChange={(e) =>
                            setPickedChannels((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(channel.id);
                              else next.delete(channel.id);
                              return next;
                            })
                          }
                        />
                        {channel.name}
                        {channel.isSale && (
                          <span style={{ fontSize: 11, color: "#b54708" }}>
                            מכירה
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 13.5,
                  margin: "9px 0",
                  lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={includeSale}
                  onChange={(e) => setIncludeSale(e.target.checked)}
                />
                הצג גם לידים של ערוצי מכירה
              </label>

              <div
                style={{
                  fontSize: 12.5,
                  color: "#667085",
                  marginBottom: 9,
                  lineHeight: 1.6,
                }}
              >
                בלי הסימון הזה, לידים של ערוצי מכירה לא יופיעו גם אם
                בחרת את הערוץ שלהם — כדי לא לערב את הנתונים של הקונים
                ברשימה האישית.
              </div>

              <button className="btn primary" onClick={save} disabled={busy}>
                {busy ? "שומר..." : "שמור תצוגה"}
              </button>
            </>
          )}

          {message && (
            <div style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
