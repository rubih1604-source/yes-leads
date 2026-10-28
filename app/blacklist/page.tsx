import Link from "next/link";
import { db } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import BlacklistRow from "@/components/BlacklistRow";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  הרשימה השחורה
 * ============================================================
 *
 *  מי ביקש לא לקבל הודעות, מתי, ומה בדיוק כתב.
 *
 *  הטקסט המקורי נשמר בכוונה: אם מישהו יטען שלא ביקש, זו
 *  ההוכחה. וזה גם מה שמאפשר לך לראות שמישהו נכנס לרשימה
 *  בטעות ולהוציא אותו.
 */
export default async function BlacklistPage() {
  const leads = await db.lead
    .findMany({
      where: { doNotContact: true },
      orderBy: [{ doNotContactAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        doNotContactAt: true,
        doNotContactReason: true,
        doNotContactText: true,
      },
      take: 500,
    })
    .catch(() => []);

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          רשימה שחורה
          <span className="count">{leads.length} אנשים</span>
        </h1>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e4e7ec",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 13.5,
          color: "#475467",
          lineHeight: 1.7,
          margin: "10px 0 16px",
        }}
      >
        מי שנמצא כאן <strong>לא יקבל דיוור</strong>, לא הודעה ידנית ולא
        אוטומציה. הכניסה אוטומטית — ברגע שמישהו כותב שהוא מבקש להסיר או
        שאינו מעוניין.
        <br />
        אם מישהו נכנס בטעות, אפשר להוציא אותו כאן.
      </div>

      {leads.length === 0 ? (
        <div className="empty">
          <strong>הרשימה ריקה</strong>
          אף אחד עוד לא ביקש להפסיק לקבל הודעות.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {leads.map((lead) => {
            const name =
              `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
              displayPhone(lead.phone);

            return (
              <div
                key={lead.id}
                className="card"
                style={{ display: "grid", gap: 6 }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Link
                    href={`/leads/${lead.id}`}
                    style={{
                      fontWeight: 600,
                      fontSize: 14.5,
                      color: "#101828",
                      textDecoration: "none",
                    }}
                  >
                    {name}
                  </Link>
                  <span
                    style={{
                      fontSize: 12.5,
                      color: "#667085",
                      direction: "ltr",
                    }}
                  >
                    {displayPhone(lead.phone)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 9px",
                      borderRadius: 999,
                      background: "#fee4e2",
                      color: "#b42318",
                    }}
                  >
                    {lead.doNotContactReason ?? "ברשימה"}
                  </span>
                </div>

                {lead.doNotContactText && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "#344054",
                      background: "#f9fafb",
                      borderRadius: 8,
                      padding: "7px 10px",
                      lineHeight: 1.6,
                    }}
                  >
                    “{lead.doNotContactText}”
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 12.5, color: "#667085" }}>
                    {lead.doNotContactAt
                      ? `נכנס ב-${lead.doNotContactAt.toLocaleString("he-IL", {
                          timeZone: "Asia/Jerusalem",
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "נכנס לפני שהתאריך נשמר"}
                    {" · "}
                    {lead.status}
                  </span>

                  <BlacklistRow leadId={lead.id} name={name} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
