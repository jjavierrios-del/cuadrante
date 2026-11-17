// ================== Novedades de cada persona (v185) ==================
// Archivo común: lo usan el service worker (texto de la notificación) y la aplicación
// (tarjeta «Novedades desde tu última visita»), para que digan exactamente lo mismo.
// Compara el cuadrante publicado con la última foto que vio cada uno.
const AVISO_DSEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function avisoDiaLargo(k) {
  const p = String(k || "").split("-").map(Number); if (p.length < 3 || !p[0]) return String(k || "");
  return AVISO_DSEM[new Date(p[0], p[1] - 1, p[2]).getDay()] + " " + String(p[2]).padStart(2, "0") + "/" + String(p[1]).padStart(2, "0");
}
// «m/t/f» → «RHB1 + ALT2», «URG», «libre»
function avisoCelda(t) {
  const x = String(t || "").split("/").filter(Boolean);
  return x.length ? x.join(" + ") : "libre";
}
const AVISO_TIPOS = { move: "mover consulta", swap: "intercambio", consultas: "intercambio de consultas", doble: "cambio doble", ceder: "cesión", urg2: "urgencia por dos consultas",
  trafico: "consulta de Tráfico", libre: "días de no disponibilidad", permiso: "permiso", actividad: "cambio de actividad", cadena: "cambio en cadena" };
