/* V.I.T.A. 0.1 — base de la app: entrada con Google, sincronización,
   pestañas, tema, importación de las copias antiguas y copia de seguridad.
   Las pantallas de Entreno, Comida y Progreso se construyen en 0.2–0.5. */

import { APP_VERSION, ajustesPorDefecto, hoyISO, edadEn } from "./model.js";
import { importarCopias, volumenSesion, kcalDia } from "./import.js";
import { crearCopia, esCopiaVita, descargar } from "./backup.js";
import { icon, logo } from "./icons.js";

/* Modo local (solo en localhost con ?local): datos en memoria, sin Firebase.
   Sirve para probar la interfaz; nunca se usa en la app publicada. */
const MODO_LOCAL = location.hostname === "localhost" && new URLSearchParams(location.search).has("local");
const DB = MODO_LOCAL ? await import("./db-local.js") : await import("./db.js");

const S = {
  user: null, ajustes: null, compra: null,
  ejercicios: [], sesiones: [], dias: [], alimentos: [], menus: [], diario: [],
  pendiente: {}, cache: {}, online: navigator.onLine,
  tab: (location.hash || "#hoy").slice(1), importacion: null, persistente: null, cargado: false
};
const TABS = [
  { id: "hoy", label: "Hoy" }, { id: "entreno", label: "Entreno" }, { id: "comida", label: "Comida" },
  { id: "progreso", label: "Progreso" }, { id: "ajustes", label: "Ajustes" }
];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (n, d = 0) => Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
const fecha = iso => new Date(iso + "T00:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const diasDesde = iso => Math.floor((new Date(hoyISO() + "T00:00:00") - new Date(iso + "T00:00:00")) / 86400000);

/* ---------- tema ---------- */
function temaActual() {
  if (S.ajustes && S.ajustes.app && S.ajustes.app.tema) return S.ajustes.app.tema;
  try { return localStorage.getItem("vita:tema") || "oscuro"; } catch { return "oscuro"; }
}
function aplicarTema() {
  const t = temaActual();
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("vita:tema", t); } catch {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === "claro" ? "#EEF3F6" : "#05080C";
}
function cambiarTema(t) {
  if (!S.ajustes) return;
  S.ajustes.app.tema = t; aplicarTema(); render();
  DB.guardarAjustes(S.user.uid, S.ajustes).catch(err => toast("No se pudo guardar el tema: " + err.message));
}

/* ---------- avisos breves ---------- */
let toastT = null;
function toast(msg, ms = 2600) {
  $("toast").innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toastT); toastT = setTimeout(() => { $("toast").innerHTML = ""; }, ms);
}

/* ---------- cálculos que usa la portada ---------- */
function pesoDeCalculo() {
  const p = S.ajustes.perfil;
  const pesajes = S.dias.filter(d => d.peso > 0 && diasDesde(d.fecha) <= 30)
    .sort((a, b) => a.fecha < b.fecha ? 1 : -1).slice(0, p.pesajesMedia || 7);
  if (pesajes.length < (p.pesajesMinimos || 4)) return { valor: p.pesoReferencia, fuente: `referencia · ${pesajes.length} de ${p.pesajesMinimos || 4} pesajes` };
  return { valor: pesajes.reduce((a, d) => a + d.peso, 0) / pesajes.length, fuente: `media de ${pesajes.length} pesajes` };
}
const hayDatos = () => S.sesiones.length + S.diario.length + S.dias.length + S.alimentos.length > 0;
function copiaPendiente() {
  if (!hayDatos()) return false;
  const u = S.ajustes.app.ultimaCopia;
  return !u || diasDesde(u) >= (S.ajustes.app.recordatorioCopiaDias || 15);
}
function estadoSync() {
  if (!S.online) return { txt: "Sin conexión", col: "var(--warn)", ico: "nube" };
  if (Object.values(S.pendiente).some(Boolean)) return { txt: "Sincronizando", col: "var(--acc)", ico: "nube" };
  return { txt: "Sincronizado", col: "var(--ok)", ico: "sync" };
}

