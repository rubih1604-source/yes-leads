/**
 * ============================================================
 *  חיבור לטקסטר (WhatsApp Business API רשמי)
 * ============================================================
 *
 *  כל ההגדרות מגיעות ממשתני סביבה - כדי שאפשר יהיה לתקן
 *  טעות בהגדרה בלי לשנות קוד ולפרוס מחדש.
 *
 *  TEXTER_PROJECT_ID   - למשל easypeasy
 *  TEXTER_API_TOKEN    - הטוקן מטקסטר
 *  TEXTER_BASE_URL     - אופציונלי, דורס את הכתובת שנבנית לבד
 */

function baseUrl(): string {
  const override = process.env.TEXTER_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");

  const projectId = process.env.TEXTER_PROJECT_ID?.trim();
  if (!projectId) throw new Error("חסר TEXTER_PROJECT_ID בהגדרות");

  return `https://${projectId}.texterchat.com/server/api/v2/whatsapp`;
}

function authHeader(): string {
  const token = process.env.TEXTER_API_TOKEN?.trim();
  if (!token) throw new Error("חסר TEXTER_API_TOKEN בהגדרות");
  return `Bearer ${token}`;
}

/** טקסטר מצפה למספר בינלאומי בלי הפלוס: 972501234567 */
export function toTexterPhone(phone: string): string {
  return phone.replace(/^\+/, "").replace(/\D/g, "");
}

export type TexterResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  raw: unknown;
  error: string | null;
};

async function call<T>(
  path: string,
  init?: RequestInit
): Promise<TexterResult<T>> {
  let url: string;
  try {
    url = `${baseUrl()}${path}`;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      raw: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { _unparsed: text.slice(0, 2000) };
    }

    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? (parsed as T) : null,
      raw: parsed,
      error: response.ok ? null : `טקסטר החזיר שגיאה ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      raw: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------- רשימת תבניות ----------

export type ParsedTemplate = {
  name: string;
  displayName: string | null;
  bodyText: string | null;
  variableCount: number;
  approved: boolean;
  raw: unknown;
};

/** מחלץ ערך מחרוזת מתוך אובייקט לפי כמה שמות אפשריים */
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** סופר כמה {{n}} יש בטקסט */
function countVariables(text: string | null): number {
  if (!text) return 0;
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return 0;
  return new Set(matches.map((m) => m.replace(/\D/g, ""))).size;
}

/**
 * טקסטר עשוי להחזיר מערך בשורש, או עטוף ב-data/templates/items.
 * מנסים את כולם ולא נשברים על מבנה לא צפוי.
 */
function extractArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "templates", "items", "results", "records"]) {
      const value = obj[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
  }
  return [];
}

/** מחפש את טקסט הגוף של התבנית, כולל בתוך localizations */
function findBodyText(item: Record<string, unknown>): string | null {
  const direct = pick(item, ["body", "bodyText", "text", "content", "message"]);
  if (direct) return direct;

  const provider = item["provider_template"] ?? item["providerTemplate"];
  if (provider && typeof provider === "object") {
    const locs = (provider as Record<string, unknown>)["localizations"];
    if (Array.isArray(locs) && locs.length) {
      const first = locs[0];
      if (first && typeof first === "object") {
        const found = pick(first as Record<string, unknown>, [
          "body",
          "bodyText",
          "text",
          "content",
        ]);
        if (found) return found;
      }
    }
  }
  return null;
}

export function parseTemplates(payload: unknown): ParsedTemplate[] {
  return extractArray(payload)
    .map((item) => {
      const name =
        pick(item, ["name", "templateName", "template_name", "id", "_id"]) ??
        null;
      if (!name) return null;

      const bodyText = findBodyText(item);
      const statusText =
        pick(item, ["status", "approvalStatus", "approval_status"]) ?? "";

      return {
        name,
        displayName: pick(item, ["displayName", "display_name", "title", "label"]),
        bodyText,
        // אם לא הצלחנו לקרוא את הטקסט - מניחים משתנה אחד (שם פרטי).
        // השליחה יודעת ליפול חזרה לבלי משתנים אם טקסטר יתלונן.
        variableCount: bodyText === null ? 1 : countVariables(bodyText),
        // אם לא צוין סטטוס - מניחים מאושרת, כי ה-endpoint מחזיר מאושרות
        approved: statusText ? /approved|מאושר/i.test(statusText) : true,
        raw: item,
      } as ParsedTemplate;
    })
    .filter((t): t is ParsedTemplate => t !== null);
}

export async function listTemplates() {
  return call<unknown>("/templates", { method: "GET" });
}

// ---------- שליחת תבנית ----------

export type SendResponse = {
  success?: boolean;
  text?: string;
  sentAsSessionMessage?: boolean;
  messageId?: string;
};

export async function sendTemplate(params: {
  templateName: string;
  to: string;
  body?: string[];
}) {
  const payload: Record<string, unknown> = {
    templateName: params.templateName,
    to: toTexterPhone(params.to),
  };
  if (params.body && params.body.length) payload.body = params.body;

  return call<SendResponse>("/templates/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
