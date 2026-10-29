import Link from "next/link";
import { db } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import {
  replyAfterBroadcast,
  replyDelayLabel,
  sortReplies,
  isExistingCustomerStatus,
  REPLY_WINDOW_DAYS,
} from "@/lib/broadcast-replies";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  התעניינות של לידים לאחר דיוור
 * ============================================================
 *
 *  מי קיבל דיוור ו**ענה**. רק הם.
 *
 *  **למה אין כאן מנגנון חדש.** הדיוור כבר רושם בכרטיס הליד
 *  שנשלחה אליו הודעה, והקליטה כבר רושמת את התגובה. המסך
 *  הזה רק שואל את מה שכבר רשום: "מי קיבל, ואז ענה".
 *
 *  מי שביקש להסיר לא מופיע כאן - הוא ברשימה השחורה, ואין
 *  מה להתנהל מולו.
 */
export default async function BroadcastRepliesPage() {
  const since = new Date(
    Date.now() - (REPLY_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000
  );

  /**
   * נטענים רק לידים שיש להם הודעה בטווח, ובלי הרשימה
   * השחורה. הסינון הסופי נעשה בקוד כי הוא דורש להשוות
   * סדר בין הודעות.
   */
  const leads = await db.lead
    .findMany({
      where: {
        doNotContact: false,
        messages: { some: { createdAt: { gte: since } } },
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        subStatus: true,
        messages: {
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: "asc" },
          select: {
            direction: true,
            broadcast: true,
            broadcastKind: true,
            templateName: true,
            bodyText: true,
            createdAt: true,
          },
          take: 100,
        },
      },
      take: 1000,
    })
    .catch(() => []);

  const now = new Date();

  const rows = leads
    .map((lead) => {
      const window = replyAfterBroadcast(lead.messages, now);
      return window ? { lead, window } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  /**
   * מי שענה שהוא כבר לקוח יורד לסוף הרשימה.
   *
   * הסדר עצמו חי ב-lib כדי שיהיה מכוסה בבדיקות - מסך
   * שממיין בעצמו הוא מסך שאף אחד לא בודק.
   */
  const ordered = sortReplies(
    rows.map((row) => ({ ...row, status: row.lead.status }))
  );

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          התעניינות לאחר דיוור
          <span className="count">{ordered.length} ענו</span>
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
        רק מי שקיבל דיוור <strong>וענה</strong>, עד {REPLY_WINDOW_DAYS} יום
        אחרי. מי שביקש להסיר לא מופיע כאן — הוא ברשימה השחורה.
      </div>

      {ordered.length === 0 ? (
        <div className="empty">
          <strong>אף אחד עוד לא ענה</strong>
          ברגע שמישהו יגיב לדיוור, הוא יופיע כאן.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {ordered.map(({ lead, window }) => {
            const name =
              `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
              displayPhone(lead.phone);

            return (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="card"
                style={{
                  display: "grid",
                  gap: 6,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: 14.5 }}>{name}</strong>
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
                      background: "#d1fadf",
                      color: "#027a48",
                    }}
                  >
                    ענה תוך {replyDelayLabel(window)}
                  </span>
                  <span style={{ fontSize: 12.5, color: "#667085" }}>
                    {lead.status}
                    {lead.subStatus ? ` · ${lead.subStatus}` : ""}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13.5,
                    color: "#101828",
                    background: "#f9fafb",
                    borderRadius: 8,
                    padding: "8px 10px",
                    lineHeight: 1.6,
                  }}
                >
                  “{window.replyText}”
                </div>

                <div style={{ fontSize: 12.5, color: "#667085" }}>
                  קיבל: {window.broadcastLabel} ·{" "}
                  {window.broadcastAt.toLocaleString("he-IL", {
                    timeZone: "Asia/Jerusalem",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
