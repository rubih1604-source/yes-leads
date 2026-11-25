import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PublicLeadForm from "@/components/PublicLeadForm";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  דף הנחיתה
 * ============================================================
 *
 *  **זה הדף היחיד במערכת שפתוח לכולם**, ולכן הוא לא יורש
 *  כלום מהמסכים הפנימיים: לא סרגל צד, לא ניווט, ולא שום
 *  דבר שמרמז שיש מערכת מאחורה.
 *
 *  ============================================================
 *   למה הדף כהה
 *  ============================================================
 *
 *  המיתוג הוא תכלת על שחור. על רקע בהיר התכלת הזו נראית
 *  חיוורת וזולה; על שחור היא בדיוק מה שהיא אמורה להיות.
 *  דף נחיתה שלא נראה כמו המודעה שהביאה אליו מאבד אמון
 *  בשנייה הראשונה - ולכן הדף הולך אחרי המותג, לא להפך.
 *
 *  **שדות הטופס נשארים לבנים** גם על הרקע הכהה. שדה כהה
 *  על רקע כהה נקרא פחות, והמטרה כאן היא שימלאו - לא
 *  שיתפעלו מהעיצוב.
 */

const INK = "#121212";
const CARD = "#1c1c1e";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  const form = await db.publicForm
    .findUnique({ where: { id: params.id }, select: { title: true } })
    .catch(() => null);

  return {
    title: form?.title ?? "השארת פרטים",
    /** דף נחיתה של מודעה לא אמור להופיע בגוגל */
    robots: { index: false, follow: false },
  };
}

export default async function PublicFormPage({
  params,
}: {
  params: { id: string };
}) {
  const form = await db.publicForm
    .findUnique({ where: { id: params.id } })
    .catch(() => null);

  if (!form || !form.active) notFound();

  void db.publicForm
    .update({ where: { id: form.id }, data: { views: { increment: 1 } } })
    .catch(() => null);

  const lines = (v: string | null) =>
    (v ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const suppliers = (form.suppliers ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const benefits = lines(form.benefits);
  const details = lines(form.offerDetails);
  const images = lines(form.images);

  const brand = form.brandColor || "#00D8FE";

  /**
   * פריסת הגרפיקה נגזרת מהכמות, ולא מהגדרה שלך.
   *
   * תמונה אחת היא באנר. שתיים-שלוש הן רצועה. יותר - רשת.
   * ככה אתה רק מדביק כתובות, והדף נראה מסודר בלי שתצטרך
   * להחליט על פריסה.
   */
  const imageLayout =
    images.length === 1 ? "banner" : images.length <= 3 ? "strip" : "grid";

  return (
    <>
      {/**
       * ============================================================
       *  העמוד לא בונה <html> משלו
       * ============================================================
       *
       *  קודם הוא כן, ואז היה כאן <html> בתוך <html> - מה
       *  שגרם לדפדפן לשטח את השניים ולהציג את הסרגל של
       *  המערכת סביב דף הנחיתה.
       *
       *  הרקע נקבע כאן בכלל CSS על `body`, כי העטיפה היא
       *  זו שמחזיקה אותו.
       */}
      <style>{`
        body {
          margin: 0;
          background: ${INK};
          color: #fff;
          min-height: 100vh;
          font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
      `}</style>

      <div
        style={{
          background: INK,
          minHeight: "100vh",
          color: "#fff",
          fontFamily:
            "'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "26px 16px 46px" }}>
          {/* ---------- הלוגו ---------- */}
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            {form.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={form.logoUrl}
                alt=""
                style={{ height: 40, maxWidth: 200, objectFit: "contain" }}
              />
            ) : (
              <span style={{ color: brand, fontSize: 25, fontWeight: 900 }}>
                {form.name}
              </span>
            )}
          </div>

          {/* ---------- הכותרת ---------- */}
          <h1
            style={{
              fontSize: 29,
              lineHeight: 1.25,
              fontWeight: 900,
              margin: "0 0 10px",
              textAlign: "center",
            }}
          >
            {form.title}
          </h1>

          {form.subtitle ? (
            <p
              style={{
                color: "#a0a0a8",
                fontSize: 16,
                lineHeight: 1.6,
                margin: "0 0 20px",
                textAlign: "center",
              }}
            >
              {form.subtitle}
            </p>
          ) : (
            <div style={{ height: 10 }} />
          )}

          {/* ---------- המחיר ---------- */}
          {form.priceAmount ? (
            <div
              style={{
                textAlign: "center",
                border: `1px solid ${brand}40`,
                background: `${brand}0f`,
                borderRadius: 14,
                padding: "16px 14px",
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "center",
                  gap: 6,
                  direction: "rtl",
                }}
              >
                <span
                  style={{
                    color: brand,
                    fontSize: 46,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {form.priceAmount}
                </span>
                <span style={{ color: "#a0a0a8", fontSize: 16 }}>
                  {form.pricePeriod}
                </span>
              </div>

              {form.priceNote ? (
                <div
                  style={{ color: "#8b8b94", fontSize: 13, marginTop: 7 }}
                >
                  {form.priceNote}
                </div>
              ) : null}

              {details.length > 0 ? (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 13,
                    borderTop: "1px solid #ffffff14",
                    textAlign: "right",
                  }}
                >
                  {details.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 9,
                        marginBottom: i === details.length - 1 ? 0 : 8,
                      }}
                    >
                      <span
                        style={{
                          color: brand,
                          fontWeight: 700,
                          fontSize: 14,
                          lineHeight: "21px",
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </span>
                      <span
                        style={{
                          fontSize: 14.5,
                          color: "#d4d4d8",
                          lineHeight: 1.55,
                        }}
                      >
                        {d}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ---------- גרפיקה ---------- */}
          {images.length > 0 ? (
            <div
              style={{
                display: imageLayout === "banner" ? "block" : "grid",
                gridTemplateColumns:
                  imageLayout === "strip"
                    ? `repeat(${images.length}, 1fr)`
                    : "repeat(2, 1fr)",
                gap: 8,
                marginBottom: 18,
              }}
            >
              {images.map((src, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={i}
                  src={src}
                  alt=""
                  style={{
                    width: "100%",
                    height: imageLayout === "banner" ? "auto" : 104,
                    objectFit: "cover",
                    borderRadius: 12,
                    display: "block",
                  }}
                />
              ))}
            </div>
          ) : null}

          {/* ---------- הטופס ---------- */}
          <div
            style={{
              background: CARD,
              borderRadius: 16,
              padding: "22px 20px 18px",
              border: "1px solid #ffffff12",
            }}
          >
            <PublicLeadForm
              formId={form.id}
              suppliers={suppliers}
              askSupplier={form.askSupplier}
              brandColor={brand}
              existingMsg={form.existingMsg}
              consentText={form.consentText}
              requireConsent={form.requireConsent}
              requireEmail={form.requireEmail}
              requireSupplier={form.requireSupplier}
            />
          </div>

          {/* ---------- נקודות ערך ---------- */}
          {benefits.length > 0 ? (
            <div style={{ marginTop: 22 }}>
              {benefits.map((b, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    marginBottom: 13,
                  }}
                >
                  <span
                    style={{
                      color: brand,
                      fontWeight: 700,
                      fontSize: 15,
                      lineHeight: "22px",
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </span>
                  <span
                    style={{ fontSize: 14.5, color: "#a0a0a8", lineHeight: 1.6 }}
                  >
                    {b}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
