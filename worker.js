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
 * Y un almacén KV enlazado con el nombre:  BUZON
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });

export default {
  async fetch(request, env) {
    // Comprobación previa del navegador
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

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

      // ---------- Comprobar si una contraseña sirve para publicar ----------
      // Lo usa la aplicación al entrar en modo edición, para no tener que pedirla aparte.
      if (request.method === "POST" && ruta === "/verificar") {
        const cuerpo = await request.json().catch(() => null);
        if (!cuerpo) return json({ error: "Petición mal formada." }, 400);
        const vale = !!env.CLAVE_PUBLICAR && cuerpo.clave === env.CLAVE_PUBLICAR;
        return json({ ok: true, valida: vale });
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
        const bytes = new TextEncoder().encode(texto);
        let binario = "";
        for (const b of bytes) binario += String.fromCharCode(b);
        const contenido = btoa(binario);

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
        return json({ ok: true, publicado: new Date().toISOString() });
      }

      return json({ error: "Ruta no encontrada." }, 404);
    } catch (e) {
      return json({ error: "Error interno: " + (e && e.message ? e.message : String(e)) }, 500);
    }
  }
};
