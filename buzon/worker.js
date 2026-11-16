/**
 * Buzón de solicitudes · Servicio de Rehabilitación y Aparato Locomotor
 * ---------------------------------------------------------------------
 * Recibe las solicitudes de cambio que envían los facultativos desde la app
 * y las guarda hasta que el jefe de servicio las descarga a su bandeja.
 *
 * Variables que hay que configurar en Cloudflare (Settings → Variables):
 *   CLAVE_ENVIO  → clave que usa la app de los compañeros para enviar
 *   CLAVE_ADMIN  → clave que usa el coordinador para descargar y borrar
 *
 * Para publicar el cuadrante sin token en los dispositivos (opcional):
 *   CLAVE_PUBLICAR → contraseña que se introduce en la aplicación
 *   GITHUB_TOKEN   → token de GitHub con permiso de escritura en el repositorio
 *   GH_OWNER       → usuario de GitHub (p. ej. jjavierrios-del)
 *   GH_REPO        → nombre del repositorio (p. ej. cuadrante)
 *   GH_BRANCH      → rama, opcional (por defecto main)
 *
 * Para el calendario suscrito (opcional):
 *   CLAVE_CALENDARIO → clave que se añade a la dirección del calendario
 *   CLAVE_ADMVO      → contraseña de los administrativos para marcar cambios reajustados
 *
 * Y un almacén KV enlazado con el nombre:  BUZON
 */


// ================= CALENDARIO SUSCRITO =================
// Devuelve los turnos de un facultativo en formato de calendario, leyendo
// siempre el cuadrante publicado. Al estar suscrito, el calendario del móvil
// se actualiza solo cuando cambia el cuadrante.
const HORARIO_CAL = {
  manana:  { ini: "080000", fin: "150000" },
  tarde:   { ini: "150000", fin: "200000" },
  urgencia:{ ini: "090000", fin: "210000" },
  traficoHoras: 4
};
const ABS_CAL = { V: "Vacaciones", B: "Baja / IT", P: "Permiso", L: "Libranza" };
const esTraficoCal = (c) => !!c && /^TF[MT][123]$/.test(c);

function nombreActividadCal(code) {
  if (!code) return "";
  // Las guardias se muestran siempre como URG, sea festivo o no
  if (code === "URG" || code === "URGLV" || code === "URGF") return "URG";
  // El resto conserva la misma nomenclatura del cuadrante
  return code;
}
const escCal = (t) => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const pad2 = (n) => String(n).padStart(2, "0");

function sumarHorasCal(dkey, hhmmss, horas) {
  const h = parseInt(hhmmss.slice(0, 2), 10), m = parseInt(hhmmss.slice(2, 4), 10);
  const pr = dkey.split("-").map(Number);
  const d = new Date(Date.UTC(pr[0], pr[1] - 1, pr[2], h + horas, m));
  return {
    fecha: d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()),
    hora: pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + "00"
  };
}

function construirICS(datos, pid, meses) {
  const p = (datos.physicians || []).find((x) => x.id === pid || x.name === pid);
  if (!p) return null;
  const asg = datos.assignments || {};
  const horasTf = datos.traficoHoras || {};
  const libres = datos.diasLibres || {};
  const sello = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const L = [];
  let n = 0;

  const evento = (dk, ini, fin, titulo, finFecha) => {
    n++;
    L.push("BEGIN:VEVENT",
      "UID:cuadrante-" + p.id + "-" + dk + "-" + n + "@rhb",
      "DTSTAMP:" + sello,
      "DTSTART;TZID=Europe/Madrid:" + dk.replace(/-/g, "") + "T" + ini,
      "DTEND;TZID=Europe/Madrid:" + (finFecha || dk).replace(/-/g, "") + "T" + fin,
      "SUMMARY:" + escCal(titulo),
      "DESCRIPTION:Cuadrante del Servicio de Rehabilitación",
      "END:VEVENT");
  };
  const eventoDia = (dk, titulo) => {
    n++;
    const sig = sumarHorasCal(dk, "120000", 24).fecha;
    L.push("BEGIN:VEVENT",
      "UID:cuadrante-" + p.id + "-" + dk + "-" + n + "@rhb",
      "DTSTAMP:" + sello,
      "DTSTART;VALUE=DATE:" + dk.replace(/-/g, ""),
      "DTEND;VALUE=DATE:" + sig.replace(/-/g, ""),
      "SUMMARY:" + escCal(titulo),
      "TRANSP:TRANSPARENT",
      "END:VEVENT");
  };

  for (const par of meses) {
    // Cada elemento es [año, mes]; se aceptan también números sueltos (mes del año publicado)
    const year = Array.isArray(par) ? par[0] : (datos.year || new Date().getFullYear());
    const mo = Array.isArray(par) ? par[1] : par;
    // Solo se publican los meses que el coordinador ha marcado como OFICIALES.
    // Mientras tanto el mes es un borrador y no llega a los calendarios; una vez
    // oficial, se publica y recoge también todos los cambios posteriores.
    if (!(datos.official && datos.official[year + "-" + pad2(mo + 1)])) continue;
    const dim = new Date(year, mo + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dk = year + "-" + pad2(mo + 1) + "-" + pad2(d);
      // Los días de no disponibilidad no se exportan al calendario personal
      const a = asg[p.id + "|" + dk];
      if (!a) continue;
      if (a.f) {
        if (a.f === "URG" || a.f === "URGLV" || a.f === "URGF") {
          evento(dk, HORARIO_CAL.urgencia.ini, HORARIO_CAL.urgencia.fin, nombreActividadCal(a.f));
        } else if (ABS_CAL[a.f]) {
          eventoDia(dk, ABS_CAL[a.f]);
        }
        continue;
      }
      if (a.m) {
        if (esTraficoCal(a.m)) {
          const h = ((horasTf[p.id + "|" + dk + "|m"] || "08:00").replace(":", "")) + "00";
          const f = sumarHorasCal(dk, h, HORARIO_CAL.traficoHoras);
          evento(dk, h, f.hora, nombreActividadCal(a.m), f.fecha);
        } else {
          evento(dk, HORARIO_CAL.manana.ini, HORARIO_CAL.manana.fin, nombreActividadCal(a.m));
        }
      }
      if (a.t) {
        if (esTraficoCal(a.t)) {
          const h = ((horasTf[p.id + "|" + dk + "|t"] || "15:00").replace(":", "")) + "00";
          const f = sumarHorasCal(dk, h, HORARIO_CAL.traficoHoras);
          evento(dk, h, f.hora, nombreActividadCal(a.t), f.fecha);
        } else {
          evento(dk, HORARIO_CAL.tarde.ini, HORARIO_CAL.tarde.fin, nombreActividadCal(a.t));
        }
      }
    }
  }

  return [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//Servicio de Rehabilitacion y Aparato Locomotor//Cuadrante//ES",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escCal("Cuadrante " + p.name),
    "X-WR-TIMEZONE:Europe/Madrid",
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
    "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
    "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
    "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE"
  ].concat(L).concat(["END:VCALENDAR"]).join("\r\n");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

// Guarda el cuadrante reintentando si dos personas escriben a la vez.
// GitHub responde 409 cuando la versión que teníamos ha quedado atrás;
// en ese caso se vuelve a leer y se aplica el cambio sobre lo más reciente.
async function editarCuadrante(env, mensaje, modificar) {
  const rama = env.GH_BRANCH || "main";
  const api = "https://api.github.com/repos/" + env.GH_OWNER + "/" + env.GH_REPO + "/contents/data.json";
  const cabeceras = {
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "buzon-cuadrante"
  };
  for (let intento = 0; intento < 4; intento++) {
    const actual = await fetch(api + "?ref=" + encodeURIComponent(rama) + "&t=" + Date.now(), { headers: cabeceras });
    if (!actual.ok) return { error: "No se ha podido leer el cuadrante.", status: 502 };
    const meta = await actual.json();
    let datos;
    try {
      const bin = atob(String(meta.content || "").replace(/\n/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      datos = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return { error: "Cuadrante ilegible.", status: 502 }; }

    const r = modificar(datos);
    if (r && r.error) return r;                    // el cambio no procede
    if (r && r.sinCambios) return { ok: true };

    datos.publishedAt = new Date().toISOString();
    datos.publishedBy = "administrativo";
    const texto = JSON.stringify(datos);
    const binario = bytesABinario(new TextEncoder().encode(texto));
    const guardar = await fetch(api, {
      method: "PUT",
      headers: { ...cabeceras, "Content-Type": "application/json" },
      body: JSON.stringify({ message: mensaje, content: btoa(binario), branch: rama, sha: meta.sha })
    });
    if (guardar.ok) {
      try { await env.BUZON.put("pub-ultima", datos.publishedAt); } catch (e) { /* solo es una ayuda para detectar choques */ }
      return { ok: true, extra: r && r.extra };
    }
    if (guardar.status !== 409) {
      return { error: "No se ha podido guardar (" + guardar.status + ").", status: 502 };
    }
    // Choque: alguien guardó primero. Se espera un poco y se reintenta.
    await new Promise(res => setTimeout(res, 250 + intento * 350));
  }
  return { error: "El cuadrante está recibiendo muchos cambios a la vez. Inténtalo de nuevo.", status: 409 };
}

function bytesABinario(bytes) {
  let out = "";
  const BLOQUE = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOQUE) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + BLOQUE));
  }
  return out;
}

