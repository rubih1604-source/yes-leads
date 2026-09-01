"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * באנרים שנשארים על המסך עד שמסירים אותם.
 *
 * ירוק = הקמפיין עומד ביעד. אדום = מתחת ליעד.
 * מופיעים בכל מסך, כדי שלא תפספס.
 */

type Notice = {
  id: string;
  level: string;
  title: string;
  body: string | null;
  campaignName: string | null;
};

export default function Banners() {
  const [notices, setNotices] = useState<Notice[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await res.json();
      setNotices(Array.isArray(data.notices) ? data.notices : []);
    } catch {
      setNotices([]);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function dismiss(id: string) {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/notices/${id}`, { method: "DELETE" }).catch(() => null);
  }

  if (notices.length === 0) return null;

  return (
    <div className="banners">
      {notices.map((n) => (
        <div
          className="banner"
          data-level={n.level}
          key={n.id}
          role="status"
        >
          <div className="banner-body">
            <Link href="/campaign-alerts" className="banner-title">
              {n.title}
            </Link>
            {n.body && <div className="banner-sub">{n.body}</div>}
          </div>
          <button
            className="banner-close"
            aria-label="הסר"
            onClick={() => dismiss(n.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
