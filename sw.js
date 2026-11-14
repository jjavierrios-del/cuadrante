const CACHE = "cuadrante-pwa-v178";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
// Quién usa este dispositivo, para componer los avisos. No se borra al cambiar de versión.
const AVISOS = "cuadrante-avisos";

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== AVISOS).map((k) => caches.delete(k)))));
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

// ---------- Avisos al móvil (v178) ----------
// El servidor manda un «toque» sin contenido; el texto se compone aquí, en el dispositivo.
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let quien = {};
    try {
      const c = await caches.open(AVISOS);
      const r = await c.match("./__quien.json");
      if (r) quien = await r.json();
    } catch (err) { /* sin identidad guardada: aviso genérico */ }
    const esCoord = quien.pid === "__coord__";
    await self.registration.showNotification("Cuadrante de Rehabilitación", {
      body: esCoord ? "Ha llegado una solicitud nueva al buzón." : "Hay novedades en el cuadrante.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: esCoord ? "cuadrante-buzon" : "cuadrante-novedad",
      renotify: true
    });
  })());
});

// Al tocar el aviso se abre la aplicación (o se trae al frente si ya estaba abierta)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of lista) { if ("focus" in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow("./");
  })());
});
