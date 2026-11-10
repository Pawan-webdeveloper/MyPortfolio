// Pawan World — offline cache. HTML and the home-screen code are network-first (so updates arrive),
// wild/ (Pokémon code + dex) and nav/ (map) too; everything else (models, decoder, icons, CDN) cache-first.
const CACHE = "pawanworld-v2";
const CORE = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const isPage = req.mode === "navigate" || req.destination === "document";
  const url = new URL(req.url);
  const isHomeCode = url.origin === self.location.origin && /\/(home\/[^/]+|hero\.js|wild\/[^/]+|nav\/[^/]+)$/.test(url.pathname);
  if (isPage || isHomeCode) {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then((r) => r || (isPage ? caches.match("index.html") : Response.error()))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
