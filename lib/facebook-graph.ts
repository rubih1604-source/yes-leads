/**
 * ============================================================
 *  שליפה מפייסבוק
 * ============================================================
 *
 *  מקום אחד שמדבר עם ה-Graph API, כדי שכל המסכים יקבלו
 *  את אותן תשובות ואותן הודעות שגיאה.
 *
 *  הטוקן הוא FB_PAGE_TOKEN - טוקן של משתמש מערכת שרואה
 *  את הדפים שהוקצו לו.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type FacebookPage = {
  id: string;
  name: string;
  /** טוקן ייעודי לדף. חלק מהשליפות דורשות אותו ולא את טוקן המערכת. */
  access_token?: string;
};

export type FacebookForm = {
  id: string;
  name: string;
  status?: string;
  leads_count?: number;
};

export type FacebookQuestion = {
  key: string;
  label: string;
  type?: string;
};

export async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GRAPH}${path}`, { cache: "no-store", ...init });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (json as { error?: { message?: string } })?.error?.message ??
      `Graph ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export function pageToken(): string | null {
  return process.env.FB_PAGE_TOKEN?.trim() || null;
}

/** כל הדפים שהטוקן רואה */
export async function listPages(token: string): Promise<FacebookPage[]> {
  const data = await graph<{ data?: FacebookPage[] }>(
    `/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(
      token
    )}`
  );

  return data.data ?? [];
}

/**
 * כל טופסי הלידים של דף.
 *
 * זה מה שמחליף הקלדת מזהים: הרשימה נשלפת מפייסבוק,
 * ואתה בוחר מתוכה.
 */
export async function listForms(page: FacebookPage): Promise<FacebookForm[]> {
  const token = page.access_token ?? pageToken();
  if (!token) return [];

  const data = await graph<{ data?: FacebookForm[] }>(
    `/${page.id}/leadgen_forms?fields=id,name,status,leads_count&limit=200&access_token=${encodeURIComponent(
      token
    )}`
  );

  return data.data ?? [];
}

/**
 * השאלות שבטופס.
 *
 * מאפשר לבחור במפורש איזו שאלה היא שאלת הספק, במקום
 * לנחש אותה לפי מילות מפתח בשם השאלה.
 */
export async function formQuestions(
  formId: string,
  token: string
): Promise<FacebookQuestion[]> {
  const data = await graph<{
    questions?: Array<{ key?: string; label?: string; type?: string }>;
  }>(
    `/${formId}?fields=questions&access_token=${encodeURIComponent(token)}`
  );

  return (data.questions ?? [])
    .filter((q) => q.key || q.label)
    .map((q) => ({
      key: q.key ?? q.label ?? "",
      label: q.label ?? q.key ?? "",
      type: q.type,
    }));
}
