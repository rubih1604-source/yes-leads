import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { mapLeadManagerPayload } from "@/lib/leadmanager-mapping";
import { isKnownStatus } from "@/lib/statuses";

export const dynamic = "force-dynamic";

/**
 * קליטת ליד או שינוי סטטוס מליד מנגר.
 *
 * הכלל: קודם שומרים את מה שהגיע, אחר כך מנסים להבין אותו.
 * גם אם המיפוי נכשל - שום דבר לא הולך לאיבוד.
 */
export async function POST(request: Request) {
  let raw: unknown = null;

  try {
    raw = await request.json();
  } catch {
    const text = await request.text().catch(() => "");
    raw = { _unparsed: text };
  }

  // 1. שומרים גולמי לפני הכל
  const log = await db.webhookLog.create({
    data: { source: "leadmanager", rawPayload: raw as object },
  });

  // 2. בודקים טוקן (אם הוגדר)
  const expectedToken = process.env.LEADMANAGER_WEBHOOK_TOKEN;
  if (expectedToken) {
    const url = new URL(request.url);
    const provided =
      request.headers.get("x-webhook-token") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      url.searchParams.get("token");

    if (provided !== expectedToken) {
      await db.webhookLog.update({
        where: { id: log.id },
        data: { error: "טוקן שגוי או חסר" },
      });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // 3. מעבדים - וגם אם נכשל, מחזירים 200 כדי שליד מנגר לא ינסה שוב ושוב
  try {
    const mapped = mapLeadManagerPayload(raw);
    const phone = normalizePhone(mapped.phone);

    if (!phone) {
      await db.webhookLog.update({
        where: { id: log.id },
        data: { error: "לא נמצא מספר טלפון תקין ב-payload" },
      });
      return NextResponse.json({ ok: true, warning: "no phone" });
    }

    const incomingStatus =
      mapped.status && isKnownStatus(mapped.status) ? mapped.status : null;

    const existing = await db.lead.findUnique({ where: { phone } });

    if (!existing) {
      const lead = await db.lead.create({
        data: {
          phone,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          status: incomingStatus ?? "חדש",
          source: mapped.source,
          needsMapping: !incomingStatus && !!mapped.status,
        },
      });

      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "lead_created",
          toStatus: lead.status,
          actor: "system",
          payload: { webhookLogId: log.id, rawStatus: mapped.status },
        },
      });
    } else {
      const statusChanged =
        incomingStatus !== null && incomingStatus !== existing.status;

      await db.lead.update({
        where: { id: existing.id },
        data: {
          firstName: mapped.firstName ?? existing.firstName,
          lastName: mapped.lastName ?? existing.lastName,
          source: mapped.source ?? existing.source,
          status: incomingStatus ?? existing.status,
          needsMapping: !incomingStatus && !!mapped.status,
        },
      });

      await db.leadEvent.create({
        data: {
          leadId: existing.id,
          type: statusChanged ? "status_changed" : "webhook_received",
          fromStatus: statusChanged ? existing.status : null,
          toStatus: statusChanged ? incomingStatus : null,
          actor: "system",
          payload: { webhookLogId: log.id, rawStatus: mapped.status },
        },
      });
    }

    await db.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await db.webhookLog.update({
      where: { id: log.id },
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ ok: true, warning: "processing failed" });
  }
}

/** בדיקה מהירה שהכתובת חיה */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "leadmanager webhook" });
}
