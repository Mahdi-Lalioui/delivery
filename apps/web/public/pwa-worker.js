/* global self, caches, URL, fetch, Response, clients */
const cachePrefix = "zaafran-offline-";
const cacheName = cachePrefix + "2";
const style = "/pwa/offline.css";
const offlinePage = (locale) => "/pwa/" + locale + "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) =>
        cache.addAll([style, "/brand/awid-icon.svg", ...["ar", "fr", "en"].map(offlinePage)]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === style) {
    event.respondWith(
      caches.match(style, { cacheName }).then((cached) => cached ?? fetch(request)),
    );
    return;
  }
  if (request.mode !== "navigate") return;
  const locale = /^\/(ar|fr|en)\/(?:discover|restaurants\/[^/]+)\/?$/.exec(url.pathname)?.[1];
  if (!locale) return;
  event.respondWith(
    fetch(request).catch(
      async () => (await caches.match(offlinePage(locale), { cacheName })) ?? Response.error(),
    ),
  );
});

// Order status pushes (lane A orderPushPayload): show them, and open the orders page on tap.
const pushUrls = new Set(["/ar/orders", "/fr/orders", "/en/orders"]);

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    return;
  }
  if (!payload || typeof payload.body !== "string" || !pushUrls.has(payload.url)) return;
  event.waitUntil(
    self.registration.showNotification(String(payload.title || "AWID"), {
      body: payload.body,
      tag: String(payload.id || payload.url),
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!pushUrls.has(url)) return;
  event.waitUntil(clients.openWindow(url));
});
