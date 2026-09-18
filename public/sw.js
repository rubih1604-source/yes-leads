/**
 * ============================================================
 *  Service Worker - התראות דחיפה
 * ============================================================
 *
 *  זה מה שמאפשר להתראה לקפוץ על המסך הנעול גם כשהאפליקציה
 *  סגורה. בלעדיו אין Push בכלל.
 *
 *  באייפון זה עובד רק כשהאפליקציה מותקנת ממסך הבית - לא
 *  מסימנייה ולא מתוך ספארי.
 */

self.addEventListener("install", () => {
  // מחליף גרסה ישנה מיד, בלי לחכות לסגירת האפליקציה
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "תזכורת", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "תזכורת";

  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    dir: "rtl",
    lang: "he",
    tag: payload.tag || "yes-leads",
    // התראה דחופה נשארת על המסך עד שנוגעים בה
    requireInteraction: payload.urgent === true,
    vibrate: payload.urgent ? [200, 100, 200] : [100],
    data: { url: payload.url || "/today" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.url || "/today";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        // אם האפליקציה כבר פתוחה - מביאים אותה לחזית
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
