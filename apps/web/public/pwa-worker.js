/* global self, caches, URL, fetch, Response */
const cachePrefix = "zaafran-offline-";
const cacheName = cachePrefix + "1";
const style = "/pwa/offline.css";
const offlinePage = (locale) => "/pwa/" + locale + "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll([style, ...["ar", "fr", "en"].map(offlinePage)]))
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
