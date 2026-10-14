import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { addDoor, leadIdsInLog, DOOR_FACEBOOK } from "@/lib/via";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  מסמן בדיעבד לידים שהגיעו מהחיבור הישיר
 * ============================================================
 *
 *  מעכשיו כל ליד נכנס עם חותמת של הדלת שממנה הגיע. אבל
 *  הלידים שכבר נכנסו מהחיבור הישיר נשמרו **לפני** שהחותמת
 *  הייתה קיימת, ולכן הם נראים בכרטיס כאילו באו מליד מנגר.
 *
 *  כאן משחזרים את האמת מיומן הקליטה: לכל פנייה מפייסבוק
 *  נשמר מזהה הליד (fb_leadid), ואותו מזהה שמור גם על הליד
 *  עצמו. ההצלבה הזו היא עדות ולא ניחוש.
 *
 *  GET  - תצוגה מקדימה, מה יסומן
 *  POST - ביצוע
 */

async function plan() {
  const logs = await db.webhookLog
    .findMany({
      where: { source: "facebook" },
      select: { rawPayload: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    })
    .catch(() => []);

  const fbIds = new Set<string>();
  for (const log of logs) {
    for (const id of leadIdsInLog(log.rawPayload)) fbIds.add(id);
  }

  if (fbIds.size === 0) return { fbIds: [] as string[], changes: [] };

  /**
   * מחפשים את הלידים לפי אותו מזהה.
   *
   * המזהה נשמר בשדות הנוספים של הליד, ולכן מסתמכים על
   * השוואת טקסט ולא על שדה נפרד.
   */
  const leads = await db.lead
    .findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        extra: true,
        entries: { orderBy: { at: "asc" }, select: { id: true, via: true, at: true } },
      },
    })
    .catch(() => []);

  const changes: Array<{
    leadId: string;
    name: string;
    fbLeadId: string;
    entryId: string;
    from: string | null;
    to: string;
  }> = [];

  for (const lead of leads) {
    const extra =
      lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra)
        ? (lead.extra as Record<string, unknown>)
        : {};

    const fbId = typeof extra.fb_leadid === "string" ? extra.fb_leadid.trim() : "";
    if (!fbId || !fbIds.has(fbId)) continue;

    /**
     * מסמנים את הכניסה הראשונה.
     *
     * אותו מזהה ליד שייך להגעה אחת בלבד, וההגעה הראשונה
     * היא זו שנוצרה כשהחיבור הישיר שלח אותה.
     */
    const entry = lead.entries[0];
    if (!entry) continue;

    const merged = addDoor(entry.via, DOOR_FACEBOOK);
    if (!merged) continue;

    changes.push({
      leadId: lead.id,
      name: `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.phone,
      fbLeadId: fbId,
      entryId: entry.id,
      from: entry.via,
      to: merged,
    });
  }

  return { fbIds: [...fbIds], changes };
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { fbIds, changes } = await plan();

  return NextResponse.json({
    ok: true,
    לידים_שפייסבוק_שלחה: fbIds.length,
    יסומנו: changes.length,
    changes: changes.slice(0, 200),
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { changes } = await plan();
  let marked = 0;

  for (const change of changes) {
    const done = await db.leadEntry
      .update({ where: { id: change.entryId }, data: { via: change.to } })
      .catch(() => null);

    if (done) marked++;
  }

  return NextResponse.json({ ok: true, marked });
}