/* ---------- pantallas ---------- */
function pantallaLogin(error) {
  document.body.innerHTML = `
  <div class="login">
    ${logo(120)}
    <div class="brand-name">V.I.T.A.</div>
    <p>Entreno, comida y actividad en un solo sitio, sincronizado entre el móvil y el ordenador.</p>
    <button class="btn primary" id="entrar">Entrar con Google</button>
    ${error ? `<p class="err">${esc(error)}</p>` : ""}
    <p class="muted">v${APP_VERSION}${MODO_LOCAL ? " · modo local de prueba" : ""}</p>
  </div>
  <div id="toast"></div>`;
  $("entrar").onclick = async () => {
    $("entrar").disabled = true;
    try { await DB.entrar(); }
    catch (e) { pantallaLogin(mensajeError(e)); }
  };
}
function mensajeError(e) {
  const c = e && e.code;
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return "Has cerrado la ventana de Google antes de terminar.";
  if (c === "auth/unauthorized-domain") return "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).";
  if (c === "auth/network-request-failed") return "No hay conexión. La primera entrada necesita internet.";
  if (c === "permission-denied") return "Firebase ha rechazado el acceso. Revisa que entras con tu cuenta y que las reglas de Firestore están publicadas.";
  return (e && e.message) || "Error desconocido";
}

function esqueleto() {
  document.body.innerHTML = `
  <div class="app">
    <header class="top">
      <div class="brand">${logo(30)}<span class="brand-name">V.I.T.A.</span></div>
      <div class="top-actions">
        <span class="chip" id="sync"></span>
        <button class="icon-btn" id="tema" aria-label="Cambiar entre tema claro y oscuro"></button>
      </div>
    </header>
    <nav class="tabs" id="tabs" aria-label="Secciones"></nav>
    <main id="main"></main>
  </div>
  <div id="update"></div>
  <div id="toast"></div>`;
  $("tema").onclick = () => cambiarTema(temaActual() === "claro" ? "oscuro" : "claro");
}

function render() {
  if (!$("main")) esqueleto();
  aplicarTema();
  const sy = estadoSync();
  $("sync").innerHTML = `${icon(sy.ico, 16, sy.col)}${sy.txt}`;
  $("tema").innerHTML = icon(temaActual() === "claro" ? "luna" : "sol", 20);
  $("tabs").innerHTML = TABS.map(t => `<button class="tab" data-tab="${t.id}" ${S.tab === t.id ? 'aria-current="page"' : ""}>${icon(t.id, 24)}<span>${t.label}</span></button>`).join("");
  const vista = { hoy: vHoy, entreno: vEntreno, comida: vComida, progreso: vProgreso, ajustes: vAjustes }[S.tab] || vHoy;
  $("main").innerHTML = S.cargado ? vista() : `<div class="card"><p class="muted" style="margin:0">Cargando tus datos…</p></div>`;
}

