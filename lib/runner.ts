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
import { sendEmail } from "./email";
import { getSettings } from "./settings";
import { leadsForSlot, markSent, type Slot } from "./callback-list";
import { israelParts } from "./working-hours";

export type RunSummary = {
  picked: number;
  taskReminders: number;
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

  /**
   * מעקה אחרון: גם אם משימה נוצרה איכשהו לליד מכירה -
   * היא לא תצא. הלקוחות של הקונה לא מקבלים מאיתנו הודעות.
   */
  if (job.lead?.origin === "sale") {
    await db.scheduledJob.update({
      where: { id: job.id },
      data: { state: "cancelled", lastError: "ליד מכירה - אין אוטומציה" },
    });
    summary.skipped++;
    return;
  }

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
    taskReminders: 0,
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

  await sendTaskReminders(summary);
  await sendCallbackList();
  await syncSaleLeads();

  // חותמת ריצה - ככה רואים במסך החוקים אם המנוע חי
  await db.settings
    .upsert({
      where: { id: "main" },
      create: { id: "main", lastRunAt: new Date() },
      update: { lastRunAt: new Date() },
    })
    .catch(() => null);

  return summary;
}

/**
 * תזכורות למשימות שהגיע זמנן.
 * אתה פותח משימה ל-17:00, ובשעה 17:00 מגיע לך מייל.
 * כל משימה מקבלת תזכורת אחת בלבד.
 */
async function sendTaskReminders(summary: RunSummary) {
  const appUrl = process.env.APP_URL?.trim() || "";

  const dueTasks = await db.task.findMany({
    where: {
      done: false,
      notifiedAt: null,
      dueAt: { not: null, lte: new Date() },
    },
    include: { lead: true },
    take: 25,
  });

  for (const task of dueTasks) {
    const lines = [task.title];

    if (task.body) lines.push("", task.body);

    if (task.lead) {
      lines.push(
        "",
        `לקוח:  ${task.lead.firstName ?? displayPhone(task.lead.phone)}`,
        `טלפון: ${displayPhone(task.lead.phone)}`,
        `סטטוס: ${task.lead.status}`
      );
      if (appUrl) {
        lines.push("", `כרטיס הליד: ${appUrl}/leads/${task.lead.id}`);
        lines.push(`חיוג ישיר: tel:${displayPhone(task.lead.phone).replace(/\D/g, "")}`);
      }
    }

    lines.push("", "— העוזר של רובי");

    await sendEmail({
      subject: task.urgent ? `🔥 ${task.title}` : `תזכורת: ${task.title}`,
      body: lines.join("\n"),
    });

    await db.task
      .update({ where: { id: task.id }, data: { notifiedAt: new Date() } })
      .catch(() => null);

    if (task.leadId) {
      await db.alert
        .create({
          data: {
            leadId: task.leadId,
            title: "הגיע זמן המשימה",
            body: task.title,
          },
        })
        .catch(() => null);
    }

    summary.taskReminders++;
  }
}


/**
 * רשימת החזרה, פעמיים ביום.
 *
 * רצה בתוך השעה שנקבעה בלבד, ומסמנת את מי שכבר נשלח -
 * ככה לא יוצאות שתי רשימות לאותם לידים.
 */
async function sendCallbackList() {
  const settings = await getSettings();
  if (!settings.callbackEnabled) return;

  const now = new Date();
  const p = israelParts(now);
  const hour = Math.floor(p.minutes / 60);

  let slot: Slot | null = null;
  if (hour === settings.callbackMorningHour) slot = "morning";
  else if (hour === settings.callbackAfternoonHour) slot = "afternoon";
  if (!slot) return;

  const leads = await leadsForSlot(slot, now);
  if (leads.length === 0) return;

  const appUrl = process.env.APP_URL?.trim() || "";
  const label = slot === "morning" ? "רשימת הבוקר" : "רשימת הצהריים";

  const lines = [
    `${leads.length} לידים לחזור אליהם`,
    "",
    ...leads.map(
      (l, i) => `${i + 1}. ${l.name} · ${l.phone} · ${l.status}`
    ),
  ];

  if (appUrl) lines.push("", `הרשימה במערכת: ${appUrl}/callbacks`);
  lines.push("", "— העוזר של רובי");

  await sendEmail({
    subject: `${label} · ${leads.length} לידים לחזור אליהם`,
    body: lines.join("\n"),
  });

  await db.task
    .create({
      data: {
        title: `${label} - ${leads.length} לידים`,
        body: leads
          .slice(0, 40)
          .map((l) => `${l.name} · ${l.phone} · ${l.status}`)
          .join("\n"),
        dueAt: now,
        urgent: false,
      },
    })
    .catch(() => null);

  await markSent(leads.map((l) => l.id));
}


/**
 * מחזיר למכירה לידים שדלפו לרשימה הרגילה.
 *
 * הקליטה מחזירה לפעמים ליד קיים ל-leadmanager גם אם הוא
 * שייך לקמפיין מכירה. במקום לגעת בקוד הקליטה, המנוע מיישר
 * את זה כל דקה - וגם מבטל להם משימות ממתינות, כך שלקוח
 * של הקונה לא יקבל מאיתנו הודעה.
 */
async function syncSaleLeads() {
  const campaigns = await db.salesCampaign
    .findMany({
      where: { active: true },
      select: { name: true, pricePerLead: true },
    })
    .catch(() => []);

  if (campaigns.length === 0) return;

  const priceByKey = new Map<string, number>(
    campaigns.map((c) => [
      c.name.trim().replace(/\s+/g, " ").toLowerCase(),
      Number(c.pricePerLead ?? 0),
    ])
  );

  /**
   * סורקים רק את מה שנגע לאחרונה. סריקה מלאה כל דקה מיותרת,
   * והכפתור בהגדרות עושה מעבר על הכל כשצריך.
   */
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const leads = await db.lead
    .findMany({
      where: { origin: { not: "sale" }, updatedAt: { gte: since } },
      select: { id: true, extra: true, intakeAt: true, source: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    })
    .catch(() => []);

  for (const lead of leads) {
    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, string>)
        : {};

    const name = extra.fb_campaign || extra.campaign;
    if (!name) continue;

    const key = name.trim().replace(/\s+/g, " ").toLowerCase();
    const price = priceByKey.get(key);
    if (price === undefined) continue;

    await db.lead
      .update({ where: { id: lead.id }, data: { origin: "sale" } })
      .catch(() => null);

    /**
     * בלי כניסת מכירה הליד לא יופיע ברשימה של הקונה ולא
     * ייספר בהכנסה. הזמן נלקח מתאריך הכניסה המקורי, כדי
     * שהמיון בסוף יהיה לפי מתי הליד באמת נכנס.
     */
    const already = await db.leadEntry.findFirst({
      where: { leadId: lead.id, campaign: name, isSale: true },
    });

    if (!already) {
      await db.leadEntry
        .create({
          data: {
            leadId: lead.id,
            campaign: name,
            source: lead.source,
            isSale: true,
            price,
            at: lead.intakeAt,
          },
        })
        .catch(() => null);
    }

    await db.scheduledJob
      .updateMany({
        where: { leadId: lead.id, state: "pending" },
        data: { state: "cancelled", lastError: "ליד מכירה - הוחזר אוטומטית" },
      })
      .catch(() => null);
  }
}