// ================= AVISOS AL MÓVIL (v178) =================
// Cada dispositivo se apunta (suscripción) a nombre de un facultativo, del coordinador
// o de administración. Cuando ocurre algo que le afecta se le manda un «toque» SIN
// contenido: el propio dispositivo lee el cuadrante publicado y compone el texto.
// Así por el servicio de notificaciones de Apple/Google no viaja ningún dato.
//   VAPID_PRIVADA → secreto con la clave de firma (JWK). Sin él, no se envía nada.
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const PID_COORD = "__coord__", PID_ADMVO = "__admvo__";
const MAX_DISPOSITIVOS = 8;          // por persona
const b64u = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let t = ""; for (let i = 0; i < bytes.length; i++) t += String.fromCharCode(bytes[i]);
  return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64uTexto = (t) => b64u(new TextEncoder().encode(t));
const deB64u = (t) => { const b = atob(String(t).replace(/-/g, "+").replace(/_/g, "/")); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
function endpointValido(u) {
  try { const x = new URL(u); return x.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(x.hostname)); }
  catch (e) { return false; }
}
async function huella(txt) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)));
  let o = ""; for (let i = 0; i < 12; i++) o += h[i].toString(16).padStart(2, "0");
  return o;
}
// Hora actual en Madrid (0–23). HORA_PRUEBA solo existe en las pruebas.
function horaMadrid(env) {
  if (env.HORA_PRUEBA !== undefined) return Number(env.HORA_PRUEBA);
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(new Date())) % 24;
}
// Los avisos suenan de 9:00 a 21:00 (decisión de Javier). Fuera de ese tramo no se envía
// nada: queda en cola y se entrega junto a las 9:00.
const HORA_INICIO = 9, HORA_FIN = 21;
const enSilencio = (env) => { const h = horaMadrid(env); return h >= HORA_FIN || h < HORA_INICIO; };
// Solo se avisa a facultativos y a administración por esta vía (nunca al propio coordinador)
const pidAvisable = (p) => p === PID_ADMVO || /^[a-z0-9]{4,16}$/.test(String(p || ""));

async function enviarToques(env, pids) {
  if (!env.VAPID_PRIVADA) return { enviados: 0, motivo: "sin clave" };
  let jwk;
  try { jwk = JSON.parse(env.VAPID_PRIVADA); } catch (e) { return { enviados: 0, motivo: "clave ilegible" }; }
  const clave = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const xy = new Uint8Array(65); xy[0] = 4; xy.set(deB64u(jwk.x), 1); xy.set(deB64u(jwk.y), 33);
  const publica = b64u(xy);
  const tokens = {};                 // un token por servicio de notificaciones
  const token = async (aud) => {
    if (tokens[aud]) return tokens[aud];
    const cab = b64uTexto(JSON.stringify({ typ: "JWT", alg: "ES256" }));
    const cuerpo = b64uTexto(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_CONTACTO || "https://jjavierrios-del.github.io/cuadrante/" }));
    const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, new TextEncoder().encode(cab + "." + cuerpo));
    return (tokens[aud] = cab + "." + cuerpo + "." + b64u(firma));
  };
  let enviados = 0, caducados = 0;
  const vistos = {};
  for (const pid of pids) {
    if (!pid || vistos[pid]) continue; vistos[pid] = 1;
    const lista = await env.BUZON.list({ prefix: "push:" + pid + ":" });
    for (const k of lista.keys) {
      const sub = await env.BUZON.get(k.name, "json");
      if (!sub || !endpointValido(sub.endpoint)) { await env.BUZON.delete(k.name); continue; }
      try {
        const r = await fetch(sub.endpoint, {
          method: "POST",
          headers: { "TTL": "86400", "Urgency": "normal", "Content-Length": "0",
                     "Authorization": "vapid t=" + (await token(new URL(sub.endpoint).origin)) + ", k=" + publica }
        });
        if (r.status === 404 || r.status === 410) { await env.BUZON.delete(k.name); caducados++; }   // el dispositivo ya no existe
        else if (r.ok) enviados++;
      } catch (e) { /* fallo puntual de red: se reintentará en el siguiente aviso */ }
    }
  }
  return { enviados, caducados };
}
// Avisa a esas personas ahora o, fuera del horario de avisos, lo deja en cola hasta las 9:00
async function avisar(env, pids) {
  try {
    if (enSilencio(env)) {
      for (const pid of pids) if (pid) await env.BUZON.put("cola:" + pid, "1", { expirationTtl: 60 * 60 * 24 });
      return { enCola: true };
    }
    return await enviarToques(env, pids);
  } catch (e) { return { error: String(e && e.message || e) }; }
}
async function vaciarCola(env) {
  const lista = await env.BUZON.list({ prefix: "cola:" });
  const pids = lista.keys.map((k) => k.name.slice(5));
  if (!pids.length) return { enviados: 0 };
  const r = await enviarToques(env, pids);
  for (const k of lista.keys) await env.BUZON.delete(k.name);
  return r;
}

