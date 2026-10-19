import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import {
  listPages,
  formQuestions,
  pageToken,
} from "@/lib/facebook-graph";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  השאלות שבטופס, כפי שהן בפייסבוק
 * ============================================================
 *
 *  בליד מנגר אתה פותח רשימה ורואה את השאלה האמיתית -
 *  "מי ספק התקשורת שלכם" - ובוחר אותה. אותו דבר כאן.
 *
 *  למה זה חשוב ולא קוסמטי: עד עכשיו שאלת הספק זוהתה לפי
 *  מילת מפתח בשם השדה. זה עובד כל עוד המילה "ספק" מופיעה
 *  שם - ונכשל בשקט ברגע שתנסח את השאלה אחרת. בחירה מפורשת
 *  לא יכולה להיכשל ככה.
 */

export async function GET(
  request: Request,
  { params }: { params: { formId: string } }
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = pageToken();

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "חסר FB_PAGE_TOKEN", questions: [] },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const pageId = url.searchParams.get("pageId")?.trim();

  /**
   * שליפת שאלות דורשת את הטוקן של **הדף** ולא את טוקן
   * המערכת. מאתרים את הדף ולוקחים את הטוקן שלו.
   */
  let formToken = token;

  if (pageId) {
    const pages = await listPages(token).catch(() => []);
    const page = pages.find((p) => p.id === pageId);
    if (page?.access_token) formToken = page.access_token;
  }

  try {
    const questions = await formQuestions(params.formId, formToken);

    return NextResponse.json({
      ok: true,
      error: null,
      questions: questions.map((q) => ({ key: q.key, label: q.label, type: q.type })),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error:
        error instanceof Error
          ? `פייסבוק החזירה: ${error.message}`
          : "לא ניתן לשלוף את שאלות הטופס",
      questions: [],
    });
  }
}
