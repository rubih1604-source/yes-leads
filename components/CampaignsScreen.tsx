"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DELIVERY_FIELDS } from "@/lib/delivery-payload";
import { checkAdPrices, type AdPriceRule } from "@/lib/ad-pricing";

/**
 * ============================================================
 *  קמפיינים וערוצים
 * ============================================================
 *
 *  קמפיין הוא קטגוריה: "מכירת לידים", "לידים רובי",
 *  "איזי פיזי". בתוכו ערוצים.
 *
 *  ערוץ הוא היחידה שמחזיקה הכל: אילו טפסים מפייסבוק מזינים
 *  אותו, לאן הלידים נשלחים, האם זה ערוץ מכירה, מה המחיר,
 *  והאם השליחה אוטומטית.
 *
 *  ההתממשקות יושבת **בתוך הערוץ** - שם בוחרים את הטופס
 *  מהרשימה שפייסבוק מחזירה. מהרגע שהטופס משויך, כל ליד
 *  שייכנס דרכו הולך לערוץ הזה.
 */

export type FormRef = {
  formId: string;
  formName: string;
  pageId: string;
  pageName: string;
};

export type ChannelRow = {
  id: string;
  name: string;
  isSale: boolean;
  pricePerLead: number;
  webhookUrl: string;
  webhookSecret: string;
  webhookFormat: string;
  bodyTemplate: string;
  headersText: string;
  successContains: string;
  failureContains: string;
  /** אילו שדות הצד השני מקבל. ריק = הכל. */
  fields: string[];
  /** חריגי מחיר לפי מודעה. ריק = כולם במחיר הערוץ. */
  adPrices: AdPriceRule[];
  sendEnabled: boolean;
  autoSend: boolean;
  active: boolean;
  forms: FormRef[];
  leads: number;
};

export type CampaignRow = {
  id: string;
  name: string;
  active: boolean;
  channels: ChannelRow[];
};

type FbPage = {
  id: string;
  name: string;
  error: string | null;
  forms: Array<{ formId: string; formName: string; leadsCount: number | null }>;
};

const box = {
  width: "100%",
  direction: "ltr",
  fontFamily: "monospace",
  fontSize: 12,
} as const;

