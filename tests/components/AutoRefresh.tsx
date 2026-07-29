"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * מרענן את הדף לבד ברקע, כדי שלידים והתראות חדשים
 * יופיעו בלי שתצטרך ללחוץ רענון.
 *
 * עוצר כשהלשונית לא פעילה, וממשיך כשחוזרים אליה.
 */
export default function AutoRefresh({
  seconds = 20,
}: {
  seconds?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => {
        if (!document.hidden) router.refresh();
      }, seconds * 1000);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        router.refresh(); // רענון מיידי כשחוזרים ללשונית
        start();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return null;
}
