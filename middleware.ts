import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * שומר על כל המערכת מאחורי סיסמה.
 * ה-webhooks פתוחים בכוונה - הם מוגנים בטוקן משלהם.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /**
   * ============================================================
   *  מה פתוח לכולם, ולמה
   * ============================================================
   *
   *  `/f/` ו-`/api/public-form/` הם טופס הלידים שמתפרסם
   *  במודעות. לקוח שלוחץ על מודעה חייב להגיע לטופס ולא
   *  למסך סיסמה - אחרת אין טופס.
   *
   *  ההגנה שם אינה סיסמה אלא מה שמתאים לדף ציבורי: שדה
   *  מלכודת לבוטים, תקרת פניות לכתובת, ובדיקת טלפון.
   *  הטופס גם לא חושף כלום - הוא רק מקבל.
   */
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/f/") ||
    pathname.startsWith("/api/public-form/");

  if (isPublic) return NextResponse.next();

  const session = request.cookies.get("yl_session")?.value;
  if (!session || !session.includes(".")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