// ================= COPIA NOCTURNA (v178) =================
// Cada madrugada guarda el cuadrante publicado, se abra o no la aplicación.
// Mismo formato que las copias manuales: aparece en la misma lista y dura 180 días.
// No se interpreta el archivo (ahorra cálculo): se guarda tal cual.
async function copiaNocturna(env) {
  if (!env.GH_OWNER || !env.GH_REPO) return { hecho: false, motivo: "sin destino" };
  const rama = env.GH_BRANCH || "main";
  const r = await fetch("https://raw.githubusercontent.com/" + env.GH_OWNER + "/" + env.GH_REPO + "/" + rama + "/data.json?t=" + Date.now());
  if (!r.ok) return { hecho: false, motivo: "no se ha podido leer (" + r.status + ")" };
  const texto = await r.text();
  if (texto.length < 100 || texto.length > 3000000 || texto[0] !== "{") return { hecho: false, motivo: "contenido no válido" };
  const m = texto.match(/"publishedAt":"([^"]+)"/);
  const version = m ? m[1] : "";
  if (version && (await env.BUZON.get("copia-noche-ultima")) === version) return { hecho: false, motivo: "sin cambios desde la última" };
  const sello = new Date().toISOString().replace(/[:.]/g, "-");
  const ttl = { expirationTtl: 60 * 60 * 24 * 180 };
  await env.BUZON.put("copia:" + sello, texto, ttl);
  await env.BUZON.put("copia-info:" + sello, JSON.stringify({ fecha: new Date().toISOString(), nota: "Copia nocturna automática", bytes: texto.length }), ttl);
  if (version) await env.BUZON.put("copia-noche-ultima", version, ttl);
  return { hecho: true, bytes: texto.length };
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });

export default {
  // Temporizadores: copia nocturna y entrega de los avisos retenidos por la noche
  async scheduled(event, env, ctx) {
    const tarea = (async () => {
      if (event.cron === "0 2 * * *") return copiaNocturna(env);
      if (horaMadrid(env) === HORA_INICIO) return vaciarCola(env);   // de las dos horas programadas, solo una es las 9:00 de Madrid
      return null;
    })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(tarea);
    return tarea;
  },

  // Entrada: aplica el límite de intentos con contraseña incorrecta (v181) y atiende la petición
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const ruta = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    const vigilada = !RUTAS_SIN_FRENO[ruta];
    if (vigilada && bloqueado(request)) return json({ error: MSG_FRENO }, 429);
    const r = await atender(request, env, ctx);
    // Una respuesta «contraseña incorrecta» cuenta como intento fallido
    if (vigilada && r.status === 403 && (await falloClave(request, env))) return json({ error: MSG_FRENO }, 429);
    return r;
  }
};

// ================= LÍMITE DE INTENTOS (v181) =================
// Tras 10 contraseñas incorrectas en un minuto desde la misma conexión, esa conexión queda
// bloqueada 15 minutos en todas las rutas que piden contraseña (también con la correcta:
// si no, se podría seguir probando). Los aciertos no cuentan.
// FRENO → limitador de Cloudflare (no gasta la cuota del almacén). Sin él, no se limita.
const MSG_FRENO = "Demasiados intentos con una contraseña incorrecta. Espera 15 minutos y vuelve a intentarlo.";
const FRENO_MINUTOS = 15;
const RUTAS_SIN_FRENO = { "/estado": 1, "/calendario.ics": 1 };     // sin contraseña de valor: no se vigilan ni se bloquean
const BLOQUEOS = new Map();                                          // conexión → hasta cuándo (memoria del servidor)
const conexionDe = (request) => request.headers.get("CF-Connecting-IP") || "desconocida";
function bloqueado(request) {
  const ip = conexionDe(request), hasta = BLOQUEOS.get(ip);
  if (!hasta) return false;
  if (hasta > Date.now()) return true;
  BLOQUEOS.delete(ip);
  return false;
}
// Anota un intento fallido. Devuelve true si con este se ha superado el límite.
async function falloClave(request, env) {
  if (!env.FRENO || !env.FRENO.limit) return false;
  try {
    const ip = conexionDe(request);
    const { success } = await env.FRENO.limit({ key: ip });
    if (success) return false;
    if (BLOQUEOS.size > 5000) BLOQUEOS.clear();
    BLOQUEOS.set(ip, Date.now() + FRENO_MINUTOS * 60000);
    return true;
  } catch (e) { return false; }
}

