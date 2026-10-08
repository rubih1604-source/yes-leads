import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * ============================================================
 *  חיבור הדפים ל-leadgen
 * ============================================================
 *
 *  מנוי ל-webhook מורכב משני חלקים נפרדים, וצריך את שניהם:
 *
 *    1. **ברמת האפליקציה** - השדה leadgen מסומן במסך
 *       ה-Webhooks. זה נעשה פעם אחת לכל האפליקציה.
 *
 *    2. **ברמת הדף** - כל דף בנפרד צריך להיות מנוי לאפליקציה.
 *       זה לא נעשה במסך של developers ולא רואים אותו שם,
 *       ולכן קל לפספס: הכל נראה מחובר, ולידים פשוט לא מגיעים.
 *
 *  המסך הזה מטפל בחלק השני. הוא עובר על כל הדפים שלטוקן יש
 *  גישה אליהם, בודק מי מנוי ומי לא, ומחבר את החסרים.
 *
 *  GET  = מראה בלבד. לא משנה כלום.
 *  POST = מחבר את כל מי שחסר.
 *
 *  כשתוסיף דף חדש בעתיד - תריץ את זה שוב, וזהו.
 */

type Page = {
  id: string;
  name: string;
  access_token?: string;
};

type PageStatus = {
  id: string;
  name: string;
  subscribed: boolean;
  fields: string[];
  error?: string;
};

async function graph(path: string, init?: RequestInit) {
  const response = await fetch(`${GRAPH}${path}`, {
    cache: "no-store",
    ...init,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (json as { error?: { message?: string } })?.error?.message ??
      `Graph ${response.status}`;
    throw new Error(message);
  }
  return json;
}

/** כל הדפים שהטוקן רואה, עם טוקן ייעודי לכל דף */
async function listPages(token: string): Promise<Page[]> {
  const data = (await graph(
    `/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(
      token
    )}`
  )) as { data?: Page[] };

  return data.data ?? [];
}

/**
 * האם הדף מנוי לאפליקציה שלנו, ולאילו שדות.
 *
 * הבדיקה דורשת את הטוקן של הדף עצמו, לא את טוקן משתמש
 * המערכת - ככה מטא בנתה את זה.
 */
async function statusOf(page: Page): Promise<PageStatus> {
  if (!page.access_token) {
    return {
      id: page.id,
      name: page.name,
      subscribed: false,
      fields: [],
      error: "לא התקבל טוקן לדף הזה - בדוק שהוא מוקצה למשתמש המערכת",
    };
  }

  try {
    const data = (await graph(
      `/${page.id}/subscribed_apps?access_token=${encodeURIComponent(
        page.access_token
      )}`
    )) as { data?: Array<{ subscribed_fields?: string[] }> };

    const apps = data.data ?? [];
    const fields = apps.flatMap((a) => a.subscribed_fields ?? []);

    return {
      id: page.id,
      name: page.name,
      subscribed: fields.includes("leadgen"),
      fields,
    };
  } catch (error) {
    return {
      id: page.id,
      name: page.name,
      subscribed: false,
      fields: [],
      error: error instanceof Error ? error.message : "שגיאה לא ידועה",
    };
  }
}

function tokenOrError(): string | NextResponse {
  const token = process.env.FB_PAGE_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "חסר FB_PAGE_TOKEN במשתני הסביבה. זהו הטוקן של משתמש המערכת.",
      },
      { status: 400 }
    );
  }
  return token;
}

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = tokenOrError();
  if (typeof token !== "string") return token;

  try {
    const pages = await listPages(token);
    const statuses = await Promise.all(pages.map(statusOf));

    const connected = statuses.filter((p) => p.subscribed);
    const missing = statuses.filter((p) => !p.subscribed);

    return NextResponse.json({
      ok: true,
      mode: "תצוגה מקדימה - לא בוצע שום שינוי",
      verdict:
        missing.length === 0
          ? `כל ${statuses.length} הדפים מחוברים. לידים מכולם יגיעו אליך`
          : `${missing.length} דפים לא מחוברים - לידים מהם לא יגיעו`,
      pages: statuses,
      howToApply:
        missing.length > 0
          ? "כדי לחבר את החסרים צריך לשלוח POST לאותה כתובת"
          : undefined,
      connected: connected.map((p) => p.name),
      missing: missing.map((p) => p.name),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "שגיאה לא ידועה",
        hint: "אם כתוב שהטוקן לא תקף - ייתכן שהוא נוצר בלי ההרשאות pages_show_list ו-pages_manage_metadata",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = tokenOrError();
  if (typeof token !== "string") return token;

  try {
    const pages = await listPages(token);
    const results: Array<{ name: string; result: string }> = [];

    for (const page of pages) {
      if (!page.access_token) {
        results.push({
          name: page.name,
          result: "דילוג - אין טוקן לדף. בדוק שהוא מוקצה למשתמש המערכת",
        });
        continue;
      }

      try {
        await graph(`/${page.id}/subscribed_apps`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            subscribed_fields: "leadgen",
            access_token: page.access_token,
          }).toString(),
        });
        results.push({ name: page.name, result: "חובר" });
      } catch (error) {
        results.push({
          name: page.name,
          result: `נכשל - ${
            error instanceof Error ? error.message : "שגיאה לא ידועה"
          }`,
        });
      }
    }

    // בדיקה חוזרת, כדי לדווח על המצב האמיתי ולא על מה שניסינו
    const after = await Promise.all(pages.map(statusOf));
    const stillMissing = after.filter((p) => !p.subscribed);

    return NextResponse.json({
      ok: stillMissing.length === 0,
      mode: "בוצע",
      verdict:
        stillMissing.length === 0
          ? `כל ${after.length} הדפים מחוברים`
          : `${stillMissing.length} דפים עדיין לא מחוברים`,
      results,
      pages: after,
      stillMissing: stillMissing.map((p) => p.name),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "שגיאה לא ידועה",
      },
      { status: 500 }
    );
  }
}
