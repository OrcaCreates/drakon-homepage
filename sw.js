/* Drakon PWA service worker.
 * Caches the app shell so the app opens offline. Network requests to the
 * Netlify functions are never cached (chat needs to be live).
 */
const CACHE = "drakon-app-v2";

const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/app.html",
  "/app.css",
  "/app.js",
  "/vendor/qrcode.min.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/images/Vexahead.png",
  "/images/Aurorahead.png",
  "/images/Terrahead.png",
  "/images/Lyrichead.png",
  "/images/Cryohead.png",
  "/images/Vaelhead.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll is atomic; tolerate a missing asset so install never fails hard.
      return Promise.allSettled(SHELL.map((url) => c.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  const url = new URL(e.request.url);

  // Only handle same-origin GETs; let the browser deal with CDNs, POSTs, etc.
  if (url.origin !== location.origin || e.request.method !== "GET") return;

  // Never touch API/function calls — always live.
  if (url.pathname.startsWith("/.netlify/")) return;

  // Network-first: always serve fresh when online (so edits show immediately),
  // fall back to the cached copy only when the network is unavailable.
  e.respondWith(
    fetch(e.request)
      .then(function (resp) {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      })
      .catch(function () {
        return caches.match(e.request);
      })
  );
});
