// Pawan World — offline cache. HTML and the home-screen code are network-first (so updates arrive),
// wild/ (Pokémon code + dex) and nav/ (map) too; everything else (models, decoder, icons, CDN) cache-first.
const CACHE = "pawan-world-v5";
const CORE = ["./", "index.html", "manifest.webmanifest?v=2", "icons/logo.svg?v=2", "icons/icon-192.png?v=2", "icons/icon-512.png?v=2",
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
  const isHomeCode = url.origin === self.location.origin && /\/(home\/[^/]+|hero\.js|wild\/[^/]+|nav\/[^/]+|ui\/[^/]+)$/.test(url.pathname);
  if (isPage || isHomeCode) {
    e.respondWith(fetch(req, { cache: "no-store" }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then((r) => r || (isPage ? caches.match("index.html") : Response.error()))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
