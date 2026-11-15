"use client";

import { useEffect, useState } from "react";

/**
 * ============================================================
 *  בדיקת שיוך - "למה הליד הזה הלך לצד הלא נכון"
 * ============================================================
 *
 *  שתי שאלות שעד היום לא הייתה להן תשובה בשום מסך:
 *
 *   1. **האם יש התנגשות?** מפתח אחד - שם קמפיין, מזהה
 *      טופס, אדסט - שרשום גם אצלך וגם אצל הקונה. זו
 *      הסיבה הסבירה ביותר לליד שהלך לצד הלא נכון, והיא
 *      הייתה בלתי נראית לחלוטין.
 *
 *   2. **מה יקרה לליד הזה?** מעתיקים את המזהים מיומן
 *      הקליטה ורואים את שרשרת ההכרעה צעד אחר צעד, לפני
 *      שהליד הבא נכנס.
 */

type Step = {
  name: string;
  claimed: boolean;
  owner: "mine" | "sale" | null;
  detail: string;
};

type Trace = { steps: Step[]; owner: "mine" | "sale"; matchedOn: string };
type Collision = { key: string; owners: string[] };

const FIELDS = [
  { key: "campaign", label: "שם הקמפיין" },
  { key: "formId", label: "מזהה טופס" },
  { key: "campaignId", label: "מזהה קמפיין" },
  { key: "adsetId", label: "מזהה אדסט" },
  { key: "adId", label: "מזהה מודעה" },
] as const;

export default function ClaimChecker() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function run(withIds: boolean) {
    setBusy(true);

    const params = new URLSearchParams();
    if (withIds) {
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) params.set(k, v.trim());
      }
    }

    const res = await fetch(
      `/api/diagnostics/claim${params.toString() ? `?${params}` : ""}`
    ).catch(() => null);

    const data = (await res?.json().catch(() => ({}))) ?? {};

    setCollisions(Array.isArray(data.collisions) ? data.collisions : []);
    setTrace(data.trace ?? null);
    setBusy(false);
    setLoaded(true);
  }

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-title">בדיקת שיוך</div>

      {/* ---------- התנגשויות ---------- */}
      {loaded && collisions.length > 0 ? (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #b42318",
            background: "#fef3f2",
            marginBottom: 14,
          }}
        >
          <div style={{ fontWeight: 700, color: "#b42318", marginBottom: 6 }}>
            נמצאו {collisions.length} התנגשויות
          </div>

          <div style={{ fontSize: 13, color: "#475467", marginBottom: 10 }}>
            אותו מפתח רשום ביותר ממקום אחד. ליד שנושא אותו יילך למי שנרשם
            ראשון — <strong>וזו הסיבה שליד שלך יכול להופיע כשל הקונה</strong>.
          </div>

          {collisions.map((c) => (
            <div
              key={c.key}
              style={{
                padding: "8px 0",
                borderTop: "1px solid #fecdca",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, direction: "ltr", textAlign: "right" }}>
                {c.key}
              </div>
              <div style={{ color: "#667085", fontSize: 12.5 }}>
                רשום ב: {c.owners.join(" · ")}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loaded && collisions.length === 0 ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #abefc6",
            background: "#f6fef9",
            fontSize: 13,
            color: "#027a48",
            marginBottom: 14,
          }}
        >
          אין התנגשויות. כל מפתח רשום במקום אחד בלבד.
        </div>
      ) : null}

      {/* ---------- בדיקה נקודתית ---------- */}
      <div className="card">
        <div style={{ fontSize: 13, color: "#475467", marginBottom: 10 }}>
          העתק מזהים מהבלוק האפור ביומן הקליטה וראה מי תופס את הליד. מספיק
          למלא שדה אחד.
        </div>

        {FIELDS.map((f) => (
          <div key={f.key} style={{ marginBottom: 8 }}>
            <label
              style={{ display: "block", fontSize: 12.5, color: "#667085" }}
            >
              {f.label}
            </label>
            <input
              className="search"
              style={{ width: "100%", direction: "ltr", textAlign: "left" }}
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}

        <button
          className="btn primary"
          onClick={() => run(true)}
          disabled={busy}
        >
          {busy ? "בודק..." : "בדוק מי תופס"}
        </button>
      </div>

      {/* ---------- התוצאה ---------- */}
      {trace ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div
            style={{
              fontWeight: 700,
              marginBottom: 10,
              color: trace.owner === "sale" ? "#b54708" : "#027a48",
            }}
          >
            {trace.owner === "sale"
              ? "הליד הזה יילך לקונה"
              : "הליד הזה יישאר אצלך"}
          </div>

          {trace.steps.map((s, i) => (
            <div
              key={s.name}
              style={{
                padding: "8px 0",
                borderTop: i === 0 ? "none" : "1px solid #eef2f7",
                fontSize: 13,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: s.claimed ? "#b54708" : "#667085",
                }}
              >
                {i + 1}. {s.name}
              </span>
              <div style={{ color: "#475467", marginTop: 2 }}>{s.detail}</div>
            </div>
          ))}

          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #eef2f7",
              fontSize: 12.5,
              color: "#667085",
            }}
          >
            זה מה שיירשם על הכניסה: {trace.matchedOn}
          </div>
        </div>
      ) : null}
    </div>
  );
}