function vHoy() {
  const out = [`<div class="label">Hoy · ${esc(fecha(hoyISO()))}</div>`];
  if (copiaPendiente()) {
    const u = S.ajustes.app.ultimaCopia;
    out.push(`<div class="notice">${icon("aviso", 20, "var(--warn)")}<div style="flex:1">
      <div>${u ? `Han pasado ${diasDesde(u)} días desde tu última copia descargada.` : "Aún no has descargado ninguna copia de seguridad."}</div>
      <div class="muted">Tus datos están en la nube, pero una copia en Drive o en el ordenador es la red de seguridad.</div>
      <div class="btn-row" style="margin-top:8px"><button class="btn" data-act="copia">Descargar copia</button></div></div></div>`);
  }
  const pf = S.ajustes.perfil;
  if (hayDatos() && (!pf.nacimiento || !pf.sexo || !pf.altura || !pf.pesoReferencia))
    out.push(`<div class="notice">${icon("aviso", 20, "var(--warn)")}<div style="flex:1">Faltan datos de tu perfil (nacimiento, sexo, altura o peso de referencia). Sin ellos no se puede calcular el gasto.
      <div class="btn-row" style="margin-top:8px"><button class="btn" data-tab="ajustes">Completar en Ajustes</button></div></div></div>`);
  if (!hayDatos()) {
    out.push(`<div class="card accent"><p class="card-title">Empieza aquí</p>
      <p style="margin:0">Todavía no hay datos. Ve a <b>Ajustes → Importar copias</b> y elige los archivos de GYM-TRACKER y de FitCoock.</p>
      <div class="btn-row"><button class="btn primary" data-tab="ajustes">Ir a Ajustes</button></div></div>`);
    return out.join("");
  }
  const al = Object.fromEntries(S.alimentos.map(a => [a.id, a]));
  const ultSes = S.sesiones.slice().sort((a, b) => a.fecha < b.fecha ? 1 : -1).find(s => s.ejercicios.some(e => e.series.some(x => x.peso != null && x.reps != null)));
  const ultDia = S.diario.slice().sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0];
  const ultPasos = S.dias.filter(d => d.pasos).sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0];
  const ultPeso = S.dias.filter(d => d.peso).sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0];
  const pc = pesoDeCalculo();
  out.push(`<div class="card"><p class="card-title">Tus datos sincronizados</p><div class="grid2">
    <div class="stat"><b>${ultDia ? nf(kcalDia(ultDia, al)) : "—"}</b><span>kcal · ${ultDia ? esc(fecha(ultDia.fecha)) : "sin comidas"}</span></div>
    <div class="stat"><b>${ultSes ? nf(volumenSesion(ultSes)) : "—"}</b><span>kg de volumen · ${ultSes ? esc(fecha(ultSes.fecha)) : "sin sesiones"}</span></div>
    <div class="stat"><b>${ultPasos ? nf(ultPasos.pasos) : "—"}</b><span>pasos · ${ultPasos ? esc(fecha(ultPasos.fecha)) : "sin registro"}</span></div>
    <div class="stat"><b>${ultPeso ? nf(ultPeso.peso, 1) : "—"}</b><span>kg · ${ultPeso ? esc(fecha(ultPeso.fecha)) : "sin pesajes"}</span></div>
  </div>
  <p class="muted" style="margin:0">Peso para los cálculos: ${pc.valor ? nf(pc.valor, 1) + " kg (" + esc(pc.fuente) + ")" : "falta el peso de referencia"}.</p></div>`);
  out.push(`<div class="card"><p class="card-title">Lo que viene</p><ul class="list">
    <li>0.2 · Entreno: registro, temporizador, récords y volumen por grupo.</li>
    <li>0.3 · Comida: alimentos, platos, diario, menús y compra.</li>
    <li>0.4 · Actividad y cuerpo: pasos, cardio, pesajes y gasto.</li>
    <li>0.5 · Hoy con balance y macros, resumen semanal y exportación para el entrenador IA.</li></ul></div>`);
  return out.join("");
}

const enConstruccion = (titulo, version, lineas) => `<div class="label">${titulo}</div>
  <div class="card"><p class="card-title">Llega en la ${version}</p><ul class="list">${lineas.map(l => `<li>${l}</li>`).join("")}</ul></div>`;

function vEntreno() {
  const series = S.sesiones.reduce((a, s) => a + s.ejercicios.reduce((b, e) => b + e.series.filter(x => x.peso != null && x.reps != null).length, 0), 0);
  return enConstruccion("Entreno", "0.2", [
    `${S.sesiones.length} sesiones, ${nf(series)} series y ${S.ejercicios.length} ejercicios ya sincronizados.`,
    "Registro de series con guardado instantáneo y copia de tu mejor sesión.",
    "Aviso de récord al terminar la serie, visible en la propia serie.",
    "Temporizador de descanso con sonido y pantalla encendida.",
    "Volumen semanal con los grupos nuevos y rangos editables."]);
}
function vComida() {
  const platos = S.alimentos.filter(a => a.tipo === "plato").length;
  return enConstruccion("Comida", "0.3", [
    `${S.alimentos.length - platos} productos, ${platos} platos, ${S.menus.length} menús y ${S.diario.length} días de diario ya sincronizados.`,
    "Diario por comidas, biblioteca de menús y copia de comidas o días.",
    "Fritos con aceite absorbido estimado y «Completar el objetivo» mejorado.",
    "Objetivo en % o g/kg para cada macro y lista de la compra."]);
}
function vProgreso() {
  return enConstruccion("Progreso", "0.4 y 0.5", [
    "Progresión y récords por ejercicio.",
    "Resumen semanal: volumen, ingesta, gasto, balance, proteína, pasos y peso.",
    "Gasto con digestión incluida y calibración con tu peso real.",
    "Exportación de la semana para el entrenador IA."]);
}

