const APP_ORIGIN = self.location.origin;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Never intercept API responses or cross-origin resources. Health and journal
  // data therefore stay network-only and are not written to a browser cache.
  if (url.origin !== APP_ORIGIN || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(fetch(request));
});
