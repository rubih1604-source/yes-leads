"use client";

import { useRouter } from "next/navigation";

/**
 * חזרה לדף שהיית בו קודם.
 *
 * קודם זה החזיר תמיד לרשימת הלידים - גם אם הגעת ממכירת
 * לידים, משיחות או מרשימת חזרה. עכשיו זה פשוט חוזר אחורה,
 * כמו כפתור החזור של הדפדפן, עם נפילה לרשימה אם אין היסטוריה.
 */
export default function BackLink({
  fallback = "/",
  label = "חזרה",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();

  function back() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback);
  }

  return (
    <button
      className="nav-back"
      onClick={back}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
      }}
    >
      <span>→</span>
      <span>{label}</span>
    </button>
  );
}