function ChannelCard({ channel }: { channel: ChannelRow }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"settings" | "forms">("settings");
  const [draft, setDraft] = useState<Partial<ChannelRow>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  /**
   * השדות שהצד השני מקבל.
   *
   * במצב נפרד מהטיוטה ולא בתוכה: הטיוטה משווה ערכים ב-!==,
   * ומערך חדש תמיד שונה מהקודם - מה שהיה משאיר את כפתור
   * השמירה דלוק לנצח.
   */
  const [fieldSel, setFieldSel] = useState<Set<string>>(
    new Set(channel.fields ?? [])
  );

  /**
   * חריגי מחיר לפי מודעה.
   *
   * במצב נפרד כמו fieldSel, מאותה סיבה: מערך חדש תמיד שונה
   * מהקודם ב-!==, וזה היה משאיר את כפתור השמירה דלוק לנצח.
   */
  const [adRules, setAdRules] = useState<AdPriceRule[]>(
    channel.adPrices ?? []
  );

  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(
    new Set(channel.forms.map((f) => f.formId))
  );

  const router = useRouter();

  const v = <K extends keyof ChannelRow>(k: K): ChannelRow[K] =>
    (k in draft ? (draft[k] as ChannelRow[K]) : channel[k]);

  const set = <K extends keyof ChannelRow>(k: K, value: ChannelRow[K]) =>
    setDraft((p) => ({ ...p, [k]: value }));

  /**
   * שומר את הטופס ומחזיר אם זה הצליח.
   *
   * מופרד מ-save כדי שגם "בדוק חיבור" יוכל לשמור קודם.
   */
  async function persist(): Promise<boolean> {
    const res = await fetch(`/api/channels/${channel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v("name"),
        isSale: v("isSale"),
        pricePerLead: Number(v("pricePerLead")) || 0,
        webhookUrl: v("webhookUrl"),
        webhookSecret: v("webhookSecret"),
        webhookFormat: v("webhookFormat"),
        bodyTemplate: v("bodyTemplate"),
        headers: v("headersText"),
        successContains: v("successContains"),
        failureContains: v("failureContains"),
        fields: [...fieldSel],
        adPrices: adRules,
        sendEnabled: v("sendEnabled"),
        autoSend: v("autoSend"),
      }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));

    if (!res?.ok) {
      setMessage(data?.error ?? "לא נשמר");
      return false;
    }

    /**
     * בכוונה לא מאפסים כאן את הטיוטה.
     *
     * קודם איפסנו אותה, ואז v() חזר לקרוא את הערך מה-prop
     * של השרת - שעוד לא התרענן. בחלון הזה השדה נראה ריק,
     * "בדוק חיבור" כבה, והלחיצה עליו לא עשתה כלום ולא אמרה
     * כלום. הטיוטה נשארת, ו-dirty מושווה מול מה שבשרת, כך
     * שהכפתור נכבה מעצמו ברגע שהרענון מגיע.
     */
    return true;
  }

  async function save() {
    setBusy(true);
    setMessage("");

    const ok = await persist();
    setBusy(false);

    if (!ok) return;

    setMessage("נשמר");
    router.refresh();
  }

  async function test() {
    /**
     * לחיצה חייבת תמיד להחזיר תשובה.
     *
     * קודם הכפתור היה כבוי כשלא הייתה כתובת, והלחיצה
     * פשוט לא עשתה כלום - בלי הודעה, בלי סיבה. עדיף
     * שהכפתור יהיה פעיל ויגיד מה חסר.
     */
    const url = String(v("webhookUrl") ?? "").trim();

    if (!url) {
      setMessage(
        "אין כתובת בשדה הוובוק. הדבק את הכתובת שאלעד נתן לך, לחץ שמור, ואז בדוק חיבור."
      );
      return;
    }

    setBusy(true);

    /**
     * כאן היה באג: הכפתור נדלק לפי מה שמוקלד על המסך, אבל
     * הבדיקה בשרת קוראת את הכתובת מהמסד. מי שהקליד כתובת
     * ולחץ "בדוק חיבור" בלי לשמור קיבל "לערוץ לא מוגדרת
     * כתובת" - כשהכתובת מולו על המסך.
     *
     * לכן שומרים קודם. אם השמירה נכשלה אין טעם לבדוק:
     * השרת היה בודק כתובת אחרת מזו שרואים.
     */
    if (dirty) {
      setMessage("שומר לפני הבדיקה...");

      if (!(await persist())) {
        setBusy(false);
        return;
      }
    }

    setMessage("שולח ליד בדיקה...");

    const res = await fetch(`/api/channels/${channel.id}`, { method: "POST" }).catch(
      () => null
    );

    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    setMessage(data?.verdict ?? data?.error ?? "לא ידוע");
    router.refresh();
  }

  async function loadForms() {
    setTab("forms");
    if (pages) return;

    setBusy(true);
    setMessage("שולף טפסים מפייסבוק...");

    const res = await fetch("/api/facebook/forms").catch(() => null);
    const data = await res?.json().catch(() => ({}));

    setBusy(false);

    if (!data?.ok) {
      setMessage(data?.error ?? "לא ניתן לשלוף טפסים");
      setPages([]);
      return;
    }

    setMessage("");
    setPages(data.pages ?? []);
  }

  async function saveForms() {
    if (!pages) return;

    setBusy(true);
    setMessage("");

    const forms: FormRef[] = [];

    for (const page of pages) {
      for (const form of page.forms) {
        if (!picked.has(form.formId)) continue;
        forms.push({
          formId: form.formId,
          formName: form.formName,
          pageId: page.id,
          pageName: page.name,
        });
      }
    }

    const res = await fetch(`/api/channels/${channel.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forms }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);

    setMessage(
      res?.ok
        ? `${data.linked} טפסים משויכים לערוץ. מעכשיו כל ליד מהם נכנס לכאן.`
        : data?.error ?? "לא נשמר"
    );

    if (res?.ok) router.refresh();
  }

  /**
   * "יש שינוי שלא נשמר" = הטיוטה שונה ממה שבשרת.
   *
   * לא "הטיוטה לא ריקה": אחרי שמירה הטיוטה נשארת בכוונה
   * (ראה persist), ולכן ספירת מפתחות הייתה משאירה את כפתור
   * השמירה דלוק לנצח.
   */
  const adRulesChanged =
    JSON.stringify(adRules) !== JSON.stringify(channel.adPrices ?? []);

  const fieldsChanged =
    fieldSel.size !== (channel.fields ?? []).length ||
    (channel.fields ?? []).some((f) => !fieldSel.has(f));

  const dirty =
    (Object.keys(draft) as Array<keyof ChannelRow>).some(
      (k) => draft[k] !== channel[k]
    ) || fieldsChanged || adRulesChanged;

  return (
    <div
      style={{
        borderTop: "1px solid #eef2f7",
        paddingTop: 11,
        marginTop: 11,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          gap: 10,
          alignItems: "baseline",
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {channel.name}
          {channel.isSale && (
            <span
              style={{
                fontSize: 11,
                color: "#b54708",
                fontWeight: 700,
                marginInlineStart: 7,
              }}
            >
              מכירה
            </span>
          )}
        </span>
        <span style={{ fontSize: 12.5, color: "#667085" }}>
          {channel.forms.length} טפסים · {channel.leads} לידים
          {channel.webhookUrl ? "" : " · אין כתובת"}
          {open ? " ⌃" : " ⌄"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 11 }}>
            <button
              className="chip"
              style={
                tab === "settings"
                  ? { background: "#eff8ff", borderColor: "#2e90fa" }
                  : undefined
              }
              onClick={() => setTab("settings")}
            >
              הגדרות
            </button>
            <button
              className="chip"
              style={
                tab === "forms"
                  ? { background: "#eff8ff", borderColor: "#2e90fa" }
                  : undefined
              }
              onClick={loadForms}
            >
              התממשקות
            </button>
          </div>

          {tab === "settings" && (
            <>
              <label style={{ display: "block", fontSize: 13, color: "#475467" }}>
                שם הערוץ
              </label>
              <input
                className="field"
                style={{ width: "100%" }}
                value={v("name")}
                onChange={(e) => set("name", e.target.value)}
              />

              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 9,
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={v("isSale")}
                  onChange={(e) => set("isSale", e.target.checked)}
                />
                ערוץ מכירה — לידים כאן יוצאים מהרשימה האישית שלי
              </label>

              {v("isSale") && (
                <>
                  <label style={{ display: "block", fontSize: 13, color: "#475467" }}>
                    מחיר לליד
                  </label>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    style={{ width: 130 }}
                    value={String(v("pricePerLead"))}
                    onChange={(e) =>
                      set("pricePerLead", Number(e.target.value) as never)
                    }
                  />
                </>
              )}

              <label style={{ display: "block", fontSize: 13, color: "#475467" }}>
                כתובת לשליחה
              </label>
              <input
                className="field"
                style={{ width: "100%", direction: "ltr" }}
                placeholder="https://..."
                value={v("webhookUrl")}
                onChange={(e) => set("webhookUrl", e.target.value)}
              />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <label style={{ display: "block", fontSize: 13, color: "#475467" }}>
                    סוד (לא חובה)
                  </label>
                  <input
                    className="field"
                    style={{ width: "100%", direction: "ltr" }}
                    value={v("webhookSecret")}
                    onChange={(e) => set("webhookSecret", e.target.value)}
                  />
                </div>
                <div style={{ flex: "0 0 130px" }}>
                  <label style={{ display: "block", fontSize: 13, color: "#475467" }}>
                    פורמט
                  </label>
                  <select
                    className="field"
                    style={{ width: "100%" }}
                    value={v("webhookFormat")}
                    onChange={(e) => set("webhookFormat", e.target.value)}
                  >
                    <option value="json">JSON</option>
                    <option value="form">טופס</option>
                  </select>
                </div>
              </div>

              <label style={{ display: "block", fontSize: 13, color: "#475467" }}>
                כותרות — שורה לכל אחת, <span dir="ltr">שם=ערך</span>
              </label>
              <textarea
                className="field"
                style={{ ...box, minHeight: 54 }}
                placeholder="X-API-Key=..."
                value={v("headersText")}
                onChange={(e) => set("headersText", e.target.value)}
              />

              <div style={{ fontSize: 12.5, color: "#475467", marginBottom: 5 }}>
                תבנית גוף השידור. ריק = נשלחים כל השדות. אסימונים:
                <br />
                <span dir="ltr" style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {DELIVERY_FIELDS.map((f) => `{${f.key}}`).join(" ")}
                </span>
              </div>
              <textarea
                className="field"
                style={{ ...box, minHeight: 100 }}
                placeholder={
                  '{\n  "name": "{full_name}",\n  "phone": "{phone}"\n}'
                }
                value={v("bodyTemplate")}
                onChange={(e) => set("bodyTemplate", e.target.value)}
              />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 150px" }}>
                  <label style={{ display: "block", fontSize: 12, color: "#12805c" }}>
                    חייב להופיע בתשובה
                  </label>
                  <input
                    className="field"
                    style={{ width: "100%", direction: "ltr", fontSize: 12.5 }}
                    value={v("successContains")}
                    onChange={(e) => set("successContains", e.target.value)}
                  />
                </div>
                <div style={{ flex: "1 1 150px" }}>
                  <label style={{ display: "block", fontSize: 12, color: "#b42318" }}>
                    אם הופיע — נכשל
                  </label>
                  <input
                    className="field"
                    style={{ width: "100%", direction: "ltr", fontSize: 12.5 }}
                    value={v("failureContains")}
                    onChange={(e) => set("failureContains", e.target.value)}
                  />
                </div>
              </div>

              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 7,
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={v("autoSend")}
                  onChange={(e) => set("autoSend", e.target.checked)}
                />
                כל ליד שנכנס לערוץ נשלח אוטומטית
              </label>

              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 11,
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={v("sendEnabled")}
                  onChange={(e) => set("sendEnabled", e.target.checked)}
                />
                שליחה פעילה
              </label>

              {/* מחיר לפי מודעה */}
              <div style={{ margin: "14px 0 4px" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  מחיר לפי מודעה
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#667085",
                    margin: "4px 0 9px",
                    lineHeight: 1.7,
                  }}
                >
                  {adRules.length === 0
                    ? `אין חריגים — כל ליד בערוץ נחתם ב-${v("pricePerLead")} ₪.`
                    : `${adRules.length} חריגים. ליד שלא מתאים לאף אחד נחתם ב-${v("pricePerLead")} ₪.`}
                  <br />
                  אפשר להקליד <strong>שם מודעה</strong> או{" "}
                  <strong>מזהה מודעה</strong>. מזהה עדיף — שם משתנה
                  כשמשנים אותו בפייסבוק, מזהה לא.
                </div>

                {adRules.map((rule, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", gap: 6, marginBottom: 6 }}
                  >
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      placeholder="שם או מזהה מודעה"
                      value={rule.match}
                      onChange={(e) =>
                        setAdRules((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, match: e.target.value } : r
                          )
                        )
                      }
                    />
                    <input
                      className="field"
                      style={{ width: 92 }}
                      placeholder="₪"
                      inputMode="decimal"
                      value={String(rule.price)}
                      onChange={(e) =>
                        setAdRules((prev) =>
                          prev.map((r, j) =>
                            j === i
                              ? { ...r, price: Number(e.target.value) || 0 }
                              : r
                          )
                        )
                      }
                    />
                    <button
                      className="chip"
                      style={{ color: "#b42318" }}
                      onClick={() =>
                        setAdRules((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      הסר
                    </button>
                  </div>
                ))}

                <button
                  className="chip"
                  onClick={() =>
                    setAdRules((prev) => [...prev, { match: "", price: 0 }])
                  }
                >
                  + הוסף מודעה
                </button>

                {checkAdPrices(adRules).map((problem, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 12.5,
                      color: "#b54708",
                      marginTop: 6,
                      lineHeight: 1.6,
                    }}
                  >
                    {problem}
                  </div>
                ))}
              </div>

              {/* אילו שדות הצד השני מקבל */}
              <div style={{ margin: "14px 0 4px" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  אילו שדות הצד השני מקבל
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#667085",
                    margin: "4px 0 9px",
                    lineHeight: 1.6,
                  }}
                >
                  {fieldSel.size === 0
                    ? "לא סומן כלום — ולכן נשלחים כל השדות. סמן כדי לשלוח רק חלק."
                    : `נשלחים ${fieldSel.size} שדות.`}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))",
                    gap: 4,
                  }}
                >
                  {DELIVERY_FIELDS.map((f) => (
                    <label
                      key={f.key}
                      style={{
                        display: "flex",
                        gap: 7,
                        alignItems: "center",
                        fontSize: 13.5,
                        padding: "3px 0",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={fieldSel.has(f.key)}
                        onChange={(e) =>
                          setFieldSel((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(f.key);
                            else next.delete(f.key);
                            return next;
                          })
                        }
                      />
                      {f.label}
                    </label>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="chip"
                    onClick={() =>
                      setFieldSel(new Set(DELIVERY_FIELDS.map((f) => f.key)))
                    }
                  >
                    סמן הכל
                  </button>
                  <button className="chip" onClick={() => setFieldSel(new Set())}>
                    נקה סימון
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn primary"
                  onClick={save}
                  disabled={busy || !dirty}
                >
                  {busy ? "רגע..." : "שמור"}
                </button>
                <button className="btn" onClick={test} disabled={busy}>
                  בדוק חיבור
                </button>
              </div>
            </>
          )}

          {tab === "forms" && (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: "#475467",
                  marginBottom: 9,
                  lineHeight: 1.6,
                }}
              >
                סמן אילו טפסים מפייסבוק מזינים את הערוץ הזה. מהרגע
                שסימנת, <strong>כל ליד שייכנס דרכם הולך לערוץ הזה</strong>
                {v("isSale") ? " ולא יופיע ברשימה האישית שלך." : "."}
              </div>

              {pages === null ? (
                <div style={{ fontSize: 13, color: "#667085" }}>טוען...</div>
              ) : pages.length === 0 ? (
                <div style={{ fontSize: 13, color: "#b42318" }}>
                  לא התקבלו טפסים מפייסבוק.
                </div>
              ) : (
                pages.map((page) => (
                  <div key={page.id} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13.5,
                        marginBottom: 5,
                      }}
                    >
                      {page.name}
                    </div>

                    {page.error && (
                      <div style={{ fontSize: 12.5, color: "#b42318" }}>
                        {page.error}
                      </div>
                    )}

                    {page.forms.map((form) => (
                      <label
                        key={form.formId}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "flex-start",
                          fontSize: 13,
                          padding: "4px 0",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={picked.has(form.formId)}
                          onChange={(e) =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(form.formId);
                              else next.delete(form.formId);
                              return next;
                            })
                          }
                        />
                        <span>
                          {form.formName}
                          {form.leadsCount !== null && (
                            <span style={{ color: "#98a2b3" }}>
                              {" "}
                              · {form.leadsCount} לידים
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              )}

              {pages && pages.length > 0 && (
                <button className="btn primary" onClick={saveForms} disabled={busy}>
                  {busy ? "שומר..." : `שמור שיוך (${picked.size} טפסים)`}
                </button>
              )}
            </>
          )}

          {message && (
            <div
              style={{
                marginTop: 9,
                fontSize: 13,
                color: "#475467",
                lineHeight: 1.6,
              }}
            >
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [isSale, setIsSale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function addChannel() {
    if (!name.trim()) {
      setError("צריך שם לערוץ");
      return;
    }

    setBusy(true);
    setError("");

    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, name, isSale }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);

    if (!res?.ok) {
      setError(data?.error ?? "הערוץ לא נוצר");
      return;
    }

    setName("");
    setIsSale(false);
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15.5 }}>{campaign.name}</div>
        <div style={{ fontSize: 12.5, color: "#667085" }}>
          {campaign.channels.length} ערוצים
        </div>
      </div>

      {campaign.channels.length === 0 && (
        <div style={{ fontSize: 13, color: "#667085", marginTop: 6 }}>
          אין עוד ערוצים בקמפיין הזה.
        </div>
      )}

      {campaign.channels.map((channel) => (
        <ChannelCard key={channel.id} channel={channel} />
      ))}

      {adding ? (
        <div style={{ marginTop: 12 }}>
          <input
            className="field"
            style={{ width: "100%" }}
            placeholder="שם הערוץ — למשל: לידים אלעד"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 9,
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={isSale}
              onChange={(e) => setIsSale(e.target.checked)}
            />
            ערוץ מכירה
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={addChannel} disabled={busy}>
              הוסף ערוץ
            </button>
            <button className="btn" onClick={() => setAdding(false)}>
              בטל
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn"
          style={{ marginTop: 12 }}
          onClick={() => setAdding(true)}
        >
          הוסף ערוץ
        </button>
      )}

      {error && (
        <div style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}

export default function CampaignsScreen({
  campaigns,
}: {
  campaigns: CampaignRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function addCampaign() {
    if (!name.trim()) {
      setError("צריך שם לקמפיין");
      return;
    }

    setBusy(true);
    setError("");

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);

    if (!res?.ok) {
      setError(data?.error ?? "הקמפיין לא נוצר");
      return;
    }

    setName("");
    setAdding(false);
    router.refresh();
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, color: "#475467", lineHeight: 1.7 }}>
          <strong>קמפיין</strong> הוא קטגוריה — מכירת לידים, לידים רובי,
          איזי פיזי.
          <br />
          <strong>ערוץ</strong> בתוכו מחזיק הכל: אילו טפסים מפייסבוק
          מזינים אותו, לאן הלידים נשלחים, האם זה ערוץ מכירה ומה המחיר.
          <br />
          סטטוס יכול להעביר ליד לערוץ — ההגדרה בהגדרות · סטטוסים.
        </div>
      </div>

      {campaigns.length === 0 && (
        <div className="empty">
          <strong>אין עוד קמפיינים</strong>
          התחל בקמפיין אחד — למשל &quot;מכירת לידים&quot; — והוסף בתוכו ערוץ.
        </div>
      )}

      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}

      {adding ? (
        <div className="card">
          <input
            className="field"
            style={{ width: "100%" }}
            placeholder="שם הקמפיין — למשל: מכירת לידים"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={addCampaign} disabled={busy}>
              צור קמפיין
            </button>
            <button className="btn" onClick={() => setAdding(false)}>
              בטל
            </button>
          </div>
          {error && (
            <div style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>
      ) : (
        <button className="btn primary" onClick={() => setAdding(true)}>
          קמפיין חדש
        </button>
      )}
    </>
  );
}
