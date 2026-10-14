"use client";

import { useEffect, useState } from "react";

/**
 * ============================================================
 *  התממשקות: הטפסים של פייסבוק
 * ============================================================
 *
 *  בוחרים דף, רואים את כל הטפסים שלו **ישירות מפייסבוק**,
 *  ולכל טופס קובעים אם הלידים שלו שלך או של קונה.
 *
 *  אין כאן הקלדת מזהים. טופס חדש שתפתח בפייסבוק יופיע
 *  כאן מעצמו ברענון.
 */

type FormRow = {
  formId: string;
  formName: string;
  status: string | null;
  leadsCount: number | null;
  channel: string;
  buyerId: string | null;
  pricePerLead: number;
  supplierKey: string | null;
  configured: boolean;
};

type PageRow = {
  id: string;
  name: string;
  error: string | null;
  forms: FormRow[];
};

type Buyer = { id: string; name: string };

export default function FormsScreen() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [openPage, setOpenPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState("");

  /** טיוטות לפני שמירה, לכל טופס בנפרד */
  const [draft, setDraft] = useState<Record<string, Partial<FormRow>>>({});

  async function load() {
    setLoading(true);
    setError("");

    const res = await fetch("/api/facebook/forms").catch(() => null);
    const data = await res?.json().catch(() => ({}));

    setLoading(false);

    if (!data?.ok) {
      setError(data?.error ?? "לא ניתן לשלוף את הטפסים מפייסבוק");
      setPages([]);
      return;
    }

    setPages(data.pages ?? []);
    setBuyers(data.buyers ?? []);

    // דף יחיד נפתח מעצמו
    if ((data.pages ?? []).length === 1) setOpenPage(data.pages[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  function valueOf(form: FormRow, key: keyof FormRow) {
    const d = draft[form.formId];
    return d && key in d ? (d[key] as never) : (form[key] as never);
  }

  function setValue(formId: string, key: keyof FormRow, value: unknown) {
    setDraft((p) => ({ ...p, [formId]: { ...p[formId], [key]: value } }));
  }

  async function save(page: PageRow, form: FormRow) {
    setSaving(form.formId);
    setMessage("");

    const channel = valueOf(form, "channel") as string;
    const buyerId = valueOf(form, "buyerId") as string | null;
    const price = Number(valueOf(form, "pricePerLead"));

    const res = await fetch("/api/facebook/forms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formId: form.formId,
        formName: form.formName,
        pageId: page.id,
        pageName: page.name,
        channel,
        buyerId,
        pricePerLead: price,
      }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setSaving("");

    if (!res?.ok) {
      setMessage(data?.error ?? "לא נשמר");
      return;
    }

    setMessage(
      channel === "sale"
        ? `${form.formName} — הלידים שלו עוברים לקונה ולא יופיעו ברשימה שלך`
        : `${form.formName} — הלידים שלו שלך`
    );

    setDraft((p) => {
      const next = { ...p };
      delete next[form.formId];
      return next;
    });

    load();
  }

  if (loading) {
    return <div className="empty">שולף את הדפים והטפסים מפייסבוק...</div>;
  }

  if (error) {
    return (
      <div className="card" style={{ borderInlineStart: "4px solid #b42318" }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          פייסבוק לא החזירה את הטפסים
        </div>
        <div style={{ fontSize: 13.5, color: "#475467", lineHeight: 1.6 }}>
          {error}
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={load}>
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, color: "#475467", lineHeight: 1.6 }}>
          הרשימה נשלפת מפייסבוק עכשיו. טופס שתפתח שם יופיע כאן
          ברענון, בלי להקליד שום מזהה.
          <br />
          טופס שמסומן <strong>מכירה</strong> — הלידים שלו שייכים לקונה
          בלבד ולא נכנסים לרשימה שלך.
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={load}>
          רענן מפייסבוק
        </button>
      </div>

      {message && (
        <div
          className="card"
          style={{ marginBottom: 12, borderInlineStart: "4px solid #12805c" }}
        >
          <div style={{ fontSize: 13.5 }}>{message}</div>
        </div>
      )}

      {pages.length === 0 && (
        <div className="empty">
          <strong>לא נמצאו דפים</strong>
          הטוקן לא רואה אף דף. בדוק שהדפים מוקצים למשתמש המערכת.
        </div>
      )}

      {pages.map((page) => (
        <div key={page.id} className="card" style={{ marginBottom: 12 }}>
          <button
            onClick={() => setOpenPage(openPage === page.id ? null : page.id)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              width: "100%",
              gap: 10,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 15 }}>{page.name}</span>
            <span style={{ fontSize: 12.5, color: "#667085" }}>
              {page.error
                ? "שגיאה"
                : `${page.forms.length} טפסים · ${
                    page.forms.filter((f) => f.channel === "sale").length
                  } מכירה`}
              {openPage === page.id ? " ⌃" : " ⌄"}
            </span>
          </button>

          {page.error && (
            <div style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>
              {page.error}
            </div>
          )}

          {openPage === page.id &&
            page.forms.map((form) => {
              const channel = valueOf(form, "channel") as string;
              const dirty = Boolean(draft[form.formId]);

              return (
                <div
                  key={form.formId}
                  style={{
                    borderTop: "1px solid #eef2f7",
                    paddingTop: 11,
                    marginTop: 11,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{form.formName}</span>
                    <span style={{ fontSize: 12.5, color: "#98a2b3" }}>
                      {form.leadsCount !== null && `${form.leadsCount} לידים`}
                      {form.status && form.status !== "ACTIVE"
                        ? ` · ${form.status}`
                        : ""}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 9,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="chip"
                      data-active={channel === "mine"}
                      style={
                        channel === "mine"
                          ? { background: "#eff8ff", borderColor: "#2e90fa" }
                          : undefined
                      }
                      onClick={() => setValue(form.formId, "channel", "mine")}
                    >
                      הלידים שלי
                    </button>
                    <button
                      className="chip"
                      style={
                        channel === "sale"
                          ? { background: "#fef0c7", borderColor: "#b54708" }
                          : undefined
                      }
                      onClick={() => setValue(form.formId, "channel", "sale")}
                    >
                      מכירה לקונה
                    </button>
                  </div>

                  {channel === "sale" && (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 9,
                        flexWrap: "wrap",
                      }}
                    >
                      <select
                        className="search"
                        style={{ flex: "1 1 150px" }}
                        value={(valueOf(form, "buyerId") as string) ?? ""}
                        onChange={(e) =>
                          setValue(
                            form.formId,
                            "buyerId",
                            e.target.value || null
                          )
                        }
                      >
                        <option value="">— בחר קונה —</option>
                        {buyers.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>

                      <input
                        className="search"
                        type="number"
                        min={0}
                        style={{ flex: "0 0 110px" }}
                        placeholder="₪ לליד"
                        value={String(valueOf(form, "pricePerLead") ?? "")}
                        onChange={(e) =>
                          setValue(
                            form.formId,
                            "pricePerLead",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  )}

                  {dirty && (
                    <button
                      className="btn primary"
                      style={{ marginTop: 9 }}
                      onClick={() => save(page, form)}
                      disabled={saving === form.formId}
                    >
                      {saving === form.formId ? "שומר..." : "שמור"}
                    </button>
                  )}

                  {!dirty && form.configured && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: form.channel === "sale" ? "#b54708" : "#12805c",
                        marginTop: 7,
                        fontWeight: 600,
                      }}
                    >
                      {form.channel === "sale"
                        ? `מוגדר: מכירה${
                            form.pricePerLead ? ` · ${form.pricePerLead} ₪` : ""
                          }`
                        : "מוגדר: הלידים שלי"}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </>
  );
}
