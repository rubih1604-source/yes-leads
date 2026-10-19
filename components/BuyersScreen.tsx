"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { displayPhone } from "@/lib/phone";
import {
  DELIVERY_FIELDS,
  checkTemplate,
  headersToText,
} from "@/lib/delivery-payload";

/**
 * ============================================================
 *  קונים ושליחות
 * ============================================================
 *
 *  כאן מגדירים לאן כל קונה מקבל את הלידים שלו, ורואים בדיוק
 *  מה נשלח ומה נכשל.
 *
 *  היומן הוא החלק החשוב: כשקונה אומר "לא קיבלתי", אתה יכול
 *  להראות לו מתי נשלח, מה השרת שלו החזיר, ולשלוח שוב בלחיצה.
 */

export type BuyerRow = {
  id: string;
  name: string;
  webhookUrl: string;
  webhookSecret: string;
  webhookFormat: string;
  sendEnabled: boolean;
  fieldMap: Record<string, string>;
  headers: Record<string, string>;
  bodyTemplate: string;
  successContains: string;
  failureContains: string;
  campaigns: string[];
  totalSent: number;
};

export type DeliveryRow = {
  id: string;
  buyer: string;
  leadId: string;
  name: string;
  phone: string;
  state: string;
  attempts: number;
  httpStatus: number | null;
  error: string | null;
  at: string;
  sentAt: string | null;
};

const STATE_LABEL: Record<string, string> = {
  pending: "ממתינה",
  sent: "נשלחה",
  failed: "נכשלה",
};

