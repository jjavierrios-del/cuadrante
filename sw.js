const CACHE = "cuadrante-pwa-v179";
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
const avisoFecha = (k) => String(k || "").split("-").reverse().slice(0, 2).join("/");      // 2027-01-12 → 12/01
const AVISO_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function avisoParticipa(r, pid) {
  if (!r || !pid) return false;
  if ([r.pid, r.pidA, r.pidB].indexOf(pid) >= 0) return true;
  return Array.isArray(r.pasos) && r.pasos.some((x) => x && [x.pid, x.pidA, x.pidB].indexOf(pid) >= 0);
}
// Devuelve {cuerpo, tag, visto}: el texto del aviso y la foto que se guarda para la próxima vez.
// «visto» es la foto anterior (o null la primera vez); «hoy» es la fecha AAAA-MM-DD.
function avisoComponer(pid, d, visto, hoy) {
  d = d || {};
  const partes = [];
  if (pid === "__coord__") {
    const tf = d.avisosTrafico || []; const ult = tf.length ? tf[tf.length - 1] : null;
    let ej = 0; Object.keys(d.cambiosAdm || {}).forEach((mk) => (d.cambiosAdm[mk] || []).forEach((c) => { if (c && c.ejecutado) ej++; }));
    const nuevo = { tf: ult ? String(ult.at || "") : "", ej: ej };
    if (visto && ult && nuevo.tf !== visto.tf) {
      partes.push("Administración ha " + (ult.accion === "quitar" ? "quitado" : "puesto") + " un tráfico a " + (ult.phys || "un compañero") + " el " + avisoFecha(ult.fecha) + ".");
    }
    if (visto && ej > (visto.ej || 0)) { const n = ej - (visto.ej || 0); partes.push("Administración ha reajustado " + (n === 1 ? "un cambio" : n + " cambios") + "."); }
    if (!partes.length) partes.push("Ha llegado una solicitud nueva al buzón.");
    return { cuerpo: partes.join(" "), tag: "cuadrante-coord", visto: nuevo };
  }
  if (pid === "__admvo__") {
    let pend = 0; Object.keys(d.cambiosAdm || {}).forEach((mk) => (d.cambiosAdm[mk] || []).forEach((c) => { if (c && !c.ejecutado) pend++; }));
    const n = visto ? pend - (visto.pend || 0) : 0;
    partes.push(n > 0 ? ("Hay " + (n === 1 ? "un cambio nuevo pendiente" : n + " cambios nuevos pendientes") + " de reajustar.") : "Hay novedades en el cuadrante.");
    return { cuerpo: partes.join(" "), tag: "cuadrante-admvo", visto: { pend: pend } };
  }
  // Facultativo
  const of = Object.keys(d.official || {}).sort();
  const asg = {};
  Object.keys(d.assignments || {}).forEach((k) => {
    const i = k.indexOf("|"); if (k.slice(0, i) !== pid) return;
    const dia = k.slice(i + 1); if (dia < hoy || !(d.official || {})[dia.slice(0, 7)]) return;
    const a = d.assignments[k] || {};
    asg[dia] = [a.m || "", a.t || "", a.f || ""].join("/");
  });
  const sol = {};
  (d.bandeja || []).forEach((it) => { if (it && it.id && avisoParticipa(it.req, pid)) sol[it.id] = it.estado; });
  const nuevo = { of: of, asg: asg, sol: sol };
  if (visto) {
    let apr = 0, rech = 0;
    Object.keys(sol).forEach((id) => {
      const antes = (visto.sol || {})[id];
      if (sol[id] !== "pendiente" && antes !== sol[id] && (antes === "pendiente" || antes === undefined)) { if (sol[id] === "aprobada") apr++; else rech++; }
    });
    if (apr) partes.push(apr === 1 ? "Tu solicitud ha sido aprobada." : apr + " solicitudes tuyas han sido aprobadas.");
    if (rech) partes.push(rech === 1 ? "Tu solicitud no ha sido autorizada." : rech + " solicitudes tuyas no han sido autorizadas.");
    const mesesNuevos = of.filter((mk) => (visto.of || []).indexOf(mk) < 0);
    const antes = visto.asg || {};
    const cambiados = [], traficos = [];
    const dias = {}; Object.keys(asg).forEach((k) => { dias[k] = 1; }); Object.keys(antes).forEach((k) => { if (k >= hoy) dias[k] = 1; });
    Object.keys(dias).sort().forEach((dia) => {
      if ((asg[dia] || "") === (antes[dia] || "")) return;
      if (mesesNuevos.indexOf(dia.slice(0, 7)) >= 0) return;            // un mes recién oficial no es «un cambio»
      const tfAhora = /TF[MT]\d/.test(asg[dia] || ""), tfAntes = /TF[MT]\d/.test(antes[dia] || "");
      if (tfAhora && !tfAntes) traficos.push(dia); else cambiados.push(dia);
    });
    if (traficos.length) partes.push("Tienes una consulta de Tráfico nueva el " + traficos.slice(0, 2).map(avisoFecha).join(" y el ") + (traficos.length > 2 ? " (y " + (traficos.length - 2) + " más)" : "") + ".");
    if (cambiados.length) partes.push((cambiados.length === 1 ? "Ha cambiado tu turno del " : "Han cambiado tus turnos del ") + cambiados.slice(0, 2).map(avisoFecha).join(" y el ") + (cambiados.length > 2 ? " (y " + (cambiados.length - 2) + " más)" : "") + ".");
    mesesNuevos.forEach((mk) => { const p = mk.split("-").map(Number); partes.push("Ya está el cuadrante oficial de " + AVISO_MESES[p[1] - 1] + "."); });
  }
  if (!partes.length) partes.push("Hay novedades en el cuadrante.");
  return { cuerpo: partes.join(" "), tag: "cuadrante-novedad", visto: nuevo };
}
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
  let res = { cuerpo: pid === "__coord__" ? "Ha llegado una solicitud nueva al buzón." : "Hay novedades en el cuadrante.", tag: "cuadrante-novedad" };
  if (!pid) return res;
  try {
    const r = await fetch(avisoUrlDatos(), { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      const visto = soloFoto ? null : await avisoLeer("./__visto.json");
      const c = avisoComponer(pid, d, visto && visto.pid === pid ? visto.foto : null, avisoHoy());
      await avisoGuardar("./__visto.json", { pid: pid, foto: c.visto });
      res = { cuerpo: c.cuerpo, tag: c.tag };
    }
  } catch (e) { /* sin conexión: aviso genérico */ }
  return res;
}
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    const a = await avisoPreparar(false);
    await self.registration.showNotification("Cuadrante de Rehabilitación", { body: a.cuerpo, icon: "./icon-192.png", badge: "./icon-192.png", tag: a.tag, renotify: true });
  })());
});
// Al activar los avisos, la aplicación pide guardar la foto de partida (sin avisar de nada)
self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "avisos-inicia" && e.waitUntil) e.waitUntil(avisoPreparar(true));
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