async function atender(request, env, ctx) {
  {
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, "") || "/";

    try {
      // ---------- Comprobación de salud ----------
      if (request.method === "GET" && ruta === "/estado") {
        return json({ ok: true, servicio: "buzon-cuadrante" });
      }

      // ---------- El jefe de servicio descarga las pendientes ----------
      if (request.method === "GET" && ruta === "/") {
        const clave = url.searchParams.get("admin") || "";
        if (!env.CLAVE_ADMIN || clave !== env.CLAVE_ADMIN) {
          return json({ error: "Clave de administración incorrecta." }, 403);
        }
        const lista = await env.BUZON.list({ prefix: "sol:" });
        const items = [];
        for (const k of lista.keys) {
          const v = await env.BUZON.get(k.name, "json");
          if (v) items.push({ id: k.name, ...v });
        }
        // De la más antigua a la más reciente
        items.sort((a, b) => (a.recibida || "").localeCompare(b.recibida || ""));
        return json({ ok: true, total: items.length, solicitudes: items });
      }

      // ---------- Un facultativo envía una solicitud ----------
      if (request.method === "POST" && ruta === "/") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);

        if (!env.CLAVE_ENVIO || cuerpo.clave !== env.CLAVE_ENVIO) {
          return json({ error: "Clave de envío incorrecta." }, 403);
        }
        if (!cuerpo.req || typeof cuerpo.req !== "object") {
          return json({ error: "Falta el contenido de la solicitud." }, 400);
        }

        // Límite de tamaño, por prudencia
        const texto = JSON.stringify(cuerpo.req);
        if (texto.length > 20000) return json({ error: "Solicitud demasiado grande." }, 413);

        const id = "sol:" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        const registro = {
          recibida: new Date().toISOString(),
          req: cuerpo.req,
          texto: String(cuerpo.texto || "").slice(0, 3000)
        };
        // Se conservan 60 días y luego caducan solas
        await env.BUZON.put(id, JSON.stringify(registro), { expirationTtl: 60 * 60 * 24 * 60 });
        // Aviso al coordinador: ha llegado una solicitud. No retrasa la respuesta.
        const toque = avisar(env, [PID_COORD]);
        if (ctx && ctx.waitUntil) ctx.waitUntil(toque);
        return json({ ok: true, id });
      }

      // ---------- El jefe de servicio confirma que ya las tiene ----------
      if (request.method === "POST" && ruta === "/borrar") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_ADMIN || cuerpo.admin !== env.CLAVE_ADMIN) {
          return json({ error: "Clave de administración incorrecta." }, 403);
        }
        const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids.slice(0, 200) : [];
        for (const id of ids) {
          if (typeof id === "string" && id.startsWith("sol:")) await env.BUZON.delete(id);
        }
        return json({ ok: true, borradas: ids.length });
      }

      // ---------- Calendario suscrito (se actualiza solo) ----------
      if (request.method === "GET" && ruta === "/calendario.ics") {
        const pid = url.searchParams.get("pid") || "";
        const clave = url.searchParams.get("k") || "";
        if (env.CLAVE_CALENDARIO && clave !== env.CLAVE_CALENDARIO) {
          return new Response("Clave incorrecta", { status: 403, headers: CORS });
        }
        if (!pid) return new Response("Falta el facultativo", { status: 400, headers: CORS });

        const owner = env.GH_OWNER, repo = env.GH_REPO, rama = env.GH_BRANCH || "main";
        if (!owner || !repo) return new Response("Destino no configurado", { status: 500, headers: CORS });

        const crudo = "https://raw.githubusercontent.com/" + owner + "/" + repo + "/" + rama + "/data.json?t=" + Date.now();
        const r = await fetch(crudo, { cf: { cacheTtl: 60 } });
        if (!r.ok) return new Response("No se ha podido leer el cuadrante", { status: 502, headers: CORS });
        const datos = await r.json().catch(() => null);
        if (!datos) return new Response("Cuadrante ilegible", { status: 502, headers: CORS });

        // Ventana móvil en torno a HOY: dos meses atrás y doce por delante.
        // Antes se tomaba solo el año publicado, que cambia según el mes que el
        // coordinador tenga abierto; al cruzar de año se perdían meses.
        const hoy = new Date();
        const meses = [];
        for (let i = -2; i <= 12; i++) {
          const f = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
          meses.push([f.getFullYear(), f.getMonth()]);
        }
        const ics = construirICS(datos, pid, meses);
        if (!ics) return new Response("Facultativo no encontrado", { status: 404, headers: CORS });

        return new Response(ics, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "public, max-age=1800",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // ---------- Comprobar si una contraseña sirve para publicar ----------
      // Lo usa la aplicación al entrar en modo edición, para no tener que pedirla aparte.
      if (request.method === "POST" && ruta === "/verificar") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        const vale = !!env.CLAVE_PUBLICAR && cuerpo.clave === env.CLAVE_PUBLICAR;
        if (!vale && (await falloClave(request, env))) return json({ error: MSG_FRENO }, 429);
        return json({ ok: true, valida: vale });
      }

      // ---------- Copias de seguridad guardadas en el servidor ----------
      if (request.method === "POST" && ruta === "/copia") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_PUBLICAR || cuerpo.clave !== env.CLAVE_PUBLICAR) {
          return json({ error: "Contraseña incorrecta." }, 403);
        }
        if (!cuerpo.datos) return json({ error: "Faltan los datos." }, 400);
        const sello = new Date().toISOString().replace(/[:.]/g, "-");
        const id = "copia:" + sello;
        const texto = JSON.stringify(cuerpo.datos);
        if (texto.length > 3000000) return json({ error: "Copia demasiado grande." }, 413);
        // Se conservan 180 días
        await env.BUZON.put(id, texto, { expirationTtl: 60 * 60 * 24 * 180 });
        await env.BUZON.put("copia-info:" + sello, JSON.stringify({
          fecha: new Date().toISOString(),
          nota: String(cuerpo.nota || "").slice(0, 200),
          bytes: texto.length
        }), { expirationTtl: 60 * 60 * 24 * 180 });
        return json({ ok: true, id: id, bytes: texto.length });
      }

      // Listado de copias guardadas
      if (request.method === "GET" && ruta === "/copias") {
        const clave = url.searchParams.get("clave") || "";
        if (!env.CLAVE_PUBLICAR || clave !== env.CLAVE_PUBLICAR) {
          return json({ error: "Contraseña incorrecta." }, 403);
        }
        const lista = await env.BUZON.list({ prefix: "copia-info:" });
        const copias = [];
        for (const k of lista.keys) {
          const v = await env.BUZON.get(k.name, "json");
          if (v) copias.push({ id: "copia:" + k.name.slice("copia-info:".length), ...v });
        }
        copias.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
        return json({ ok: true, total: copias.length, copias: copias.slice(0, 60) });
      }

      // Descargar una copia concreta
      if (request.method === "GET" && ruta === "/copia") {
        const clave = url.searchParams.get("clave") || "";
        const id = url.searchParams.get("id") || "";
        if (!env.CLAVE_PUBLICAR || clave !== env.CLAVE_PUBLICAR) {
          return json({ error: "Contraseña incorrecta." }, 403);
        }
        if (!id.startsWith("copia:")) return json({ error: "Identificador no válido." }, 400);
        const datos = await env.BUZON.get(id);
        if (!datos) return json({ error: "No se encuentra esa copia." }, 404);
        return new Response(datos, {
          headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }

      // ---------- Los administrativos ponen o quitan consultas de Tráfico ----------
      // Solo pueden tocar códigos de tráfico y nunca sobrescriben nada.
      if (request.method === "POST" && ruta === "/trafico") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_ADMVO || cuerpo.clave !== env.CLAVE_ADMVO) {
          return json({ error: "Contraseña de administrativo incorrecta." }, 403);
        }
        if (!env.GITHUB_TOKEN || !env.GH_OWNER || !env.GH_REPO) {
          return json({ error: "El servidor no tiene configurado el destino en GitHub." }, 500);
        }
        const pid = String(cuerpo.pid || "");
        const fecha = String(cuerpo.fecha || "");
        const slot = String(cuerpo.slot || "");
        const code = String(cuerpo.code || "");
        const quitar = cuerpo.quitar === true;
        const hora = String(cuerpo.hora || "");

        if (!pid || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "Faltan datos." }, 400);
        if (slot !== "m" && slot !== "t") return json({ error: "Turno no válido." }, 400);
        // Solo códigos de tráfico
        const esTrafico = (c) => /^TFM[123]$/.test(c) || /^TFT[123]$/.test(c);
        if (!quitar && !esTrafico(code)) return json({ error: "Solo se pueden poner consultas de Tráfico." }, 400);
        if (!quitar && slot === "m" && !/^TFM[123]$/.test(code)) return json({ error: "Ese código no es de mañana." }, 400);
        if (!quitar && slot === "t" && !/^TFT[123]$/.test(code)) return json({ error: "Ese código no es de tarde." }, 400);

        // Ni fin de semana ni festivo
        const dow = new Date(fecha + "T12:00:00Z").getUTCDay();
        if (dow === 0 || dow === 6) return json({ error: "Ese día es fin de semana." }, 400);

        const res = await editarCuadrante(env,
          "Administrativo: " + (quitar ? "quita" : "pone") + " tráfico " + fecha,
          (datos) => {
            if ((datos.holidays || []).some(h => h.date === fecha)) return { error: "Ese día es festivo.", status: 400 };
            const persona = (datos.physicians || []).find(x => x.id === pid);
            if (!persona) return { error: "No se encuentra al facultativo.", status: 404 };
            datos.assignments = datos.assignments || {};
            const k = pid + "|" + fecha;
            const celda = datos.assignments[k] || { m: null, t: null, f: null };
            if (quitar) {
              if (!esTrafico(celda[slot] || "")) return { error: "Ahí no hay una consulta de Tráfico.", status: 400 };
              const quitado = celda[slot];
              celda[slot] = null;
              if (!celda.m && !celda.t && !celda.f) delete datos.assignments[k];
              else datos.assignments[k] = celda;
              if (datos.traficoHoras) delete datos.traficoHoras[pid + "|" + fecha + "|" + slot];
              datos.avisosTrafico = (datos.avisosTrafico || []).concat([{
                at: new Date().toISOString(), accion: "quitar", por: "administración",
                phys: persona.name, fecha, slot, code: quitado, visto: false
              }]);
            } else {
              if (celda.f) return { error: "Ese día tiene " + celda.f + " asignado.", status: 409 };
              if (celda[slot]) return { error: "Ese turno ya está ocupado con " + celda[slot] + ".", status: 409 };
              const repetida = (datos.physicians || []).some(q => {
                if (q.id === pid) return false;
                const x = datos.assignments[q.id + "|" + fecha];
                return x && x[slot] === code;
              });
              if (repetida) return { error: "La consulta " + code + " ya la tiene otro compañero ese día.", status: 409 };
              // Los tráficos de mañana ocupan despacho físico
              if (slot === "m") {
                const tope = (datos.settings && datos.settings.maxMorning) || 8;
                const sinDespacho = ["RXINT", "ADM", "ADMT"];
                let ocupadas = 0;
                (datos.physicians || []).forEach(q => {
                  const x = datos.assignments[q.id + "|" + fecha];
                  if (x && x.m && sinDespacho.indexOf(x.m) < 0) ocupadas++;
                });
                if (ocupadas >= tope) {
                  return { error: "Ese día ya están ocupados los " + tope + " despachos de mañana.", status: 409 };
                }
              }
              celda[slot] = code;
              datos.assignments[k] = { m: celda.m || null, t: celda.t || null, f: null };
              if (hora) {
                datos.traficoHoras = datos.traficoHoras || {};
                datos.traficoHoras[pid + "|" + fecha + "|" + slot] = hora;
              }
              datos.avisosTrafico = (datos.avisosTrafico || []).concat([{
                at: new Date().toISOString(), accion: "poner", por: "administración",
                phys: persona.name, fecha, slot, code, hora, visto: false
              }]);
            }
            if (datos.avisosTrafico && datos.avisosTrafico.length > 100) {
              datos.avisosTrafico = datos.avisosTrafico.slice(-100);
            }
            return {};
          });
        if (res.error) return json({ error: res.error }, res.status || 502);
        // v179: administración ha puesto o quitado un tráfico → aviso al facultativo y al coordinador
        const toqueTf = avisar(env, [pid, PID_COORD]);
        if (ctx && ctx.waitUntil) ctx.waitUntil(toqueTf);
        return json({ ok: true });
      }

      // ---------- Los administrativos marcan un cambio como reajustado ----------
      // Solo tocan ese indicador: el resto del cuadrante queda intacto.
      if (request.method === "POST" && ruta === "/ejecutado") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_ADMVO || cuerpo.clave !== env.CLAVE_ADMVO) {
          return json({ error: "Contraseña de administrativo incorrecta." }, 403);
        }
        if (!env.GITHUB_TOKEN || !env.GH_OWNER || !env.GH_REPO) {
          return json({ error: "El servidor no tiene configurado el destino en GitHub." }, 500);
        }
        const mk = String(cuerpo.mk || ""), id = String(cuerpo.id || "");
        if (!mk || !id) return json({ error: "Faltan datos del cambio." }, 400);

        let afectados = {};
        const res = await editarCuadrante(env,
          "Administrativo: cambio " + (cuerpo.valor === false ? "pendiente" : "reajustado"),
          (datos) => {
            const lista = (datos.cambiosAdm || {})[mk] || [];
            const c = lista.find(x => x && x.id === id);
            if (!c) return { error: "No se encuentra ese cambio.", status: 404 };
            afectados = {};
            (c.celdas || []).concat(c.previas || []).forEach(x => { if (x && x.k) afectados[String(x.k).split("|")[0]] = 1; });
            if (cuerpo.valor === false) {
              // Se deshace: el cuadrante vuelve a como estaba y queda de nuevo en espera
              delete c.ejecutado; delete c.ejecutadoAt;
              if (Array.isArray(c.previas)) {
                datos.assignments = datos.assignments || {};
                c.previas.forEach(x => {
                  if (x && x.k) { if (x.valor) datos.assignments[x.k] = x.valor; else delete datos.assignments[x.k]; }
                });
                c.pendiente = true;
              }
            } else {
              // Si ya constaba como hecho, no se repite
              if (c.ejecutado) return { sinCambios: true };
              if (c.pendiente && Array.isArray(c.celdas)) {
                datos.assignments = datos.assignments || {};
                // No se ejecuta si dejara algún día por encima del tope de despachos
                const errTope = excesoTopeServidor(datos, c.celdas);
                if (errTope) return { error: errTope, status: 409 };
                c.celdas.forEach(x => {
                  if (x && x.k) { if (x.valor) datos.assignments[x.k] = x.valor; else delete datos.assignments[x.k]; }
                });
                delete c.pendiente;
              }
              c.ejecutado = true; c.ejecutadoAt = new Date().toISOString();
            }
            return {};
          });
        if (res.error) return json({ error: res.error }, res.status || 502);
        // v179: administración ha reajustado el cambio → ya está aplicado: aviso a los facultativos afectados y al coordinador
        if (cuerpo.valor !== false) {
          const toqueEj = avisar(env, Object.keys(afectados).filter(pidAvisable).concat([PID_COORD]));
          if (ctx && ctx.waitUntil) ctx.waitUntil(toqueEj);
        }
        return json({ ok: true, ejecutado: cuerpo.valor !== false });
      }

      // ---------- Avisos: un dispositivo se apunta o se borra ----------
      if (request.method === "POST" && (ruta === "/suscribir" || ruta === "/desuscribir")) {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        const pid = String(cuerpo.pid || "");
        const endpoint = String((cuerpo.sub && cuerpo.sub.endpoint) || cuerpo.endpoint || "");
        if (!(pid === PID_COORD || pid === PID_ADMVO || /^[a-z0-9]{4,16}$/.test(pid))) return json({ error: "Destinatario no válido." }, 400);
        if (!endpointValido(endpoint) || endpoint.length > 1000) return json({ error: "Dispositivo no válido." }, 400);
        const clave = "push:" + pid + ":" + (await huella(endpoint));
        if (ruta === "/desuscribir") {
          await env.BUZON.delete(clave);
          return json({ ok: true });
        }
        // Los avisos del coordinador y de administración solo los recibe quien tiene su contraseña
        if (pid === PID_COORD && (!env.CLAVE_PUBLICAR || cuerpo.clave !== env.CLAVE_PUBLICAR)) return json({ error: "Contraseña incorrecta." }, 403);
        if (pid === PID_ADMVO && (!env.CLAVE_ADMVO || cuerpo.clave !== env.CLAVE_ADMVO)) return json({ error: "Contraseña incorrecta." }, 403);
        if (!env.VAPID_PRIVADA) return json({ error: "El servidor no tiene configurados los avisos." }, 500);
        const ya = await env.BUZON.list({ prefix: "push:" + pid + ":" });
        if (ya.keys.length >= MAX_DISPOSITIVOS && !ya.keys.some((k) => k.name === clave)) {
          return json({ error: "Ya hay demasiados dispositivos con avisos para esa persona." }, 409);
        }
        await env.BUZON.put(clave, JSON.stringify({ endpoint: endpoint, pid: pid, alta: new Date().toISOString() }));
        return json({ ok: true, horario: "9:00–21:00" });
      }

      // ---------- Peticiones de los repartos de puentes, SS y Feria (v183) ----------
      // Las preferencias NO van al cuadrante publicado: se guardan aquí, por reparto y persona,
      // con todas sus versiones (la vigente y las sustituidas, con quién y cuándo).
      //   GET  /peticion?reparto=&pid=&clave=    → las versiones de esa persona (clave de envío o de administración)
      //   POST /peticion {clave, reparto, pid, opciones, por} → nueva versión (con la de envío, solo si está abierto)
      //   GET  /peticiones?reparto=&admin=       → todas (solo el coordinador)
      //   POST /peticiones-estado {admin, reparto, estado}   → abre o cierra la recepción
      //   GET  /peticiones-estado?reparto=       → abierto / cerrado
      if (ruta === "/peticion" || ruta === "/peticiones" || ruta === "/peticiones-estado") {
        const REP = /^[a-z0-9-]{3,40}$/, PID = /^([a-z0-9]{4,16}|__ext__)$/, OPC = /^[a-z0-9-]{1,40}$/;
        const esAdmin = (c) => !!env.CLAVE_ADMIN && c === env.CLAVE_ADMIN;
        const esEnvio = (c) => !!env.CLAVE_ENVIO && c === env.CLAVE_ENVIO;
        if (request.method === "GET") {
          const reparto = url.searchParams.get("reparto") || "";
          if (!REP.test(reparto)) return json({ error: "Reparto no válido." }, 400);
          if (ruta === "/peticiones-estado") return json({ ok: true, estado: (await env.BUZON.get("pet-estado:" + reparto)) || "cerrado" });
          if (ruta === "/peticiones") {
            if (!esAdmin(url.searchParams.get("admin") || "")) return json({ error: "Clave de administración incorrecta." }, 403);
            const lista = await env.BUZON.list({ prefix: "pet:" + reparto + ":" });
            const todas = {};
            for (const k of lista.keys) todas[k.name.slice(("pet:" + reparto + ":").length)] = (await env.BUZON.get(k.name, "json")) || [];
            return json({ ok: true, peticiones: todas });
          }
          const clave = url.searchParams.get("clave") || "", pid = url.searchParams.get("pid") || "";
          if (!esEnvio(clave) && !esAdmin(clave)) return json({ error: "Clave incorrecta." }, 403);
          if (!PID.test(pid)) return json({ error: "Persona no válida." }, 400);
          return json({ ok: true, versiones: (await env.BUZON.get("pet:" + reparto + ":" + pid, "json")) || [] });
        }
        if (request.method === "POST") {
          const cuerpo = await request.json().catch(() => null);
          if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
          const reparto = String(cuerpo.reparto || "");
          if (!REP.test(reparto)) return json({ error: "Reparto no válido." }, 400);
          if (ruta === "/peticiones-estado") {
            if (!esAdmin(cuerpo.admin)) return json({ error: "Clave de administración incorrecta." }, 403);
            const estado = cuerpo.estado === "abierto" ? "abierto" : "cerrado";
            await env.BUZON.put("pet-estado:" + reparto, estado);
            return json({ ok: true, estado: estado });
          }
          if (ruta === "/peticion") {
            const admin = esAdmin(cuerpo.clave);
            if (!admin && !esEnvio(cuerpo.clave)) return json({ error: "Clave incorrecta." }, 403);
            const pid = String(cuerpo.pid || "");
            if (!PID.test(pid)) return json({ error: "Persona no válida." }, 400);
            const opciones = Array.isArray(cuerpo.opciones) ? cuerpo.opciones.map(String) : null;
            if (!opciones || opciones.length > 40 || opciones.some((o) => !OPC.test(o)) || new Set(opciones).size !== opciones.length) {
              return json({ error: "Lista de preferencias no válida." }, 400);
            }
            if (!admin && (await env.BUZON.get("pet-estado:" + reparto)) !== "abierto") {
              return json({ error: "La recepción de solicitudes de este reparto está cerrada." }, 409);
            }
            const clave = "pet:" + reparto + ":" + pid;
            const versiones = (await env.BUZON.get(clave, "json")) || [];
            const ahora = new Date().toISOString();
            versiones.forEach((v) => { if (v.vigente) { v.vigente = false; v.sustituida = ahora; } });
            versiones.push({ at: ahora, por: String(cuerpo.por || "").slice(0, 60) || (admin ? "coordinador" : ""), opciones: opciones, vigente: true });
            await env.BUZON.put(clave, JSON.stringify(versiones.slice(-50)));
            return json({ ok: true, version: versiones.length });
          }
        }
        return json({ error: "Ruta no encontrada." }, 404);
      }

      // ---------- Respuestas a un recordatorio (v187): «están bien» / «falta o sobra alguno» ----------
      //   POST /respuesta {clave (envío), rec, pid, estado, texto, por} · GET /respuestas?rec=&admin=
      if (ruta === "/respuesta" || ruta === "/respuestas") {
        const REC = /^r[a-z0-9]{3,24}$/, PIDR = /^[a-z0-9]{4,16}$/;
        if (request.method === "POST" && ruta === "/respuesta") {
          const cuerpo = await request.json().catch(() => null);
          if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
          const okClave = (env.CLAVE_ENVIO && cuerpo.clave === env.CLAVE_ENVIO) || (env.CLAVE_ADMIN && cuerpo.clave === env.CLAVE_ADMIN);
          if (!okClave) return json({ error: "Clave incorrecta." }, 403);
          const rec = String(cuerpo.rec || ""), pid = String(cuerpo.pid || "");
          if (!REC.test(rec) || !PIDR.test(pid)) return json({ error: "Datos no válidos." }, 400);
          const estado = cuerpo.estado === "bien" ? "bien" : "revisar";
          await env.BUZON.put("resp:" + rec + ":" + pid, JSON.stringify({ at: new Date().toISOString(), estado: estado,
            texto: String(cuerpo.texto || "").slice(0, 300), por: String(cuerpo.por || "").slice(0, 60) }), { expirationTtl: 60 * 60 * 24 * 120 });
          return json({ ok: true });
        }
        if (request.method === "GET" && ruta === "/respuestas") {
          if (!env.CLAVE_ADMIN || (url.searchParams.get("admin") || "") !== env.CLAVE_ADMIN) return json({ error: "Clave de administración incorrecta." }, 403);
          const rec = url.searchParams.get("rec") || "";
          if (!REC.test(rec)) return json({ error: "Recordatorio no válido." }, 400);
          const lista = await env.BUZON.list({ prefix: "resp:" + rec + ":" });
          const out = {};
          for (const k of lista.keys) out[k.name.split(":")[2]] = await env.BUZON.get(k.name, "json");
          return json({ ok: true, respuestas: out });
        }
        return json({ error: "Ruta no encontrada." }, 404);
      }

      // ---------- Quién tiene los avisos activados (v186, solo el coordinador) ----------
      if (request.method === "GET" && ruta === "/suscritos") {
        if (!env.CLAVE_ADMIN || (url.searchParams.get("admin") || "") !== env.CLAVE_ADMIN) return json({ error: "Clave de administración incorrecta." }, 403);
        const lista = await env.BUZON.list({ prefix: "push:" });
        const cuenta = {};
        lista.keys.forEach((k) => { const pid = k.name.split(":")[1]; if (pid) cuenta[pid] = (cuenta[pid] || 0) + 1; });
        return json({ ok: true, suscritos: cuenta });
      }

      // ---------- Avisos agrupados tras una tanda de cambios del coordinador (v180) ----------
      if (request.method === "POST" && ruta === "/avisar") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_PUBLICAR || cuerpo.clave !== env.CLAVE_PUBLICAR) return json({ error: "Contraseña incorrecta." }, 403);
        const lista = Array.isArray(cuerpo.avisar) ? cuerpo.avisar.filter(pidAvisable).slice(0, 40) : [];
        if (lista.length) { const t = avisar(env, lista); if (ctx && ctx.waitUntil) ctx.waitUntil(t); }
        return json({ ok: true, avisados: lista.length });
      }

      // ---------- Aviso de prueba al coordinador (ignora el horario de silencio) ----------
      if (request.method === "POST" && ruta === "/aviso-prueba") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_PUBLICAR || cuerpo.clave !== env.CLAVE_PUBLICAR) return json({ error: "Contraseña incorrecta." }, 403);
        const r = await enviarToques(env, [PID_COORD]);
        return json({ ok: true, enviados: r.enviados || 0, caducados: r.caducados || 0, motivo: r.motivo || "" });
      }

      // ---------- Archivar un mes pasado (v174) ----------
      // Guarda en el repositorio archivo/AAAA-MM.json con lo que la aplicación retira
      // del cuadrante publicado. Solo escribe ese archivo: no toca data.json.
      if (request.method === "POST" && ruta === "/archivar") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_PUBLICAR || cuerpo.clave !== env.CLAVE_PUBLICAR) {
          return json({ error: "Contraseña de publicación incorrecta." }, 403);
        }
        if (!env.GITHUB_TOKEN || !env.GH_OWNER || !env.GH_REPO) {
          return json({ error: "El servidor no tiene configurado el destino en GitHub." }, 500);
        }
        const mes = String(cuerpo.mes || "");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return json({ error: "Mes no válido." }, 400);
        if (!cuerpo.datos || typeof cuerpo.datos !== "object") return json({ error: "Faltan los datos del archivo." }, 400);
        const texto = JSON.stringify(cuerpo.datos);
        if (texto.length > 1500000) return json({ error: "Archivo demasiado grande." }, 413);

        const rama = env.GH_BRANCH || "main";
        const api = "https://api.github.com/repos/" + env.GH_OWNER + "/" + env.GH_REPO + "/contents/archivo/" + mes + ".json";
        const cabeceras = {
          "Authorization": "Bearer " + env.GITHUB_TOKEN,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "buzon-cuadrante"
        };
        let sha = null;
        const actual = await fetch(api + "?ref=" + encodeURIComponent(rama), { headers: cabeceras });
        if (actual.ok) {
          const a = await actual.json().catch(() => null);
          if (a && a.sha) sha = a.sha;
        } else if (actual.status !== 404) {
          return json({ error: "No se ha podido comprobar el archivo (" + actual.status + ")." }, 502);
        }
        const guardar = await fetch(api, {
          method: "PUT",
          headers: { ...cabeceras, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Archivo del mes " + mes,
            content: btoa(bytesABinario(new TextEncoder().encode(texto))),
            branch: rama,
            ...(sha ? { sha } : {})
          })
        });
        if (!guardar.ok) {
          const err = await guardar.text().catch(() => "");
          return json({ error: "GitHub ha rechazado el archivo (" + guardar.status + "): " + err.slice(0, 200) }, 502);
        }
        return json({ ok: true, mes: mes, bytes: texto.length });
      }

      // ---------- Publicar el cuadrante en GitHub ----------
      // El token de GitHub vive aquí, en el servidor. La aplicación solo envía
      // una contraseña, de modo que ningún dispositivo guarda el token.
      if (request.method === "POST" && ruta === "/publicar") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        if (!env.CLAVE_PUBLICAR || cuerpo.clave !== env.CLAVE_PUBLICAR) {
          return json({ error: "Contraseña de publicación incorrecta." }, 403);
        }
        if (!env.GITHUB_TOKEN || !env.GH_OWNER || !env.GH_REPO) {
          return json({ error: "El servidor no tiene configurado el destino en GitHub." }, 500);
        }
        if (!cuerpo.data || typeof cuerpo.data !== "object") {
          return json({ error: "Faltan los datos del cuadrante." }, 400);
        }
        // v180: si alguien (administración u otro dispositivo) ha guardado después de la versión
        // sobre la que trabaja quien publica, no se pisa. Solo se salta si lo pide expresamente.
        const basePub = typeof cuerpo.base === "string" ? cuerpo.base : "";
        if (basePub && cuerpo.forzar !== true) {
          const ultima = await env.BUZON.get("pub-ultima");
          if (ultima && ultima > basePub) {
            return json({ error: "Hay una versión publicada más reciente que la de este dispositivo.", conflicto: true, publishedAt: ultima }, 409);
          }
        }
        // La fecha de publicación la pone el servidor: así todos los dispositivos comparan con el mismo reloj
        const selloPub = new Date().toISOString();
        cuerpo.data.publishedAt = selloPub;

        const rama = env.GH_BRANCH || "main";
        const api = "https://api.github.com/repos/" + env.GH_OWNER + "/" + env.GH_REPO + "/contents/data.json";
        const cabeceras = {
          "Authorization": "Bearer " + env.GITHUB_TOKEN,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "buzon-cuadrante"
        };

        // Codificar el contenido en base64, respetando tildes y eñes
        const texto = JSON.stringify(cuerpo.data);
        const contenido = btoa(bytesABinario(new TextEncoder().encode(texto)));

        // Averiguar la versión actual del archivo (GitHub la exige para sobrescribir)
        let sha = null;
        const actual = await fetch(api + "?ref=" + encodeURIComponent(rama), { headers: cabeceras });
        if (actual.ok) {
          const a = await actual.json().catch(() => null);
          if (a && a.sha) sha = a.sha;
        }

        const guardar = await fetch(api, {
          method: "PUT",
          headers: { ...cabeceras, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Cuadrante publicado " + new Date().toISOString(),
            content: contenido,
            branch: rama,
            ...(sha ? { sha } : {})
          })
        });

        if (!guardar.ok) {
          const err = await guardar.text().catch(() => "");
          return json({ error: "GitHub ha rechazado la publicación (" + guardar.status + "): " + err.slice(0, 200) }, 502);
        }
        // v179: la aplicación indica a quién afecta lo publicado (compararlo aquí costaría demasiado cálculo)
        const destinos = Array.isArray(cuerpo.avisar) ? cuerpo.avisar.filter(pidAvisable).slice(0, 40) : [];
        if (destinos.length) {
          const toquePub = avisar(env, destinos);
          if (ctx && ctx.waitUntil) ctx.waitUntil(toquePub);
        }
        try { await env.BUZON.put("pub-ultima", selloPub); } catch (e) { /* ayuda para detectar choques */ }
        return json({ ok: true, publicado: selloPub, avisados: destinos.length });
      }

      return json({ error: "Ruta no encontrada." }, 404);
    } catch (e) {
      return json({ error: "Error interno: " + (e && e.message ? e.message : String(e)) }, 500);
    }
  }
}