function vAjustes() {
  const a = S.ajustes, p = a.perfil, pc = pesoDeCalculo(), sy = estadoSync();
  const imp = S.importacion;
  return `<div class="label">Ajustes</div>
  <div class="card"><p class="card-title">Cuenta</p>
    <div class="row"><span>Google</span><span>${esc(S.user.email || "")}</span></div>
    <div class="row"><span>Sincronización</span><span style="color:${sy.col}">${sy.txt}</span></div>
    <div class="row"><span>Almacenamiento local</span><span>${S.persistente === null ? "—" : S.persistente ? "Persistente" : "Normal (el navegador podría liberarlo)"}</span></div>
    <div class="btn-row"><button class="btn" data-act="salir">Cerrar sesión</button></div>
  </div>
  <div class="card"><p class="card-title">Tema</p>
    <div class="seg">
      <button data-tema="oscuro" aria-pressed="${temaActual() !== "claro"}">HUD oscuro</button>
      <button data-tema="claro" aria-pressed="${temaActual() === "claro"}">Claro exterior</button>
    </div>
  </div>
  <form class="card" id="cuerpo"><p class="card-title">Cuerpo</p>
    <div class="grid2">
      <label class="campo">Fecha de nacimiento<input type="date" name="nacimiento" value="${esc(p.nacimiento || "")}" max="${hoyISO()}"></label>
      <label class="campo">Sexo<select name="sexo">
        <option value="" ${!p.sexo ? "selected" : ""}>—</option>
        <option value="hombre" ${p.sexo === "hombre" ? "selected" : ""}>Hombre</option>
        <option value="mujer" ${p.sexo === "mujer" ? "selected" : ""}>Mujer</option></select></label>
      <label class="campo">Altura (cm)<input type="number" name="altura" inputmode="numeric" min="100" max="230" value="${p.altura ?? ""}"></label>
      <label class="campo">Peso de referencia (kg)<input type="number" name="pesoReferencia" inputmode="decimal" step="0.1" min="30" max="250" value="${p.pesoReferencia ?? ""}"></label>
    </div>
    <p class="muted" style="margin:0">Edad: ${edadEn(p.nacimiento) ?? "—"} años · Peso para los cálculos: ${pc.valor ? nf(pc.valor, 1) + " kg (" + esc(pc.fuente) + ")" : "—"}. El peso de referencia se usa hasta tener ${p.pesajesMinimos || 4} pesajes en 30 días; después, la media de los últimos ${p.pesajesMedia || 7}.</p>
    <div class="row"><span>Objetivo diario</span><span>${nf(a.objetivo.kcal)} kcal</span></div>
    <div class="btn-row"><button class="btn primary" type="submit">Guardar datos</button></div>
  </form>
  <div class="card"><p class="card-title">Datos y copias</p>
    <div class="row"><span>Última copia descargada</span><span>${a.app.ultimaCopia ? esc(fecha(a.app.ultimaCopia)) : "nunca"}</span></div>
    <div class="btn-row">
      <button class="btn primary" data-act="copia">Descargar copia</button>
      <label class="btn" for="archivos">Importar copias</label>
    </div>
    <input type="file" id="archivos" class="hide" accept=".json,application/json" multiple>
    <p class="muted" style="margin:0">Puedes elegir a la vez las copias de GYM-TRACKER y de FitCoock, o una copia de V.I.T.A. para restaurarla.</p>
    ${imp ? vistaImportacion(imp) : ""}
  </div>
  <p class="muted" style="text-align:center">V.I.T.A. v${APP_VERSION}${MODO_LOCAL ? " · modo local" : ""}</p>`;
}

