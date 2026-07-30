"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ניווט אחד לשני עולמות:
 * בנייד — סרגל תחתון בהישג אגודל.
 * במחשב — סרגל צד קבוע.
 *
 * ארבעה יעדים בלבד. כל השאר יושב מסודר תחת "עוד",
 * כדי שהשלושה שנפתחים כל היום יהיו בנגיעה אחת.
 */

const TABS = [
  { href: "/dashboard", label: "ביצועים", glyph: "◱" },
  { href: "/today", label: "היום", glyph: "◎" },
  { href: "/", label: "לידים", glyph: "▤" },
  { href: "/chats", label: "שיחות", glyph: "✉" },
  { href: "/more", label: "עוד", glyph: "⋯" },
];

export default function Nav({
  openTasks = 0,
  waitingReply = 0,
}: {
  openTasks?: number;
  waitingReply?: number;
}) {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  function isActive(href: string) {
    if (href === "/") return pathname === "/" || pathname.startsWith("/leads");
    if (href === "/more") {
      return [
        "/more",
        "/alerts",
        "/jobs",
        "/rules",
        "/templates",
        "/knowledge",
        "/settings",
        "/incoming",
      ].some((p) => pathname.startsWith(p));
    }
    return pathname.startsWith(href);
  }

  return (
    <nav className="nav" aria-label="ניווט ראשי">
      {TABS.map((tab) => {
        const badge =
          tab.href === "/today"
            ? openTasks
            : tab.href === "/chats"
            ? waitingReply
            : 0;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="nav-item"
            data-active={isActive(tab.href)}
            aria-current={isActive(tab.href) ? "page" : undefined}
          >
            <span className="glyph" aria-hidden="true">
              {tab.glyph}
            </span>
            <span>{tab.label}</span>
            {badge > 0 && (
              <span className="nav-badge">{badge > 99 ? "99+" : badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
