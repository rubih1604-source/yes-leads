import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * שומר על כל המערכת מאחורי סיסמה.
 * ה-webhooks פתוחים בכוונה - הם מוגנים בטוקן משלהם.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/webhooks");

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
