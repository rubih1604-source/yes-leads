import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { mapLeadManagerPayload } from "@/lib/leadmanager-mapping";
import { isKnownStatus } from "@/lib/statuses";
import { scheduleForStatus } from "@/lib/rules";

export const dynamic = "force-dynamic";

/**
 * קליטת ליד מליד מנגר.
 *
 * מקבל גם GET וגם POST:
 *  - GET  -> הנתונים מגיעים בכתובת עצמה (query string)
 *  - POST -> הנתונים מגיעים בגוף הבקשה, ואם לא, נופלים חזרה לכתובת
 *
 * הכלל: קודם שומרים את מה שהגיע, אחר כך מנסים להבין אותו.
 * גם אם המיפוי נכשל - שום דבר לא הולך לאיבוד.
 */

/** שולף את כל הפרמטרים מהכתובת לאובייקט */
function queryToObject(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key === "token") continue; // הטוקן הוא אימות, לא נתון של הליד
    out[key] = value;
  }
  return out;
}

/** בודק שהטוקן שהגיע תואם למה שהוגדר */
function tokenIsValid(request: Request): boolean {
  const expected = process.env.LEADMANAGER_WEBHOOK_TOKEN;
  if (!expected) return true; // לא הוגדר טוקן - לא בודקים

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-webhook-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token");

  return provided === expected;
}

async function handle(request: Request) {
  const fromQuery = queryToObject(request.url);

  // גוף הבקשה - קיים רק ב-POST.
  // חשוב: קוראים את הגוף פעם אחת בלבד כטקסט, ורק אחר כך מנתחים אותו.
  // קריאה כפולה (json ואז text) מרוקנת את הגוף ומחזירה ריק.
  let bodyText = "";
  if (request.method !== "GET") {
    bodyText = await request.text().catch(() => "");
  }

  let fromBody: unknown = null;
  if (bodyText.trim()) {
    try {
      // ניסיון ראשון: JSON
      fromBody = JSON.parse(bodyText);
    } catch {
      // ניסיון שני: form-urlencoded (key=value&key=value)
      const params = new URLSearchParams(bodyText);
      const obj: Record<string, string> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      fromBody = Object.keys(obj).length ? obj : { _unparsed: bodyText };
    }
  }

  // מאחדים: מה שהגיע בגוף גובר, מה שבכתובת משלים
  const raw: Record<string, unknown> = {
    ...fromQuery,
    ...(fromBody && typeof fromBody === "object" ? (fromBody as object) : {}),
    _method: request.method,
    _contentType: request.headers.get("content-type") || "(אין)",
    _bodyLength: String(bodyText.length),
  };

  // 1. שומרים גולמי לפני הכל
  const log = await db.webhookLog.create({
    data: { source: "leadmanager", rawPayload: raw as Prisma.InputJsonObject },
  });

  // 2. בודקים טוקן
  if (!tokenIsValid(request)) {
    await db.webhookLog.update({
      where: { id: log.id },
      data: { error: "טוקן שגוי או חסר" },
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. מעבדים. גם אם נכשל - מחזירים 200 כדי שליד מנגר לא ינסה שוב ושוב
  try {
    const mapped = mapLeadManagerPayload(raw);
    const phone = normalizePhone(mapped.phone);

    if (!phone) {
      await db.webhookLog.update({
        where: { id: log.id },
        data: {
          error:
            Object.keys(fromQuery).length === 0 && !fromBody
              ? "הבקשה הגיעה ריקה - לא נשלחו שדות כלל"
              : "לא נמצא מספר טלפון תקין",
        },
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
        },
      });

      await db.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "lead_created",
          toStatus: lead.status,
          actor: "system",
          payload: { webhookLogId: log.id },
        },
      });

      // אם יש חוקים לסטטוס שבו הליד נכנס - מתזמנים אותם
      await scheduleForStatus(lead.id, lead.status);
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
        },
      });

      await db.leadEvent.create({
        data: {
          leadId: existing.id,
          type: statusChanged ? "status_changed" : "webhook_received",
          fromStatus: statusChanged ? existing.status : null,
          toStatus: statusChanged ? incomingStatus : null,
          actor: "system",
          payload: { webhookLogId: log.id },
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

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
