/**
 * ============================================================
 *  חישוב הביצועים
 * ============================================================
 *
 *  הכלל: כל מספר כאן צריך להוביל להחלטה.
 *  "כמה הודעות נשלחו" הוא מספר יפה. "איזו תבנית מביאה
 *  מענה כפול" הוא מספר ששווה כסף.
 *
 *  הגדרות:
 *  - "ענה" = הלקוח שלח הודעה תוך 72 שעות מהשליחה
 *  - "נסגר" = הליד עבר לסטטוס סגירה אחרי שקיבל את ההודעה
 *  - "זמן למגע ראשון" = מרגע כניסת הליד עד ההודעה הראשונה אליו
 */

import { db } from "./db";
import { STATUSES } from "./statuses";

const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

export type TemplateStat = {
  name: string;
  displayName: string | null;
  sent: number;
  replied: number;
  replyRate: number;
  won: number;
  winRate: number;
};

export type StatusStat = {
  name: string;
  color: string;
  current: number;
  everEntered: number;
};

export type Overview = {
  leads: number;
  contacted: number;
  replied: number;
  won: number;
  winRate: number;
  replyRate: number;
};

export type SpeedStat = {
  medianMinutes: number | null;
  within5: number;
  within60: number;
  never: number;
  total: number;
};

export type AssistantStat = {
  answered: number;
  classified: number;
  escalated: number;
  unanswered: number;
  skipped: number;
};

export type DashboardData = {
  days: number;
  now: Overview;
  previous: Overview;
  templates: TemplateStat[];
  statuses: StatusStat[];
  speed: SpeedStat;
  assistant: AssistantStat;
};

const WON_STATUSES = new Set(
  STATUSES.filter((s) => s.won).map((s) => s.name)
);

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

async function overviewFor(from: Date, to: Date): Promise<Overview> {
  const leads = await db.lead.findMany({
    where: { intakeAt: { gte: from, lt: to } },
    select: { id: true, status: true },
  });

  if (leads.length === 0) {
    return { leads: 0, contacted: 0, replied: 0, won: 0, winRate: 0, replyRate: 0 };
  }

  const ids = leads.map((l) => l.id);

  const messages = await db.message.findMany({
    where: { leadId: { in: ids } },
    select: { leadId: true, direction: true },
  });

  const contactedSet = new Set<string>();
  const repliedSet = new Set<string>();
  for (const m of messages) {
    if (m.direction === "out") contactedSet.add(m.leadId);
    else repliedSet.add(m.leadId);
  }

  const won = leads.filter((l) => WON_STATUSES.has(l.status)).length;

  return {
    leads: leads.length,
    contacted: contactedSet.size,
    replied: repliedSet.size,
    won,
    winRate: pct(won, leads.length),
    replyRate: pct(repliedSet.size, contactedSet.size),
  };
}

