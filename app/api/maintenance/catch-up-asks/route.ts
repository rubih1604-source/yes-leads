import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { decideInbound } from "@/lib/inbound-context";
import { lastListSendForMany } from "@/lib/broadcast-membership";
import { replyToLead } from "@/lib/bot";
import { SUPPLIER_QUESTION, ASKED_EVENT } from "@/lib/supplier-check";
import { REPLY_WINDOW_DAYS } from "@/lib/broadcast-replies";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  השלמת שאלת הסינון למי שהגיב ולא נענה
 * ============================================================
 *
 *  **למה זה נחוץ.**
 *
 *  הבוט פועל על הודעה **ברגע שהיא מגיעה**. אם באותו רגע
 *  משהו חסם אותו - גרסה ישנה, מתג כבוי, שעה מחוץ לחלון -
 *  התגובה אבדה. הבוט לא חוזר אחורה מעצמו.
 *
 *  באמצע מבצע זה הפרש של עסקאות: אנשים ענו, לא קיבלו
 *  כלום, והם יושבים בצד בלי שאף אחד יודע.
 *
 *  **אותה הכרעה בדיוק.** מי שראוי לקבל את השאלה נקבע כאן
 *  באותה פונקציה שהבוט מריץ, ונשלח באותו מסלול שליחה.
 *  אין כאן היגיון שני שיכול לסטות ממנו.
 *
 *  GET  = מראה מי מחכה. לא שולח כלום.
 *  POST = שולח להם את השאלה.
 */

async function pending() {
  const since = new Date(
    Date.now() - (REPLY_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000
  );

  const leads = await db.lead
    .findMany({
      where: {
        /** המעקות של הבוט חלים גם כאן */
        doNotContact: false,
        botMuted: false,
        messages: { some: { direction: "in", createdAt: { gte: since } } },
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        status: true,
        origin: true,
        chatId: true,
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
        events: {
          where: { type: ASKED_EVENT },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 1000,
    })
    .catch(() => []);

  const listSends = await lastListSendForMany(
    leads.map((lead) => lead.phone)
  ).catch(() => new Map<string, Date>());

  const settings = await getSettings();
  const now = new Date();

  return leads
    .map((lead) => {
      const decision = decideInbound({
        messages: lead.messages,
        origin: lead.origin,
        askedAt: lead.events[0]?.createdAt ?? null,
        blacklisted: false,
        listSendAt: listSends.get(lead.phone) ?? null,
        askEveryone: settings.botAskAll,
        now,
      });

      return decision.askSupplier ? { lead, decision } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

/** קוראת בלבד */
export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await pending();

  return NextResponse.json({
    כמה: rows.length,
    מי: rows.map((r) =>
      `${r.lead.firstName ?? ""} ${displayPhone(r.lead.phone)} · ענה: "${(
        r.decision.window?.replyText ?? ""
      ).slice(0, 60)}"`.trim()
    ),
    מסקנה:
      rows.length === 0
        ? "אין אף אחד שהגיב לדיוור ולא קיבל את השאלה."
        : `${rows.length} אנשים הגיבו לדיוור ולא קיבלו את שאלת הסינון. שליחה תשלח להם אותה עכשיו.`,
  });
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await pending();

  let sent = 0;
  let failed = 0;

  for (const { lead, decision } of rows) {
    const ok = await replyToLead({
      leadId: lead.id,
      phone: lead.phone,
      chatId: lead.chatId,
      text: SUPPLIER_QUESTION,
    }).catch(() => false);

    if (!ok) {
      failed++;
      continue;
    }

    sent++;

    /**
     * נרשם בדיוק כמו שהבוט רושם, כדי שלא ישאל שוב
     * כשהתשובה תגיע.
     */
    await db.leadEvent
      .create({
        data: {
          leadId: lead.id,
          type: ASKED_EVENT,
          actor: "bot",
          payload: { reason: decision.reason, catchUp: true },
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    נשלחו: sent,
    נכשלו: failed,
    מסקנה: `נשלחה שאלת הסינון ל-${sent} אנשים.${
      failed ? ` ${failed} נכשלו - בדוק ביומן ההודעות.` : ""
    } מכאן התשובות שלהם יטופלו אוטומטית.`,
  });
}
