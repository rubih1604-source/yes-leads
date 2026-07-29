/**
 * ============================================================
 *  מריץ המשימות
 * ============================================================
 *
 *  רץ כל כמה דקות, לוקח את המשימות שהגיע זמנן ומבצע אותן.
 *  בנוי כך שגם אם ירוץ פעמיים במקביל - לא יישלחו הודעות כפולות.
 */

import { db } from "./db";
import { sendTemplate } from "./texter";
import { applyStatusChange } from "./rules";
import { displayPhone } from "./phone";

export type RunSummary = {
  picked: number;
  sent: number;
  notified: number;
  statusChanged: number;
  failed: number;
  skipped: number;
  details: string[];
};

async function runOne(jobId: string, summary: RunSummary) {
  // תופסים את המשימה: רק מי שמצליח לשנות מ-pending ל-running מבצע אותה.
  // זה מה שמונע ביצוע כפול אם המריץ רץ פעמיים במקביל.
  const claimed = await db.scheduledJob.updateMany({
    where: { id: jobId, state: "pending" },
    data: { state: "running" },
  });
  if (claimed.count === 0) return;

  const job = await db.scheduledJob.findUnique({
    where: { id: jobId },
    include: { lead: true },
  });
  if (!job || !job.lead) return;

  const lead = job.lead;

  async function finish(state: string, error?: string) {
    await db.scheduledJob.update({
      where: { id: jobId },
      data: {
        state,
        lastError: error ?? null,
        attempts: { increment: 1 },
      },
    });
  }

  // מעקה: אם הלקוח ביקש להסיר אותו - לא עושים כלום
  if (lead.doNotContact) {
    summary.skipped++;
    summary.details.push(`${lead.phone}: ברשימת אי-פנייה, דולג`);
    await finish("cancelled", "ליד ברשימת אי-פנייה");
    return;
  }

  // מעקה: אם הלקוח ענה מאז שהמשימה נוצרה - עוצרים
  const replied = await db.message.findFirst({
    where: {
      leadId: lead.id,
      direction: "in",
      createdAt: { gte: job.createdAt },
    },
  });
  if (replied) {
    summary.skipped++;
    summary.details.push(`${lead.phone}: הלקוח ענה, המשימה בוטלה`);
    await finish("cancelled", "הלקוח ענה");
    return;
  }

  try {
    if (job.action === "send_template" && job.templateName) {
      const template = await db.template.findUnique({
        where: { name: job.templateName },
      });

      // תבנית שלא קיימת אצלנו - לא שולחים ומסמנים
      if (!template) {
        summary.failed++;
        summary.details.push(
          `${lead.phone}: התבנית ${job.templateName} לא נמצאה`
        );
        await finish("failed", `התבנית ${job.templateName} לא קיימת`);
        return;
      }

      const firstName = (lead.firstName || "").trim().split(/\s+/)[0] || "";
      const readTemplateText = Boolean(template.bodyText);
      const sendName =
        firstName !== "" && (!readTemplateText || template.variables > 0);

      let result = await sendTemplate({
        templateName: job.templateName,
        to: lead.phone,
        body: sendName ? [firstName] : undefined,
      });

      if (!result.ok) {
        const retry = await sendTemplate({
          templateName: job.templateName,
          to: lead.phone,
          body: sendName ? undefined : firstName ? [firstName] : undefined,
        });
        if (retry.ok) result = retry;
      }

      const data = (result.data ?? {}) as { text?: string; messageId?: string };

      await db.message.create({
        data: {
          leadId: lead.id,
          direction: "out",
          templateName: job.templateName,
          bodyText: data.text ?? template.bodyText ?? null,
          texterMessageId: data.messageId ?? null,
          status: result.ok ? "sent" : "failed",
          error: result.ok
            ? null
            : `${result.error ?? "שגיאה"} · ${JSON.stringify(result.raw).slice(0, 400)}`,
        },
      });

      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: result.ok ? "message_sent" : "message_failed",
          actor: "system",
          payload: { templateName: job.templateName, automatic: true },
        },
      });

      if (result.ok) {
        summary.sent++;
        summary.details.push(`${lead.phone}: נשלחה ${job.templateName}`);
        await finish("done");
      } else {
        summary.failed++;
        summary.details.push(
          `${lead.phone}: שליחת ${job.templateName} נכשלה`
        );
        await db.alert.create({
          data: {
            leadId: lead.id,
            title: "שליחה אוטומטית נכשלה",
            body: `${lead.firstName ?? displayPhone(lead.phone)} · ${job.templateName} · ${result.error ?? "שגיאה"}`,
          },
        });
        await finish("failed", result.error ?? "שליחה נכשלה");
      }
      return;
    }

    if (job.action === "notify") {
      await db.alert.create({
        data: {
          leadId: lead.id,
          title: "נסה להשיג את הלקוח שוב",
          body: `${lead.firstName ?? ""} ${displayPhone(lead.phone)} · עדיין בסטטוס "${lead.status}" ואין תגובה`.trim(),
        },
      });
      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "alert_created",
          actor: "system",
        },
      });
      summary.notified++;
      summary.details.push(`${lead.phone}: נוצרה התראה`);
      await finish("done");
      return;
    }

    if (job.action === "set_status" && job.targetStatus) {
      await applyStatusChange({
        leadId: lead.id,
        toStatus: job.targetStatus,
        actor: "system",
        note: "שונה אוטומטית על ידי מנוע החוקים",
      });
      await db.alert.create({
        data: {
          leadId: lead.id,
          title: "סטטוס שונה אוטומטית",
          body: `${lead.firstName ?? displayPhone(lead.phone)} הועבר ל"${job.targetStatus}"`,
        },
      });
      summary.statusChanged++;
      summary.details.push(`${lead.phone}: סטטוס -> ${job.targetStatus}`);
      // applyStatusChange כבר ביטל את המשימות, כולל זו
      await db.scheduledJob
        .update({ where: { id: jobId }, data: { state: "done" } })
        .catch(() => null);
      return;
    }

    summary.failed++;
    await finish("failed", `פעולה לא מוכרת: ${job.action}`);
  } catch (err) {
    summary.failed++;
    const message = err instanceof Error ? err.message : String(err);
    summary.details.push(`${lead.phone}: שגיאה - ${message}`);
    await finish("failed", message);
  }
}

/** מריץ את כל המשימות שהגיע זמנן */
export async function runDueJobs(limit = 50): Promise<RunSummary> {
  const summary: RunSummary = {
    picked: 0,
    sent: 0,
    notified: 0,
    statusChanged: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  const due = await db.scheduledJob.findMany({
    where: { state: "pending", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: limit,
    select: { id: true },
  });

  summary.picked = due.length;

  for (const job of due) {
    await runOne(job.id, summary);
  }

  return summary;
}