function avisoTipoReq(r) { return AVISO_TIPOS[(r || {}).type] || "cambio"; }
function avisoFechasReq(r) {
  r = r || {}; const f = [];
  ["dateFrom", "dateA", "fA", "date", "dateU", "fecha"].forEach((c) => { if (typeof r[c] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r[c])) f.push(r[c]); });
  (r.dias || []).forEach((x) => { if (/^\d{4}-\d{2}-\d{2}$/.test(x)) f.push(x); });
  (r.pares || []).forEach((x) => { if (x && x.a) f.push(x.a); });
  (r.pasos || []).forEach((x) => { ["date", "dateU", "dateTo"].forEach((c) => { if (x && typeof x[c] === "string") f.push(x[c]); }); });
  return f.filter((x, i, l) => l.indexOf(x) === i).sort();
}
function avisoFechasOpcion(r, id) {
  let f = []; (r.bloques || []).forEach((b) => (b.opciones || []).forEach((o) => { if (o.id === id) f = o.fechas || []; })); return f;
}
// Texto de un recordatorio para una persona concreta
function avisoTextoRecordatorio(r, d, pid) {
  if (r.tipo === "trafico") {
    const mk = String(r.mes || ""); const p = mk.split("-").map(Number);
    const dias = [];
    Object.keys(d.assignments || {}).forEach((k) => {
      const i = k.indexOf("|"); if (k.slice(0, i) !== pid || k.slice(i + 1, i + 8) !== mk) return;
      const a = d.assignments[k] || {}; if (a.f) return;
      ["m", "t"].forEach((sl) => { if (/^TF[MT]\d$/.test(a[sl] || "")) dias.push(k.slice(i + 1)); });
    });
    dias.sort();
    const mes = p.length === 2 ? AVISO_MESES[p[1] - 1] : mk;
    const lista = dias.length ? "tienes " + dias.length + ": " + dias.map(avisoFecha).join(", ") : "no tienes ninguna registrada";
    return { texto: "Revisa tus consultas de Tráfico de " + mes + " (" + lista + "). Si falta o sobra alguna, avisa al coordinador antes de que se envíen a facturación.", tab: "cuadrante", dia: mk + "-01" };
  }
  if (r.tipo === "reparto") {
    const rep = (d.repartos || {})[r.reparto] || {};
    return { texto: "Recordatorio: envía tus preferencias del reparto «" + (rep.nombre || r.reparto) + "» en Solicitudes → Peticiones.", tab: "solicitudes" };
  }
  return { texto: String(r.texto || "Recordatorio del coordinador."), tab: "cuadrante" };
}
function avisoOpcion(r, id) { const f = avisoFechasOpcion(r, id); return f.length ? f.map(avisoDiaLargo).join(" + ") : id; }
const avisoFecha = (k) => String(k || "").split("-").reverse().slice(0, 2).join("/");      // 2027-01-12 → 12/01
const AVISO_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function avisoParticipa(r, pid) {
  if (!r || !pid) return false;
  if ([r.pid, r.pidA, r.pidB].indexOf(pid) >= 0) return true;
  return Array.isArray(r.pasos) && r.pasos.some((x) => x && [x.pid, x.pidA, x.pidB].indexOf(pid) >= 0);
}
// Devuelve {cuerpo, tag, visto}: el texto del aviso y la foto que se guarda para la próxima vez.
// «visto» es la foto anterior (o null la primera vez); «hoy» es la fecha AAAA-MM-DD.
// Texto a partir de los motivos que anota el servidor (coordinador y administración)
function avisoDesdeMotivos(pid, d, visto, motivos) {
  const ult = (motivos || []).reduce((m, x) => (x && x.at > m ? x.at : m), (visto && visto.motAt) || "");
  const lim = new Date(Date.now() - 10 * 60000).toISOString();
  const nuevos = (motivos || []).filter((m) => m && m.at && (visto && visto.motAt ? m.at > visto.motAt : m.at > lim));
  const partes = []; let ir = null;
  const n = (t) => nuevos.filter((m) => m.t === t).length;
  const nombre = (id) => ((d.physicians || []).find((p) => p.id === id) || {}).name || "un compañero";
  if (n("prueba")) partes.push("Aviso de prueba: los avisos funcionan en este dispositivo.");
  if (n("solicitud")) { partes.push(n("solicitud") === 1 ? "Ha llegado una solicitud nueva al buzón." : "Han llegado " + n("solicitud") + " solicitudes nuevas al buzón."); ir = { tab: "solicitudes" }; }
  if (n("reajuste")) { partes.push("Administración ha reajustado " + (n("reajuste") === 1 ? "un cambio." : n("reajuste") + " cambios.")); ir = ir || { tab: "administrativo" }; }
  nuevos.filter((m) => m.t === "trafico").slice(-3).forEach((m) => {
    partes.push("Administración ha " + (m.accion === "quitar" ? "quitado" : "puesto") + " un tráfico a " + nombre(m.pid) + " el " + avisoFecha(m.fecha) + ".");
    ir = ir || { tab: "cuadrante", dia: m.fecha };
  });
  if (n("espera")) { partes.push(n("espera") === 1 ? "Hay un cambio nuevo pendiente de reajustar." : "Hay " + n("espera") + " cambios nuevos pendientes de reajustar."); ir = ir || { tab: "administrativo" }; }
  return { partes: partes, ir: ir, motAt: ult };
}
function avisoComponer(pid, d, visto, hoy, motivos) {
  d = d || {};
  const partes = [];
  if (pid === "__coord__" || pid === "__admvo__") {
    // v190: si el servidor dice el motivo, manda él (el cuadrante publicado puede llegar con retraso)
    const m = avisoDesdeMotivos(pid, d, visto, motivos);
    if (m.partes.length) {
      const base = avisoComponer(pid, d, visto, hoy, null);       // para guardar la foto actualizada
      base.visto.motAt = m.motAt;
      return { cuerpo: m.partes.join(" "), tag: pid === "__coord__" ? "cuadrante-coord" : "cuadrante-admvo", visto: base.visto, ir: m.ir || base.ir };
    }
    if (motivos) {
      const base = avisoComponer(pid, d, visto, hoy, null);
      base.visto.motAt = m.motAt;
      return base;
    }
  }
  if (pid === "__coord__") {
    const tf = d.avisosTrafico || []; const ult = tf.length ? tf[tf.length - 1] : null;
    let ej = 0; Object.keys(d.cambiosAdm || {}).forEach((mk) => (d.cambiosAdm[mk] || []).forEach((c) => { if (c && c.ejecutado) ej++; }));
    const nuevo = { tf: ult ? String(ult.at || "") : "", ej: ej };
    if (visto && ult && nuevo.tf !== visto.tf) {
      partes.push("Administración ha " + (ult.accion === "quitar" ? "quitado" : "puesto") + " un tráfico a " + (ult.phys || "un compañero") + " el " + avisoFecha(ult.fecha) + ".");
    }
    if (visto && ej > (visto.ej || 0)) { const n = ej - (visto.ej || 0); partes.push("Administración ha reajustado " + (n === 1 ? "un cambio" : n + " cambios") + "."); }
    let ir = { tab: "solicitudes" };
    if (partes.length) ir = (visto && ult && nuevo.tf !== visto.tf && ult.fecha) ? { tab: "cuadrante", dia: ult.fecha } : { tab: "administrativo" };
    if (visto && visto.motAt) nuevo.motAt = visto.motAt;
    if (!partes.length) partes.push("Hay novedades en el cuadrante.");          // v190: sin motivo, no se afirma que haya una solicitud
    return { cuerpo: partes.join(" "), tag: "cuadrante-coord", visto: nuevo, ir: ir };
  }
  if (pid === "__admvo__") {
    let pend = 0; Object.keys(d.cambiosAdm || {}).forEach((mk) => (d.cambiosAdm[mk] || []).forEach((c) => { if (c && !c.ejecutado) pend++; }));
    const n = visto ? pend - (visto.pend || 0) : 0;
    partes.push(n > 0 ? ("Hay " + (n === 1 ? "un cambio nuevo pendiente" : n + " cambios nuevos pendientes") + " de reajustar.") : "Hay novedades en el cuadrante.");
    return { cuerpo: partes.join(" "), tag: "cuadrante-admvo", visto: { pend: pend, motAt: (visto && visto.motAt) || "" }, ir: { tab: "administrativo" } };
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
  const sol = {}, solReq = {};
  (d.bandeja || []).forEach((it) => { if (it && it.id && avisoParticipa(it.req, pid)) { sol[it.id] = it.estado; solReq[it.id] = it.req; } });
  // v185: repartos publicados (fecha de publicación de cada uno)
  const rep = {};
  Object.keys(d.repartos || {}).forEach((id) => { const r = d.repartos[id]; if (r && r.publicado && r.publicado.at) rep[id] = r.publicado.at; });
  // v186: recordatorios que manda el coordinador (repartos, revisar tráficos…)
  const recs = (Array.isArray(d.recordatorios) ? d.recordatorios : []).filter((r) => r && r.id && (r.para === "todos" || (Array.isArray(r.para) && r.para.indexOf(pid) >= 0)));
  const nuevo = { of: of, asg: asg, sol: sol, rep: rep, rec: recs.map((r) => r.id) };
  let ir = { tab: "cuadrante" };
  const items = [];          // v185: detalle para la tarjeta de novedades de la app
  if (visto) {
    let apr = 0, rech = 0;
    Object.keys(sol).forEach((id) => {
      const antes = (visto.sol || {})[id];
      if (sol[id] !== "pendiente" && antes !== sol[id] && (antes === "pendiente" || antes === undefined)) {
        if (sol[id] === "aprobada") apr++; else rech++;
        const f = avisoFechasReq(solReq[id]);
        items.push({ tipo: "solicitud", texto: "Tu solicitud de " + avisoTipoReq(solReq[id]) + (f.length ? " (" + f.slice(0, 2).map(avisoDiaLargo).join(", ") + ")" : "") + (sol[id] === "aprobada" ? " ha sido aprobada." : " no ha sido autorizada."), tab: "solicitudes" });
      }
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
      if (tfAhora && !tfAntes) {
        const sl = /TFM/.test(asg[dia]) ? "m" : "t"; const h = (d.traficoHoras || {})[pid + "|" + dia + "|" + sl];
        items.push({ tipo: "trafico", texto: avisoDiaLargo(dia) + ": consulta de Tráfico nueva" + (h ? " a las " + h : "") + ".", dia: dia });
      } else {
        items.push({ tipo: "turno", texto: avisoDiaLargo(dia) + ": " + avisoCelda(antes[dia]) + " → " + avisoCelda(asg[dia]), dia: dia });
      }
    });
    if (traficos.length) partes.push("Tienes una consulta de Tráfico nueva el " + traficos.slice(0, 2).map(avisoFecha).join(" y el ") + (traficos.length > 2 ? " (y " + (traficos.length - 2) + " más)" : "") + ".");
    if (cambiados.length) partes.push((cambiados.length === 1 ? "Ha cambiado tu turno del " : "Han cambiado tus turnos del ") + cambiados.slice(0, 2).map(avisoFecha).join(" y el ") + (cambiados.length > 2 ? " (y " + (cambiados.length - 2) + " más)" : "") + ".");
    mesesNuevos.forEach((mk) => { const p = mk.split("-").map(Number); partes.push("Ya está el cuadrante oficial de " + AVISO_MESES[p[1] - 1] + ".");
      items.push({ tipo: "mes", texto: "Ya está el cuadrante oficial de " + AVISO_MESES[p[1] - 1] + " " + p[0] + ".", dia: mk + "-01" }); });
    // v186: recordatorios nuevos (con una foto anterior a la v186, valen los de los últimos 3 días)
    const vistos = Array.isArray(visto.rec) ? visto.rec : null;
    const limite = new Date(Date.now() - 3 * 864e5).toISOString();
    recs.forEach((r) => {
      if (vistos ? vistos.indexOf(r.id) >= 0 : String(r.at || "") < limite) return;
      const t = avisoTextoRecordatorio(r, d, pid);
      partes.unshift(t.texto); items.unshift({ tipo: "recordatorio", texto: t.texto, tab: t.tab, dia: t.dia || "" });
      if (t.tab === "solicitudes") ir = { tab: "solicitudes" };
    });
    // v185: repartos publicados (o vueltos a publicar) desde la última vez
    Object.keys(rep).forEach((id) => {
      if (visto.rep && visto.rep[id] === rep[id]) return;
      if (!visto.rep) return;          // foto anterior a la v185: no se sabe qué estaba publicado
      const r = d.repartos[id]; const op = r.publicado.asig ? r.publicado.asig[pid] : null;
      items.push({ tipo: "reparto", tab: "solicitudes", texto: "Reparto «" + (r.nombre || id) + "» publicado: " + (op ? "te ha tocado " + avisoOpcion(r, op) + "." : "no tienes nada asignado."), dia: op ? (avisoFechasOpcion(r, op)[0] || "") : "" });
    });
    // A dónde lleva el aviso: al día que ha cambiado; si no, a sus solicitudes; si no, al mes nuevo
    if (traficos.length || cambiados.length) ir = { tab: "cuadrante", dia: (traficos.concat(cambiados)).sort()[0] };
    else if (apr || rech) ir = { tab: "solicitudes" };
    else if (mesesNuevos.length) ir = { tab: "cuadrante", dia: mesesNuevos[0] + "-01" };
  }
  if (!partes.length) partes.push(items.length ? items[0].texto : "Hay novedades en el cuadrante.");
  return { cuerpo: partes.join(" "), tag: "cuadrante-novedad", visto: nuevo, ir: ir, items: items };
}