// v150: tope de consultas físicas de mañana (RXINT, ADM y ADMT no ocupan despacho)
function excesoTopeServidor(datos, celdas) {
  const SIN_DESPACHO = ["RXINT", "ADM", "ADMT"];
  const max = (datos.settings && datos.settings.maxMorning) || 8;
  const ids = new Set((datos.physicians || []).map(p => p.id));
  const contar = (vista) => {
    const n = {};
    Object.keys(vista).forEach(k => {
      const i = k.indexOf("|"); if (i < 0 || !ids.has(k.slice(0, i))) return;
      const a = vista[k];
      if (a && a.m && SIN_DESPACHO.indexOf(a.m) < 0) { const d = k.slice(i + 1); n[d] = (n[d] || 0) + 1; }
    });
    return n;
  };
  const actual = datos.assignments || {};
  const antes = contar(actual);
  const v = Object.assign({}, actual);
  celdas.forEach(x => { if (x && x.k) { if (x.valor) v[x.k] = x.valor; else delete v[x.k]; } });
  const despues = contar(v);
  const dias = Object.keys(despues).filter(d => despues[d] > max && despues[d] > (antes[d] || 0)).sort();
  if (!dias.length) return null;
  const fmt = d => d.split("-").reverse().join("/");
  return "No hay hueco físico: " + dias.map(d => "el " + fmt(d) + " ya están ocupadas las " + max +
    " consultas físicas de mañana (quedarían " + despues[d] + ")").join("; ") +
    ". No se puede marcar como reajustado. Avisa al coordinador.";
}
