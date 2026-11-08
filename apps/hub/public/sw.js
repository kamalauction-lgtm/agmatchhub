/* IQI AG MatchHub service worker: installability + web push. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MatchHub", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "IQI AG MatchHub";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/brand/pwa-192.png",
      badge: "/brand/pwa-192.png",
      data: { href: data.href || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ("focus" in win) {
          win.focus();
          if ("navigate" in win) win.navigate(href);
          return;
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