const STATE_COLOR: Record<string, string> = {
  pending: "#b54708",
  sent: "#12805c",
  failed: "#b42318",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BuyerCard({ buyer }: { buyer: BuyerRow }) {
  const [url, setUrl] = useState(buyer.webhookUrl);
  const [secret, setSecret] = useState(buyer.webhookSecret);
  const [format, setFormat] = useState(buyer.webhookFormat);
  const [enabled, setEnabled] = useState(buyer.sendEnabled);
  const [mapOpen, setMapOpen] = useState(false);
  const [fieldMap, setFieldMap] = useState(buyer.fieldMap);
  const [headers, setHeaders] = useState(headersToText(buyer.headers));
  const [template, setTemplate] = useState(buyer.bodyTemplate);
  const [okText, setOkText] = useState(buyer.successContains);
  const [failText, setFailText] = useState(buyer.failureContains);
  const [advanced, setAdvanced] = useState(false);
  const [verdict, setVerdict] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function save() {
    setBusy(true);
    setMessage("");

    const res = await fetch(`/api/buyers/${buyer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookUrl: url,
        webhookSecret: secret,
        webhookFormat: format,
        sendEnabled: enabled,
        fieldMap,
        headers,
        bodyTemplate: template,
        successContains: okText,
        failureContains: failText,
      }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    setMessage(res?.ok ? "נשמר" : data?.error ?? "לא נשמר");
    if (res?.ok) router.refresh();
  }

  async function test() {
    setBusy(true);
    setMessage("שולח ליד בדיקה...");

    const res = await fetch(`/api/buyers/${buyer.id}`, {
      method: "POST",
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    setMessage(data?.verdict ?? data?.error ?? "לא ידוע");
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15 }}>{buyer.name}</div>
        <div style={{ fontSize: 12.5, color: "#667085" }}>
          {buyer.totalSent} שליחות
          {buyer.campaigns.length > 0 && ` · ${buyer.campaigns.join(", ")}`}
        </div>
      </div>

      <label
        style={{ display: "block", fontSize: 13, color: "#475467", margin: "11px 0 4px" }}
      >
        כתובת לשליחה
      </label>
      <input
        className="search"
        style={{ width: "100%", direction: "ltr" }}
        value={url}
        placeholder="https://..."
        onChange={(e) => setUrl(e.target.value)}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <div style={{ flex: "1 1 180px" }}>
          <label style={{ display: "block", fontSize: 13, color: "#475467", marginBottom: 4 }}>
            סוד (לא חובה)
          </label>
          <input
            className="search"
            style={{ width: "100%", direction: "ltr" }}
            value={secret}
            placeholder="token"
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>

        <div style={{ flex: "0 0 150px" }}>
          <label style={{ display: "block", fontSize: 13, color: "#475467", marginBottom: 4 }}>
            פורמט
          </label>
          <select
            className="search"
            style={{ width: "100%" }}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="json">JSON</option>
            <option value="form">טופס</option>
          </select>
        </div>
      </div>

      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 11,
          fontSize: 14,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        שליחה אוטומטית פעילה
      </label>

      <button
        className="chip"
        style={{ marginTop: 10 }}
        onClick={() => setMapOpen((v) => !v)}
      >
        שמות השדות {mapOpen ? "⌃" : "⌄"}
      </button>

      {mapOpen && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: "#475467", marginBottom: 8 }}>
            השאר ריק כדי לשלוח בשם המקורי. מחק את התוכן והשאר רווח כדי
            לא לשלוח את השדה בכלל.
          </div>
          {DELIVERY_FIELDS.map((f) => (
            <div
              key={f.key}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ flex: "0 0 120px", fontSize: 13 }}>{f.label}</span>
              <input
                className="search"
                style={{ flex: 1, direction: "ltr", padding: "6px 9px" }}
                value={fieldMap[f.key] ?? ""}
                placeholder={f.key}
                onChange={(e) =>
                  setFieldMap((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {/**
        * ההגדרות שמפרט השידור של ליד מנגר דורש: כותרת אימות
        * בשם מותאם, ותבנית גוף חופשית עם שדות קבועים.
        * בלי אלה אי אפשר לשדר למערכת כמו ActiveFlow.
        */}
      <button
        className="chip"
        style={{ marginTop: 10 }}
        onClick={() => setAdvanced((v) => !v)}
      >
        אימות ותבנית שידור {advanced ? "⌃" : "⌄"}
      </button>

      {advanced && (
        <div style={{ marginTop: 11 }}>
          <label
            style={{ display: "block", fontSize: 13, color: "#475467", marginBottom: 4 }}
          >
            כותרות (Headers)
          </label>
          <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 6 }}>
            שורה לכל כותרת, בפורמט <span dir="ltr">שם=ערך</span> — אפשר
            להעתיק ישר מהמפרט של הקונה.
          </div>
          <textarea
            className="search"
            style={{
              width: "100%",
              minHeight: 62,
              direction: "ltr",
              fontFamily: "monospace",
              fontSize: 12.5,
            }}
            value={headers}
            placeholder="X-API-Key=..."
            onChange={(e) => setHeaders(e.target.value)}
          />

          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "#475467",
              margin: "11px 0 4px",
            }}
          >
            תבנית גוף השידור
          </label>
          <div
            style={{ fontSize: 12.5, color: "#667085", marginBottom: 6, lineHeight: 1.6 }}
          >
            השאר ריק כדי לשלוח את המטען הרגיל. אסימונים זמינים:
            <br />
            <span dir="ltr" style={{ fontFamily: "monospace", fontSize: 11.5 }}>
              {DELIVERY_FIELDS.map((f) => `{${f.key}}`).join(" ")}
            </span>
          </div>
          <textarea
            className="search"
            style={{
              width: "100%",
              minHeight: 130,
              direction: "ltr",
              fontFamily: "monospace",
              fontSize: 12.5,
            }}
            value={template}
            placeholder={
              '{\n  "name": "{full_name}",\n  "phone": "{phone}",\n  "email": "{email}"\n}'
            }
            onChange={(e) => setTemplate(e.target.value)}
          />

          <button
            className="chip"
            style={{ marginTop: 7 }}
            onClick={() => {
              if (!template.trim()) {
                setVerdict("אין תבנית — יישלח המטען הרגיל");
                return;
              }

              const result = checkTemplate(template);
              setVerdict(
                result.ok
                  ? `התבנית תקינה · ${result.tokens.length} אסימונים`
                  : result.error ?? "התבנית לא תקינה"
              );
            }}
          >
            בדוק תקינות תבנית
          </button>

          {verdict && (
            <div style={{ fontSize: 13, color: "#475467", marginTop: 7 }}>
              {verdict}
            </div>
          )}

          {/**
            * בדיקת הצלחה וכשלון, כמו במפרט של ליד מנגר.
            *
            * יש מערכות שמחזירות 200 גם כשהליד נדחה, ואומרות
            * את זה בגוף התשובה. בלי זה היומן היה מסמן "נשלח"
            * לליד שלא נכנס אצל הקונה.
            */}
          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "#475467",
              margin: "13px 0 4px",
            }}
          >
            מתי השליחה נחשבת הצליחה
          </label>
          <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 6 }}>
            השאר ריק כדי להכריע לפי קוד התשובה. סימן כשלון גובר על
            סימן הצלחה.
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div style={{ fontSize: 12, color: "#12805c", marginBottom: 3 }}>
                חייב להופיע בתשובה
              </div>
              <input
                className="search"
                style={{ width: "100%", direction: "ltr", fontSize: 12.5 }}
                value={okText}
                placeholder='"success":true'
                onChange={(e) => setOkText(e.target.value)}
              />
            </div>

            <div style={{ flex: "1 1 160px" }}>
              <div style={{ fontSize: 12, color: "#b42318", marginBottom: 3 }}>
                אם הופיע — נכשל
              </div>
              <input
                className="search"
                style={{ width: "100%", direction: "ltr", fontSize: 12.5 }}
                value={failText}
                placeholder='"error"'
                onChange={(e) => setFailText(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "רגע..." : "שמור"}
        </button>
        <button className="btn" onClick={test} disabled={busy || !url}>
          בדוק חיבור
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 9, fontSize: 13.5, color: "#475467" }}>
          {message}
        </div>
      )}
    </div>
  );
}

export default function BuyersScreen({
  buyers,
  deliveries,
}: {
  buyers: BuyerRow[];
  deliveries: DeliveryRow[];
}) {
  const [busy, setBusy] = useState("");
  const router = useRouter();

  async function retry(id: string) {
    setBusy(id);
    await fetch(`/api/deliveries/${id}`, { method: "POST" }).catch(() => null);
    setBusy("");
    router.refresh();
  }

  const failed = deliveries.filter((d) => d.state === "failed").length;

  return (
    <>
      {buyers.length === 0 ? (
        <div className="empty">
          <strong>אין עדיין קונים</strong>
          קונים נוצרים במסך מכירת לידים, כשמשייכים קמפיין לקונה.
        </div>
      ) : (
        buyers.map((b) => <BuyerCard key={b.id} buyer={b} />)
      )}

      {failed > 0 && (
        <div
          className="card"
          style={{ borderInlineStart: "4px solid #b42318", marginBottom: 12 }}
        >
          <div style={{ fontWeight: 600 }}>
            {failed} שליחות נכשלו ולא יגיעו לקונה
          </div>
          <div style={{ fontSize: 13, color: "#475467", marginTop: 3 }}>
            אפשר לשלוח כל אחת מחדש מהרשימה למטה.
          </div>
        </div>
      )}

      <div className="section-title">יומן שליחות</div>

      {deliveries.length === 0 ? (
        <div className="empty">
          <strong>עוד לא נשלח כלום</strong>
          ברגע שליד ייכנס מקמפיין של קונה, הוא יישלח אליו ויופיע כאן.
        </div>
      ) : (
        <div className="card" style={{ paddingBottom: 6 }}>
          {deliveries.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 0",
                borderTop: "1px solid #eef2f7",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Link
                  href={`/leads/${d.leadId}`}
                  style={{ fontWeight: 500, textDecoration: "none", color: "inherit" }}
                >
                  {d.name}
                </Link>
                <div style={{ fontSize: 12.5, color: "#667085" }}>
                  <span dir="ltr">{displayPhone(d.phone)}</span> · {d.buyer} ·{" "}
                  {when(d.at)}
                </div>
                {d.error && (
                  <div style={{ fontSize: 12.5, color: "#b42318", marginTop: 3 }}>
                    {d.error}
                  </div>
                )}
              </div>

              <div style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: STATE_COLOR[d.state] ?? "#475467",
                  }}
                >
                  {STATE_LABEL[d.state] ?? d.state}
                  {d.attempts > 1 && ` · ${d.attempts} ניסיונות`}
                </div>
                {d.state !== "sent" && (
                  <button
                    className="chip"
                    style={{ marginTop: 6 }}
                    onClick={() => retry(d.id)}
                    disabled={busy === d.id}
                  >
                    {busy === d.id ? "שולח..." : "שלח שוב"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
