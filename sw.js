const CACHE = "cuadrante-pwa-v5";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // data.json: primero red (para ver la última publicación), caché como respaldo offline
  if (url.pathname.endsWith("data.json")) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const cl = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, cl));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Resto: caché primero (funciona sin conexión), red como respaldo
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const cl = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, cl));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
