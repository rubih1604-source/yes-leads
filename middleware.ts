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

  /**
   * ============================================================
   *  הנתיב עובר הלאה, כדי שהעטיפה תדע מי היא
   * ============================================================
   *
   *  **הבאג שזה סוגר, והוא היה חמור מכפי שנראה.**
   *
   *  העטיפה הראשית של האתר מצרפת לכל עמוד סרגל צד
   *  ובאנרים. היא חלה גם על דף הנחיתה - ולכן לקוח שפתח
   *  את הטופס ראה את הסרגל של המערכת שלך.
   *
   *  וזה לא היה רק מכוער: הסרגל נבנה בשרת מתוך שאילתות
   *  למסד - ספירת משימות פתוחות וצ'אטים ממתינים. המספרים
   *  האלה נכנסו ל-HTML של עמוד **שפתוח לאינטרנט כולו**.
   *
   *  מהרגע הזה העטיפה יודעת שהיא על דף ציבורי, ולא מצרפת
   *  כלום.
   */
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);

  if (isPublic) return NextResponse.next({ request: { headers } });

  const session = request.cookies.get("yl_session")?.value;
  if (!session || !session.includes(".")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
