const CACHE = "cuadrante-pwa-v197";
const ASSETS = ["./", "./index.html", "./avisos-comun.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"];

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

// ---------- Avisos al móvil (v178, v179) ----------
// El servidor manda un «toque» sin contenido. Aquí, en el dispositivo, se lee el cuadrante
// publicado, se compara con lo último que este dispositivo vio y se compone el texto.
function avisoUrlDatos() {
  try {
    const h = self.location.hostname.split(".");
    const seg = self.location.pathname.split("/").filter(Boolean);
    if (h.length > 2 && h[1] === "github" && h[2] === "io" && seg.length) {
      return "https://raw.githubusercontent.com/" + h[0] + "/" + seg[0] + "/main/data.json?t=" + Date.now();
    }
  } catch (e) { /* sigue con la dirección local */ }
  return "./data.json?t=" + Date.now();
}
// El cálculo de las novedades está en avisos-comun.js, compartido con la aplicación
importScripts("./avisos-comun.js");

async function avisoLeer(nombre) {
  try { const c = await caches.open(AVISOS); const r = await c.match(nombre); return r ? await r.json() : null; } catch (e) { return null; }
}
async function avisoGuardar(nombre, obj) {
  try { const c = await caches.open(AVISOS); await c.put(nombre, new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } })); } catch (e) { /* sin sitio: se recalcula la próxima vez */ }
}
function avisoHoy() { const n = new Date(); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); }
// Lee el cuadrante y devuelve el aviso. Con «soloFoto», guarda la foto sin componer texto.
async function avisoPreparar(soloFoto) {
  const quien = (await avisoLeer("./__quien.json")) || {};
  const pid = quien.pid || "";
  let res = { cuerpo: "Hay novedades en el cuadrante.", tag: "cuadrante-novedad" };
  if (!pid) return res;
  // v190: al coordinador y a administración, el servidor les dice el motivo de cada aviso
  let motivos = null;
  if ((pid === "__coord__" || pid === "__admvo__") && quien.buzon) {
    try {
      const rm = await fetch(String(quien.buzon).replace(/\/+$/, "") + "/motivos?pid=" + encodeURIComponent(pid) + "&t=" + Date.now(), { cache: "no-store" });
      if (rm.ok) { const dm = await rm.json(); if (dm && Array.isArray(dm.motivos)) motivos = dm.motivos; }
    } catch (e) { /* sin motivos: se deduce del cuadrante */ }
  }
  let d = {};
  try { const r = await fetch(avisoUrlDatos(), { cache: "no-store" }); if (r.ok) d = await r.json(); } catch (e) { /* sin conexión */ }
  try {
    const visto = soloFoto ? null : await avisoLeer("./__visto.json");
    if (!d.assignments && !motivos) return res;
    const c = avisoComponer(pid, d, visto && visto.pid === pid ? visto.foto : null, avisoHoy(), motivos);
    if (d.assignments) await avisoGuardar("./__visto.json", { pid: pid, foto: c.visto });
    else if (visto && visto.foto) { visto.foto.motAt = c.visto.motAt; await avisoGuardar("./__visto.json", visto); }
    res = { cuerpo: c.cuerpo, tag: c.tag, ir: c.ir };
  } catch (e) { /* aviso genérico */ }
  return res;
}
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    const a = await avisoPreparar(false);
    await self.registration.showNotification("Cuadrante de Rehabilitación", { body: a.cuerpo, icon: "./icon-192.png", badge: "./icon-192.png", tag: a.tag, renotify: true, data: { ir: a.ir || null } });
  })());
});
// Al activar los avisos, la aplicación pide guardar la foto de partida (sin avisar de nada)
self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "avisos-inicia" && e.waitUntil) e.waitUntil(avisoPreparar(true));
});

// Al tocar el aviso se abre la aplicación en la pantalla que toca (v180):
// el día que ha cambiado, las solicitudes o la lista de administración.
self.addEventListener("notificationclick", (e) => {
  const ir = (e.notification.data && e.notification.data.ir) || null;
  e.notification.close();
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of lista) {
      if ("focus" in c) { try { c.postMessage({ tipo: "abrir", ir: ir }); } catch (err) { /* se abre igualmente */ } return c.focus(); }
    }
    const destino = ir && ir.tab ? "./#ir=" + encodeURIComponent(ir.tab) + (ir.dia ? "&dia=" + encodeURIComponent(ir.dia) : "") : "./";
    if (self.clients.openWindow) return self.clients.openWindow(destino);
  })());
});
