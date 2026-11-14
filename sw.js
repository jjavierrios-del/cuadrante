const CACHE = "cuadrante-pwa-v175";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Red primero, caché como respaldo (para datos y para la propia app)
// La app pide data.json con un sello de tiempo distinto cada vez (data.json?t=…).
// Se guarda siempre bajo la misma dirección, sin el sello: así hay UNA sola copia
// (la última) en lugar de una nueva en cada consulta, y sin conexión se encuentra.
function networkFirst(req) {
  const u = new URL(req.url);
  const clave = u.pathname.endsWith("data.json") ? u.origin + u.pathname : req;
  return fetch(req).then((r) => {
    if (r && r.ok) {
      const cl = r.clone();
      caches.open(CACHE).then((c) => c.put(clave, cl));
    }
    return r;
  }).catch(() => caches.match(clave).then((r) => r || caches.match("./index.html")));
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Peticiones a otros dominios (p. ej. leer data.json del repositorio): no interferir
  if (url.origin !== self.location.origin) return;

  // data.json y la propia página: siempre la última versión si hay conexión
  if (url.pathname.endsWith("data.json") ||
      e.request.mode === "navigate" ||
      url.pathname.endsWith("/") ||
      url.pathname.endsWith("index.html")) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Iconos y manifiesto: caché primero (no cambian casi nunca)
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      if (res && res.ok) { const cl = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cl)); }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