export async function getDashboard(days = 30): Promise<DashboardData> {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevFrom = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);

  const [current, previous] = await Promise.all([
    overviewFor(from, now),
    overviewFor(prevFrom, from),
  ]);

  // ---------- ביצועי תבניות ----------

  const sends = await db.message.findMany({
    where: {
      direction: "out",
      status: "sent",
      templateName: { not: null },
      createdAt: { gte: from },
    },
    select: { leadId: true, templateName: true, createdAt: true },
  });

  const leadIds = Array.from(new Set(sends.map((s) => s.leadId)));

  const inbound = leadIds.length
    ? await db.message.findMany({
        where: { leadId: { in: leadIds }, direction: "in" },
        select: { leadId: true, createdAt: true },
      })
    : [];

  const inboundByLead = new Map<string, Date[]>();
  for (const m of inbound) {
    const list = inboundByLead.get(m.leadId) ?? [];
    list.push(m.createdAt);
    inboundByLead.set(m.leadId, list);
  }

  const wonEvents = leadIds.length
    ? await db.leadEvent.findMany({
        where: {
          leadId: { in: leadIds },
          type: "status_changed",
          toStatus: { in: Array.from(WON_STATUSES) },
        },
        select: { leadId: true, createdAt: true },
      })
    : [];

  const wonByLead = new Map<string, Date>();
  for (const e of wonEvents) {
    const existing = wonByLead.get(e.leadId);
    if (!existing || e.createdAt < existing) wonByLead.set(e.leadId, e.createdAt);
  }

  const byTemplate = new Map<
    string,
    { sent: number; replied: number; won: number }
  >();

  for (const send of sends) {
    const key = send.templateName!;
    const row = byTemplate.get(key) ?? { sent: 0, replied: 0, won: 0 };
    row.sent++;

    const replies = inboundByLead.get(send.leadId) ?? [];
    const gotReply = replies.some(
      (r) =>
        r.getTime() > send.createdAt.getTime() &&
        r.getTime() - send.createdAt.getTime() < REPLY_WINDOW_MS
    );
    if (gotReply) row.replied++;

    const wonAt = wonByLead.get(send.leadId);
    if (wonAt && wonAt.getTime() > send.createdAt.getTime()) row.won++;

    byTemplate.set(key, row);
  }

  const templateRows = await db.template.findMany({
    select: { name: true, displayName: true },
  });
  const displayNames = new Map(
    templateRows.map((t) => [t.name, t.displayName])
  );

  const templates: TemplateStat[] = Array.from(byTemplate.entries())
    .map(([name, row]) => ({
      name,
      displayName: displayNames.get(name) ?? null,
      sent: row.sent,
      replied: row.replied,
      replyRate: pct(row.replied, row.sent),
      won: row.won,
      winRate: pct(row.won, row.sent),
    }))
    .sort((a, b) => b.sent - a.sent);

  // ---------- סטטוסים ----------

  const grouped = await db.lead.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const currentByStatus = new Map(
    grouped.map((g) => [g.status, g._count._all])
  );

  const entered = await db.leadEvent.groupBy({
    by: ["toStatus"],
    where: { type: "status_changed", createdAt: { gte: from } },
    _count: { _all: true },
  });
  const enteredByStatus = new Map(
    entered
      .filter((e) => e.toStatus)
      .map((e) => [e.toStatus as string, e._count._all])
  );

  const statuses: StatusStat[] = STATUSES.map((s) => ({
    name: s.name,
    color: s.color,
    current: currentByStatus.get(s.name) ?? 0,
    everEntered: enteredByStatus.get(s.name) ?? 0,
  })).filter((s) => s.current > 0 || s.everEntered > 0);

  // ---------- מהירות מגע ראשון ----------

  const periodLeads = await db.lead.findMany({
    where: { intakeAt: { gte: from } },
    select: { id: true, intakeAt: true },
  });

  const firstOut = periodLeads.length
    ? await db.message.findMany({
        where: {
          leadId: { in: periodLeads.map((l) => l.id) },
          direction: "out",
        },
        select: { leadId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const firstByLead = new Map<string, Date>();
  for (const m of firstOut) {
    if (!firstByLead.has(m.leadId)) firstByLead.set(m.leadId, m.createdAt);
  }

  const minutes: number[] = [];
  let never = 0;
  for (const lead of periodLeads) {
    const first = firstByLead.get(lead.id);
    if (!first) {
      never++;
      continue;
    }
    const diff = Math.round(
      (first.getTime() - lead.intakeAt.getTime()) / 60000
    );
    if (diff >= 0) minutes.push(diff);
  }

  const speed: SpeedStat = {
    medianMinutes: median(minutes),
    within5: minutes.filter((m) => m <= 5).length,
    within60: minutes.filter((m) => m <= 60).length,
    never,
    total: periodLeads.length,
  };

  // ---------- העוזר ----------

  const events = await db.leadEvent.groupBy({
    by: ["type"],
    where: { createdAt: { gte: from } },
    _count: { _all: true },
  });
  const eventCount = new Map(events.map((e) => [e.type, e._count._all]));

  const unanswered = await db.task.count({
    where: { createdAt: { gte: from }, needsReview: true },
  });

  const assistant: AssistantStat = {
    answered: eventCount.get("bot_answered") ?? 0,
    classified: eventCount.get("bot_classified") ?? 0,
    escalated: eventCount.get("bot_escalated") ?? 0,
    unanswered,
    skipped: eventCount.get("bot_skipped") ?? 0,
  };

  return {
    days,
    now: current,
    previous,
    templates,
    statuses,
    speed,
    assistant,
  };
}
