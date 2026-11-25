import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import NavData from "@/components/NavData";
import Banners from "@/components/Banners";
import "./globals.css";

export const metadata: Metadata = {
  title: "לידים",
  description: "מערכת ניהול לידים",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "לידים",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

/**
 * ============================================================
 *  דף ציבורי לא מקבל את המערכת סביבו
 * ============================================================
 *
 *  `NavData` הוא רכיב **שרת** שמריץ שאילתות למסד כדי
 *  לבנות את הסרגל. אם הוא רץ על דף הנחיתה, המספרים
 *  הפנימיים שלך נכנסים ל-HTML של עמוד שכל אחד יכול
 *  לפתוח - וזו דליפה, לא עניין של עיצוב.
 *
 *  לכן הבדיקה כאן חוסמת את **הרינדור עצמו** ולא מסתירה
 *  ב-CSS: מה שלא נבנה, לא דולף.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = headers().get("x-pathname") ?? "";
  const isPublicPage = pathname.startsWith("/f/");

  if (isPublicPage) {
    return (
      <html lang="he" dir="rtl">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin=""
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap"
            rel="stylesheet"
          />
        </head>
        <body style={{ margin: 0 }}>{children}</body>
      </html>
    );
  }

  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&family=Rubik:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Banners />
        {children}
        <NavData />
      </body>
    </html>
  );
}