function vistaImportacion(imp) {
  const d = imp.datos;
  const platos = d.alimentos.filter(x => x.tipo === "plato").length;
  const pasos = d.dias.filter(x => x.pasos).length, pesos = d.dias.filter(x => x.peso).length;
  const cardio = d.dias.reduce((s, x) => s + (x.cardio || []).length, 0);
  return `<div class="card accent" style="margin-top:6px"><p class="card-title">${imp.tipo === "vita" ? "Restaurar copia de V.I.T.A." : "Importar copias antiguas"}</p>
    <div class="grid2">
      <div class="stat"><b>${d.sesiones.length}</b><span>sesiones</span></div>
      <div class="stat"><b>${d.ejercicios.length}</b><span>ejercicios</span></div>
      <div class="stat"><b>${pasos} · ${pesos} · ${cardio}</b><span>días con pasos · pesajes · cardio</span></div>
      <div class="stat"><b>${d.alimentos.length - platos} · ${platos}</b><span>productos · platos</span></div>
      <div class="stat"><b>${d.diario.length}</b><span>días de diario</span></div>
      <div class="stat"><b>${d.menus.length}</b><span>menús</span></div>
    </div>
    ${(imp.avisos || []).length ? `<ul class="list">${imp.avisos.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${hayDatos() ? `<div class="notice">${icon("aviso", 20, "var(--warn)")}<span>Sustituye todos los datos que hay ahora en V.I.T.A. (en el móvil y en el ordenador). Descarga antes una copia si tienes algo nuevo.</span></div>` : ""}
    <div class="btn-row"><button class="btn primary" data-act="importar">Importar</button><button class="btn" data-act="cancelar-imp">Cancelar</button></div>
  </div>`;
}

/* ---------- acciones ---------- */
async function leerArchivos(files) {
  const leidos = await Promise.all([...files].map(f => f.text().then(t => {
    try { return JSON.parse(t); } catch { throw new Error(`«${f.name}» no es un JSON válido.`); }
  })));
  const vita = leidos.find(esCopiaVita);
  if (vita) {
    S.importacion = { tipo: "vita", datos: vita.datos, avisos: [`Copia del ${vita.exportado.slice(0, 10)} (v${vita.version_app}).`] };
  } else {
    const gym = leidos.find(j => j && j.app === "gym-tracker");
    const fit = leidos.find(j => j && j.app === "FitCoock");
    if (!gym && !fit) throw new Error("No reconozco esos archivos: elige copias de GYM-TRACKER, FitCoock o V.I.T.A.");
    const r = importarCopias({ gym, fit });
    if (!gym) r.avisos.unshift("Falta la copia de GYM-TRACKER: no se importará entreno ni actividad.");
    if (!fit) r.avisos.unshift("Falta la copia de FitCoock: no se importará comida.");
    S.importacion = { tipo: "apps", datos: r, avisos: r.avisos };
  }
  render();
}

async function importar() {
  const d = S.importacion.datos;
  // El tema y la fecha de la última copia son de este uso, no de la copia antigua
  d.ajustes.app = { ...d.ajustes.app, tema: temaActual(), ultimaCopia: S.ajustes.app.ultimaCopia };
  // Al importar las apps antiguas, lo que ya hayas rellenado en tu perfil manda
  if (S.importacion.tipo === "apps")
    Object.entries(S.ajustes.perfil).forEach(([k, v]) => { if (v !== null && v !== undefined) d.ajustes.perfil[k] = v; });
  const existentes = {};
  ["ejercicios", "alimentos", "menus"].forEach(c => existentes[c] = S[c].map(x => x.id));
  ["sesiones", "dias", "diario"].forEach(c => existentes[c] = S[c].map(x => x.fecha));
  const { operaciones, confirmado } = DB.sustituirTodo(S.user.uid, d, existentes);
  S.importacion = null; render();
  toast(`Importando (${operaciones} registros)…`, 4000);
  const r = await Promise.race([confirmado.then(() => "ok"), new Promise(res => setTimeout(() => res("pendiente"), 10000))])
    .catch(e => { toast("Error al importar: " + mensajeError(e), 6000); return "error"; });
  if (r === "ok") toast("Importación completa y sincronizada.");
  if (r === "pendiente") toast("Guardado en este dispositivo. Se sincronizará cuando haya conexión.", 5000);
}

function descargarCopia() {
  descargar(crearCopia(S));
  S.ajustes.app.ultimaCopia = hoyISO();
  DB.guardarAjustes(S.user.uid, S.ajustes).catch(() => {});
  render(); toast("Copia descargada. Guárdala en Drive o en el ordenador.");
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (t) { S.tab = t.dataset.tab; history.replaceState(null, "", "#" + S.tab); render(); window.scrollTo(0, 0); return; }
  const tm = e.target.closest("[data-tema]");
  if (tm) { cambiarTema(tm.dataset.tema); return; }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "salir") DB.salir();
  if (act === "copia") descargarCopia();
  if (act === "importar") importar();
  if (act === "cancelar-imp") { S.importacion = null; render(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "archivos" && e.target.files.length)
    leerArchivos(e.target.files).catch(err => toast(err.message, 5000));
});
document.addEventListener("submit", e => {
  if (e.target.id !== "cuerpo") return;
  e.preventDefault();
  const f = new FormData(e.target), p = S.ajustes.perfil;
  const n = k => { const v = parseFloat(String(f.get(k) || "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };
  p.nacimiento = f.get("nacimiento") || null;
  p.sexo = f.get("sexo") || null;
  p.altura = n("altura");
  p.pesoReferencia = n("pesoReferencia");
  DB.guardarAjustes(S.user.uid, S.ajustes).then(() => {}, err => toast("No se pudo guardar: " + mensajeError(err), 5000));
  render(); toast("Datos guardados.");
});
window.addEventListener("online", () => { S.online = true; if (S.user) render(); });
window.addEventListener("offline", () => { S.online = false; if (S.user) render(); });
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.some(t => t.id === h) && h !== S.tab) { S.tab = h; if (S.user) render(); } });

/* ---------- arranque ---------- */
let pararEscucha = null;
async function arrancar() {
  aplicarTema();
  try { await DB.iniciarFirebase(); }
  catch (e) {
    pantallaLogin("No se pudo cargar Firebase. La primera vez la app necesita conexión a internet.");
    return;
  }
  DB.resultadoRedireccion().catch(e => pantallaLogin(mensajeError(e)));
  DB.alCambiarUsuario(user => {
    if (pararEscucha) { pararEscucha(); pararEscucha = null; }
    if (!user) { S.user = null; pantallaLogin(); return; }
    S.user = user; S.cargado = false; esqueleto(); render();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(v => { S.persistente = v; }).catch(() => {});
    const recibidos = new Set();
    pararEscucha = DB.escuchar(user.uid, (nombre, valor, pendiente) => {
      S.pendiente[nombre] = pendiente;
      if (nombre === "ajustes") {
        S.ajustes = valor || null;
        if (!valor && !recibidos.has("ajustes")) {      // primera vez: ajustes iniciales
          S.ajustes = ajustesPorDefecto(); S.ajustes.app.tema = temaActual();
          DB.guardarAjustes(user.uid, S.ajustes).catch(e => toast(mensajeError(e), 6000));
        }
      } else if (nombre === "compra") S.compra = valor || { items: [], marcados: [] };
      else S[nombre] = valor;
      recibidos.add(nombre);
      S.cargado = recibidos.size >= 8 && !!S.ajustes;
      render();
    }, e => pantallaLogin(mensajeError(e)));
  });
}

/* Service worker: avisa cuando hay versión nueva en vez de cambiarla a escondidas */
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !MODO_LOCAL) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    const avisar = w => {
      const host = $("update"); if (!host) return;
      host.innerHTML = `<div class="toast" style="bottom:auto;top:76px;display:flex;gap:10px;align-items:center">Hay una versión nueva<button class="btn primary" id="actualizar">Actualizar</button></div>`;
      $("actualizar").onclick = () => w.postMessage("activar");
    };
    if (reg.waiting && navigator.serviceWorker.controller) avisar(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) avisar(w); });
    });
  }).catch(() => {});
  let recargado = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!recargado) { recargado = true; location.reload(); } });
}

arrancar();
