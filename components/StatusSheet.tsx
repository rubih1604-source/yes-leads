"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { groupByCategory, type StatusDef } from "@/lib/statuses";

/**
 * ============================================================
 *  בורר סטטוס בקטגוריות
 * ============================================================
 *
 *  **למה קטגוריות.** רשימה של ארבעה-עשר סטטוסים היא
 *  גלילה בכל שינוי, ובסוף לוחצים על מה שקרוב במקום על
 *  מה שנכון. הקטגוריה מקצרת את הבחירה לשתי לחיצות
 *  קצרות במקום חיפוש ברשימה ארוכה.
 *
 *  **קיצור דרך שנשמר בכוונה:** קטגוריה שיש בה סטטוס
 *  אחד בלבד נבחרת ישירות, בלי מסך ביניים ריק.
 *
 *  אחרי הסטטוס, סטטוס שיש לו תת-סטטוסים (למשל "מחכה
 *  למבצע") פותח שלב נוסף - מה חשוב ללקוח. זה מה שמאפשר
 *  אחר כך לשלוח מבצע ממוקד.
 */
export default function StatusSheet({
  leadId,
  current,
  currentSub,
  statuses,
  subStatuses = {},
  onClose,
}: {
  leadId: string;
  current: string;
  currentSub?: string | null;
  statuses: StatusDef[];
  subStatuses?: Record<string, string[]>;
  onClose: () => void;
}) {
  const groups = groupByCategory(statuses);

  /**
   * נפתח ישר על הקטגוריה של הסטטוס הנוכחי.
   *
   * ברוב השינויים הסטטוס הבא נמצא באותה קבוצה - "אין
   * מענה" הופך ל"אין מענה 2" - ולכן זו לחיצה אחת פחות
   * בדרך הנפוצה ביותר.
   */
  const [openCategory, setOpenCategory] = useState<string | null>(() => {
    const mine = groups.find((g) =>
      g.statuses.some((s) => s.name === current)
    );
    return groups.length === 1 ? groups[0].category : mine?.category ?? null;
  });
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function save(status: string, subStatus: string | null) {
    if (busy) return;

    if (status === current && subStatus === (currentSub ?? null)) {
      onClose();
      return;
    }

    setBusy(subStatus ?? status);
    setError("");

    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, subStatus }),
    });

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "השינוי לא נשמר. נסה שוב.");
      setBusy(null);
    }
  }

  function pick(status: string) {
    const subs = subStatuses[status];
    if (subs && subs.length > 0) {
      setPendingStatus(status);
      return;
    }
    save(status, null);
  }

  const subsForPending = pendingStatus
    ? subStatuses[pendingStatus] ?? []
    : [];

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet">
        {error && (
          <div className="error" style={{ margin: "0 6px 8px" }}>
            {error}
          </div>
        )}

        {pendingStatus ? (
          <>
            <h3>{pendingStatus} — מה חשוב ללקוח?</h3>

            <button
              className="status-option"
              data-current={!currentSub}
              onClick={() => save(pendingStatus, null)}
              disabled={busy !== null}
            >
              <span>בלי סימון</span>
            </button>

            {subsForPending.map((sub) => (
              <button
                key={sub}
                className="status-option"
                data-current={currentSub === sub}
                onClick={() => save(pendingStatus, sub)}
                disabled={busy !== null}
              >
                <span>{sub}</span>
                {busy === sub && (
                  <span
                    style={{
                      marginInlineStart: "auto",
                      color: "#98a2b3",
                      fontSize: 14,
                    }}
                  >
                    שומר...
                  </span>
                )}
              </button>
            ))}

            <button
              className="btn"
              style={{ marginTop: 6 }}
              onClick={() => setPendingStatus(null)}
              disabled={busy !== null}
            >
              חזרה
            </button>
          </>
        ) : (
          <>
            {openCategory ? (
              <>
                <h3>{openCategory}</h3>

                {(groups.find((g) => g.category === openCategory)?.statuses ??
                  []).map((s) => (
                  <button
                    key={s.name}
                    className="status-option"
                    data-current={s.name === current}
                    onClick={() => pick(s.name)}
                    disabled={busy !== null}
                  >
                    <span className="dot" style={{ background: s.color }} />
                    <span>{s.name}</span>
                    {(subStatuses[s.name]?.length ?? 0) > 0 && (
                      <span
                        style={{
                          marginInlineStart: "auto",
                          color: "#98a2b3",
                          fontSize: 13,
                        }}
                      >
                        ‹
                      </span>
                    )}
                    {busy === s.name && (
                      <span
                        style={{
                          marginInlineStart: "auto",
                          color: "#98a2b3",
                          fontSize: 14,
                        }}
                      >
                        שומר...
                      </span>
                    )}
                  </button>
                ))}

                {groups.length > 1 && (
                  <button
                    className="btn"
                    style={{ marginTop: 6 }}
                    onClick={() => setOpenCategory(null)}
                    disabled={busy !== null}
                  >
                    כל הקטגוריות
                  </button>
                )}
              </>
            ) : (
              <>
                <h3>בחר קטגוריה</h3>

                {groups.map((group) => {
                  const only =
                    group.statuses.length === 1 ? group.statuses[0] : null;

                  return (
                    <button
                      key={group.category}
                      className="status-option"
                      data-current={group.statuses.some(
                        (s) => s.name === current
                      )}
                      onClick={() =>
                        only
                          ? pick(only.name)
                          : setOpenCategory(group.category)
                      }
                      disabled={busy !== null}
                    >
                      <span
                        className="dot"
                        style={{ background: group.statuses[0].color }}
                      />
                      <span>{group.category}</span>
                      <span
                        style={{
                          marginInlineStart: "auto",
                          color: "#98a2b3",
                          fontSize: 13,
                        }}
                      >
                        {only ? "" : `${group.statuses.length} ‹`}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
