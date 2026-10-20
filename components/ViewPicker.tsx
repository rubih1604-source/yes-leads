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
          {campaigns.length === 0 ? (
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

              {campaigns.map((campaign) => (
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
