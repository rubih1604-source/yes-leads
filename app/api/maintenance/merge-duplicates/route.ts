import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { normalizePhone, displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  איחוד רשומות של אותו אדם
 * ============================================================
 *
 *  למה בכלל נוצרו שתי רשומות:
 *
 *  הטלפון הוא מפתח ייחודי, ולכן שתי שורות לאותו אדם אומרות
 *  שני מספרים שונים במסד. זה קרה כש"+972 052 123 4567"
 *  נשמר בלי להסיר את האפס שאחרי קידומת המדינה, והפך
 *  ל-"+9720521234567" - מספר אחר לגמרי מ-"+972521234567".
 *
 *  הכלי הזה מנרמל מחדש את כל המספרים, מאתר קבוצות שבהן
 *  כמה רשומות מצביעות על אותו מספר אמיתי, ומאחד אותן.
 *
 *  מה נשמר באיחוד:
 *    - כל ההודעות וההתכתבות
 *    - כל היומן (מתי נכנס, שינויי סטטוס)
 *    - כל הכניסות, כולל אלה שנספרות להכנסה
 *    - משימות ותזכורות פתוחות
 *
 *  איזו רשומה נשארת: זו שעבדת עליה. סטטוס שאינו "חדש" גובר,
 *  ואחריו כמות ההודעות והאירועים. בתיקו - הוותיקה.
 *
 *  GET  = מראה בלבד. לא משנה כלום.
 *  POST = מבצע.
 */

type Candidate = {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  createdAt: Date;
  messages: number;
  events: number;
};

function nameOf(l: Candidate): string {
  return `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || "ללא שם";
}

/** כמה "אמיתית" הרשומה - מה שעבדת עליו מנצח */
function score(l: Candidate): number {
  const worked = l.status && l.status !== "חדש" ? 1000 : 0;
  return worked + l.messages + l.events;
}

async function build() {
  const leads = await db.lead.findMany({
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      createdAt: true,
      _count: { select: { messages: true, events: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // קיבוץ לפי המספר **אחרי נרמול מחדש**
  const byPhone = new Map<string, Candidate[]>();

  for (const l of leads) {
    const normalized = normalizePhone(l.phone);
    if (!normalized) continue;

    const row: Candidate = {
      id: l.id,
      phone: l.phone,
      firstName: l.firstName,
      lastName: l.lastName,
      status: l.status,
      createdAt: l.createdAt,
      messages: l._count.messages,
      events: l._count.events,
    };

    byPhone.set(normalized, [...(byPhone.get(normalized) ?? []), row]);
  }

  const groups: Array<{
    phone: string;
    keep: Candidate;
    merge: Candidate[];
  }> = [];

  for (const [normalized, list] of byPhone) {
    if (list.length < 2) continue;

    const sorted = [...list].sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    groups.push({
      phone: normalized,
      keep: sorted[0],
      merge: sorted.slice(1),
    });
  }

  return {
    groups,
    leadsTotal: leads.length,
    duplicateGroups: groups.length,
    recordsRemoved: groups.reduce((n, g) => n + g.merge.length, 0),
  };
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = await build();

  return NextResponse.json({
    ok: true,
    mode: "תצוגה מקדימה - לא בוצע שום שינוי",
    verdict:
      plan.duplicateGroups === 0
        ? "אין כפילויות. כל ליד מופיע פעם אחת"
        : `${plan.duplicateGroups} אנשים רשומים פעמיים. אחרי האיחוד יהיו ${
            plan.leadsTotal - plan.recordsRemoved
          } לידים במקום ${plan.leadsTotal}`,
    leadsNow: plan.leadsTotal,
    leadsAfter: plan.leadsTotal - plan.recordsRemoved,
    duplicateGroups: plan.duplicateGroups,
    details: plan.groups.slice(0, 50).map((g) => ({
      phone: displayPhone(g.phone),
      נשאר: `${nameOf(g.keep)} · ${g.keep.status} · ${g.keep.phone}`,
      מאוחד: g.merge.map(
        (m) => `${nameOf(m)} · ${m.status} · ${m.phone}`
      ),
    })),
    howToApply: "כדי לבצע בפועל צריך לשלוח POST לאותה כתובת",
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = await build();
  const done: string[] = [];
  const failed: string[] = [];

  for (const group of plan.groups) {
    try {
      for (const loser of group.merge) {
        /**
         * מעבירים הכל לרשומה שנשארת **לפני** המחיקה.
         * מחיקת ליד מוחקת איתו את כל מה שתלוי בו, ולכן
         * סדר הפעולות כאן הוא קריטי.
         */
        await db.message.updateMany({
          where: { leadId: loser.id },
          data: { leadId: group.keep.id },
        });

        await db.leadEvent.updateMany({
          where: { leadId: loser.id },
          data: { leadId: group.keep.id },
        });

        await db.leadEntry.updateMany({
          where: { leadId: loser.id },
          data: { leadId: group.keep.id },
        });

        await db.task.updateMany({
          where: { leadId: loser.id },
          data: { leadId: group.keep.id },
        });

        await db.alert.updateMany({
          where: { leadId: loser.id },
          data: { leadId: group.keep.id },
        });

        /**
         * משימות מתוזמנות לא מועברות אלא נמחקות.
         *
         * לרשומה שנשארת כבר יש את שלה, ויש אילוץ ייחודיות
         * על צירוף של ליד וחוק - העברה הייתה נכשלת. מחיקה
         * כאן לא מאבדת כלום, כי מדובר באותו רצף בדיוק.
         */
        await db.scheduledJob.deleteMany({ where: { leadId: loser.id } });

        await db.lead.delete({ where: { id: loser.id } });
      }

      /**
       * הרשומה שנשארה מקבלת את המספר המנורמל, כדי שהכניסה
       * הבאה של אותו אדם תתחבר אליה ולא תיצור שלישית.
       */
      if (group.keep.phone !== group.phone) {
        await db.lead.update({
          where: { id: group.keep.id },
          data: { phone: group.phone },
        });
      }

      done.push(`${nameOf(group.keep)} · ${displayPhone(group.phone)}`);
    } catch (error) {
      failed.push(
        `${nameOf(group.keep)} - ${
          error instanceof Error ? error.message : "שגיאה לא ידועה"
        }`
      );
    }
  }

  const after = await db.lead.count().catch(() => 0);

  return NextResponse.json({
    ok: failed.length === 0,
    mode: "בוצע",
    merged: done.length,
    leadsAfter: after,
    failed,
    note:
      "כל ההודעות, היומן, הכניסות והמשימות עברו לרשומה שנשארה",
  });
}
