/* V.I.T.A. — base de la app: entrada con Google, sincronización, pestañas,
   tema, importación de las copias antiguas y copia de seguridad.
   Cada pestaña vive en su módulo: entreno.js, comida.js, actividad.js
   (Progreso) y resumen.js (Hoy y resumen semanal). */

import { APP_VERSION, ajustesPorDefecto, hoyISO, edadEn } from "./model.js";
import { importarCopias } from "./import.js";
import { crearCopia, esCopiaVita, descargar } from "./backup.js";
import { icon, logo } from "./icons.js";
import * as EN from "./entreno.js";
import * as CO from "./comida.js";
import * as AC from "./actividad.js";
import * as RS from "./resumen.js";
import { pesoEn } from "./actividad-calc.js";
import { BASE } from "./comida-base.js";
import { GOOGLE_CLIENT_ID } from "./config.js";

/* Modo local (solo en localhost con ?local): datos en memoria, sin Firebase.
   Sirve para probar la interfaz; nunca se usa en la app publicada. */
const MODO_LOCAL = location.hostname === "localhost" && new URLSearchParams(location.search).has("local");
const DB = MODO_LOCAL ? await import("./db-local.js") : await import("./db.js");

const S = {
  user: null, ajustes: null, compra: null,
  ejercicios: [], sesiones: [], dias: [], alimentos: [], menus: [], diario: [],
  pendiente: {}, online: navigator.onLine,
  tab: "hoy", importacion: null, persistente: null, cargado: false
};
const TABS = [
  { id: "hoy", label: "Hoy" }, { id: "entreno", label: "Entreno" }, { id: "comida", label: "Comida" },
  { id: "progreso", label: "Progreso" }, { id: "ajustes", label: "Ajustes" }
];
{ const h = location.hash.slice(1); if (TABS.some(t => t.id === h)) S.tab = h; }
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
  S.ajustes.app.tema = t; aplicarTema(); render(true);
  DB.guardarAjustes(S.user.uid, S.ajustes).catch(err => toast("No se pudo guardar el tema: " + err.message));
}

/* ---------- avisos breves ---------- */
let toastT = null;
function toast(msg, ms = 2600, tipo = "") {
  if (!$("toast")) return;
  $("toast").innerHTML = tipo === "rec"
    ? `<div class="toast rec" role="status">${icon("trofeo", 22)}<span>${esc(msg)}</span></div>`
    : `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toastT); toastT = setTimeout(() => { $("toast").innerHTML = ""; }, ms);
}

/* ---------- cálculos que usa la portada ---------- */
const pesoDeCalculo = () => pesoEn(S.dias, S.ajustes.perfil, hoyISO());
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
/* Botón oficial de Google (Google Identity Services): entra sin ventanas
   emergentes ni redirecciones, que en el móvil pueden quedarse colgadas. */
let gisListo = null;
function cargarGIS() {
  if (gisListo) return gisListo;
  gisListo = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: r => DB.entrarConToken(r.credential).catch(e => pantallaLogin(mensajeError(e)))
      });
      res();
    };
    s.onerror = () => { gisListo = null; rej(new Error("No se pudo cargar el botón de Google.")); };
    document.head.appendChild(s);
  });
  return gisListo;
}

function pantallaLogin(error, nota) {
  const conGIS = !!GOOGLE_CLIENT_ID && !MODO_LOCAL;
  document.body.innerHTML = `
  <div class="login">
    ${logo(120)}
    <div class="brand-name">V.I.T.A.</div>
    <p>Entreno, comida y actividad en un solo sitio, sincronizado entre el móvil y el ordenador.</p>
    ${conGIS ? `<div id="gbtn" class="gbtn"></div>` : ""}
    <button class="btn ${conGIS ? "" : "primary"}" id="entrar">${conGIS ? "Otra forma: ventana de Google" : "Entrar con Google"}</button>
    ${error ? `<p class="err">${esc(error)}</p>` : ""}
    ${nota ? `<p class="muted">${esc(nota)}</p>` : ""}
    <p class="muted">v${APP_VERSION}${MODO_LOCAL ? " · modo local de prueba" : ""}</p>
  </div>
  <div id="update"></div>
  <div id="toast"></div>`;
  pintarAvisoVersion();
  if (conGIS) cargarGIS().then(() => {
    const host = $("gbtn"); if (!host) return;
    window.google.accounts.id.renderButton(host, {
      type: "standard", theme: temaActual() === "claro" ? "outline" : "filled_black",
      size: "large", text: "continue_with", shape: "pill", locale: "es", width: 280
    });
  }).catch(e => { const h = $("gbtn"); if (h) h.innerHTML = `<p class="err">${esc(e.message)}</p>`; });

  $("entrar").onclick = async () => {
    const b = $("entrar"); b.disabled = true;
    // Si vuelves de la ventana de Google y no ha entrado en unos segundos,
    // se libera el botón en vez de dejarlo pulsado sin hacer nada.
    const vigia = () => {
      if (document.hidden) return;
      setTimeout(() => {
        if (S.user || !$("entrar") || !$("entrar").disabled) return;
        document.removeEventListener("visibilitychange", vigia);
        pantallaLogin(null, conGIS
          ? "La ventana de Google no ha devuelto el control. Usa el botón «Continuar con Google» de arriba."
          : "La ventana de Google no ha devuelto el control. Vuelve a intentarlo; si se repite, avísame qué navegador usas.");
      }, 6000);
    };
    document.addEventListener("visibilitychange", vigia);
    try { await DB.entrar(); }
    catch (e) { document.removeEventListener("visibilitychange", vigia); pantallaLogin(mensajeError(e)); }
  };
}
function mensajeError(e) {
  const c = e && e.code;
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return "Has cerrado la ventana de Google antes de terminar.";
  if (c === "auth/unauthorized-domain") return "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).";
  if (c === "auth/network-request-failed") return "No hay conexión. La primera entrada necesita internet.";
  if (c === "permission-denied") return "Firebase ha rechazado el acceso. Revisa que entras con tu cuenta y que las reglas de Firestore están publicadas.";
  if (c === "auth/invalid-credential") return "Google ha dado un acceso que Firebase no acepta. Revisa que el ID de cliente web es el del proyecto vita-75aab.";
  return ((e && e.message) || "Error desconocido") + (c ? ` (${c})` : "");
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
  <div id="rest"></div>
  <div id="hoja"></div>
  <div id="update"></div>
  <div id="toast"></div>`;
  $("tema").onclick = () => cambiarTema(temaActual() === "claro" ? "oscuro" : "claro");
  pintarAvisoVersion();
}

/* Mientras escribes en un campo de la pantalla, los repintados que llegan de
   la sincronización esperan a que salgas del campo, para no perder el foco. */
let renderPendiente = false;
function escribiendo() {
  const a = document.activeElement;
  return !!(a && a.closest && a.closest("#main") && (a.matches("textarea, select") ||
    (a.matches("input") && !["checkbox", "radio", "date", "file", "submit", "button"].includes(a.type))));
}
document.addEventListener("focusout", () => setTimeout(() => {
  if (renderPendiente && !escribiendo()) render(true);
}, 0));

/* Apartados plegables: cada tarjeta con título se pliega tocando el título.
   Se recuerda en este dispositivo (el móvil y el ordenador pueden tener
   distinto gusto). data-plegada="1" = plegada por defecto. */
let plegado = {};
try { plegado = JSON.parse(localStorage.getItem("vita:plegado") || "{}") || {}; } catch { plegado = {}; }
function aplicarPlegables() {
  document.querySelectorAll("#main .card:not(.accent)").forEach(card => {
    const t = card.firstElementChild;
    if (!t || !t.classList.contains("card-title")) return;
    const clave = S.tab + ":" + (card.dataset.sec || t.textContent.trim());
    const cerrada = clave in plegado ? plegado[clave] : card.dataset.plegada === "1";
    card.dataset.clave = clave;
    card.classList.add("plegable");
    card.classList.toggle("plegada", cerrada);
    t.setAttribute("role", "button"); t.tabIndex = 0;
    t.setAttribute("aria-expanded", String(!cerrada));
  });
}
function alternarPlegable(t) {
  const card = t.parentElement, cerrada = !card.classList.contains("plegada");
  card.classList.toggle("plegada", cerrada);
  t.setAttribute("aria-expanded", String(!cerrada));
  plegado[card.dataset.clave] = cerrada;
  try { localStorage.setItem("vita:plegado", JSON.stringify(plegado)); } catch {}
}
document.addEventListener("keydown", e => {
  const t = e.target.closest && e.target.closest(".plegable > .card-title");
  if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alternarPlegable(t); }
});

/* Si la app sigue abierta al pasar la medianoche, las pantallas que estaban
   en «hoy» pasan al día nuevo en vez de quedarse en el de ayer. */
let ultimoHoy = hoyISO();
function comprobarDia() {
  const hoy = hoyISO();
  if (hoy === ultimoHoy) return false;
  [EN, CO, AC].forEach(m => m.nuevoDia(ultimoHoy, hoy));
  ultimoHoy = hoy;
  return true;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.cargado && comprobarDia()) render(true); });

/* Con el teclado del móvil abierto, las hojas inferiores suben por encima de él
   (Chrome en Android no redimensiona la página al abrir el teclado). */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const ajustarTeclado = () => {
    const k = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--teclado", (k > 80 ? Math.round(k) : 0) + "px");
  };
  vv.addEventListener("resize", ajustarTeclado); vv.addEventListener("scroll", ajustarTeclado);
}

function render(forzar = false) {
  if (!forzar && S.cargado && escribiendo()) { renderPendiente = true; return; }
  comprobarDia();
  renderPendiente = false;
  if (!$("main")) esqueleto();
  aplicarTema();
  const sy = estadoSync();
  $("sync").innerHTML = `${icon(sy.ico, 16, sy.col)}${sy.txt}`;
  $("tema").innerHTML = icon(temaActual() === "claro" ? "luna" : "sol", 20);
  $("tabs").innerHTML = TABS.map(t => `<button class="tab" data-tab="${t.id}" ${S.tab === t.id ? 'aria-current="page"' : ""}>${icon(t.id, 24)}<span>${t.label}</span></button>`).join("");
  const vista = { hoy: vHoy, entreno: vEntreno, comida: vComida, progreso: vProgreso, ajustes: vAjustes }[S.tab] || vHoy;
  $("main").innerHTML = S.cargado ? vista() : `<div class="card"><p class="muted" style="margin:0">Cargando tus datos…</p></div>`;
  aplicarPlegables();
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
  out.push(RS.tarjetasHoy());
  return out.join("");
}

const vEntreno = () => EN.vista();
const vComida = () => CO.vista();
const vProgreso = () => AC.vista();

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
  ${CO.vAjustes()}
  ${AC.vAjustes()}
  ${EN.vAjustes()}
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
  S.importacion = null; render(true);
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
  render(true); toast("Copia descargada. Guárdala en Drive o en el ordenador.");
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (t) { EN.guardarYa(); S.tab = t.dataset.tab; history.replaceState(null, "", "#" + S.tab); render(true); window.scrollTo(0, 0); return; }
  const pl = e.target.closest(".plegable > .card-title");
  if (pl) { alternarPlegable(pl); return; }
  if (S.cargado && EN.click(e)) return;
  if (S.cargado && CO.click(e)) return;
  if (S.cargado && AC.click(e)) return;
  if (S.cargado && RS.click(e)) return;
  const tm = e.target.closest("[data-tema]");
  if (tm) { cambiarTema(tm.dataset.tema); return; }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "salir") { EN.guardarYa(); DB.salir(); }
  if (act === "copia") descargarCopia();
  if (act === "importar") importar();
  if (act === "cancelar-imp") { S.importacion = null; render(true); }
});
document.addEventListener("input", e => { if (S.cargado && !EN.input(e.target)) CO.input(e.target); });
document.addEventListener("change", e => {
  if (S.cargado && EN.change(e.target)) return;
  if (S.cargado && CO.change(e.target)) return;
  if (S.cargado && AC.change(e.target)) return;
  if (e.target.id === "archivos" && e.target.files.length)
    leerArchivos(e.target.files).catch(err => toast(err.message, 5000));
});
document.addEventListener("submit", e => {
  if (S.cargado && (EN.submit(e.target) || CO.submit(e.target) || AC.submit(e.target))) { e.preventDefault(); return; }
  if (e.target.id !== "cuerpo") return;
  e.preventDefault();
  const f = new FormData(e.target), p = S.ajustes.perfil;
  const n = k => { const v = parseFloat(String(f.get(k) || "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };
  p.nacimiento = f.get("nacimiento") || null;
  p.sexo = f.get("sexo") || null;
  p.altura = n("altura");
  p.pesoReferencia = n("pesoReferencia");
  DB.guardarAjustes(S.user.uid, S.ajustes).then(() => {}, err => toast("No se pudo guardar: " + mensajeError(err), 5000));
  render(true); toast("Datos guardados.");
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
  DB.resultadoRedireccion().catch(e => { if (!S.user) pantallaLogin(mensajeError(e)); });
  DB.alCambiarUsuario(user => {
    if (pararEscucha) { pararEscucha(); pararEscucha = null; }
    if (!user) { S.user = null; pantallaLogin(); return; }
    S.user = user; S.cargado = false; esqueleto(); render();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(v => { S.persistente = v; }).catch(() => {});
    const recibidos = new Set(), delServidor = new Set();
    let baseHecha = false;
    pararEscucha = DB.escuchar(user.uid, (nombre, valor, pendiente, desdeCache) => {
      S.pendiente[nombre] = pendiente;
      if (!desdeCache) delServidor.add(nombre);
      if (nombre === "ajustes") {
        S.ajustes = valor || null;
        // 0.2.1: los rangos pasan a ser solo desde–hasta; se limpian los de antes
        const rg = S.ajustes && S.ajustes.entreno && S.ajustes.entreno.rangos;
        if (rg && Object.values(rg).some(x => x && ("mev" in x || "mrv" in x))) {
          Object.keys(rg).forEach(g => { if (rg[g]) rg[g] = { min: rg[g].min, max: rg[g].max }; });
          DB.guardarAjustes(user.uid, S.ajustes).catch(() => {});
        }
        // Primera vez de verdad (el servidor confirma que no hay ajustes): ajustes iniciales.
        // Si el aviso viene de la caché del dispositivo, se espera al servidor.
        if (!valor && !recibidos.has("ajustes") && !desdeCache) {
          S.ajustes = ajustesPorDefecto(); S.ajustes.app.tema = temaActual();
          DB.guardarAjustes(user.uid, S.ajustes).catch(e => toast(mensajeError(e), 6000));
        }
      } else if (nombre === "compra") S.compra = valor || { items: [], marcados: [] };
      else if (nombre === "sesiones" && EN.editando()) { /* hay una serie sin guardar: llegará en el siguiente aviso */ }
      else S[nombre] = valor;
      recibidos.add(nombre);
      S.cargado = recibidos.size >= 8 && !!S.ajustes;
      // Alimentos base nuevos: solo con los datos ya confirmados por el servidor
      if (!baseHecha && S.cargado && delServidor.has("alimentos") && delServidor.has("ajustes")) {
        baseHecha = true;
        const n = CO.sincronizarBase();
        if (n) toast(`${n} alimentos base nuevos añadidos.`);
      }
      render();
    }, e => pantallaLogin(mensajeError(e)));
  });
}

/* Service worker y versiones nuevas:
   - Al abrir la app, si ya hay una versión nueva descargada, se aplica sola
     (lo hace también index.html, que siempre llega fresco de la red).
   - Si la versión nueva llega con la app abierta, aparece «Actualizar» y el
     aviso se mantiene aunque cambies de pestaña o se repinte la pantalla. */
let swNuevo = null;
function pintarAvisoVersion() {
  const host = $("update"); if (!host) return;
  host.innerHTML = swNuevo ? `<div class="aviso-version" role="status">${icon("sync", 20, "var(--acc)")}<span>Hay una versión nueva de V.I.T.A.</span><button class="btn primary sm" id="actualizar">Actualizar</button></div>` : "";
  const b = $("actualizar");
  if (b) b.onclick = () => { EN.guardarYa(); b.disabled = true; swNuevo.postMessage("activar"); };
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !MODO_LOCAL) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) { reg.waiting.postMessage("activar"); return; }
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) { swNuevo = w; pintarAvisoVersion(); }
      });
    });
    // Una PWA puede quedarse abierta días: al volver a ella, se busca versión nueva
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  // Solo se recarga si ya había una versión controlando la página: la primera
  // instalación (dispositivo nuevo) no debe recargar en mitad del inicio de sesión.
  let recargado = false;
  const habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habiaControlador && !recargado) { recargado = true; location.reload(); } });
}

EN.init({ S, DB, render: () => render(true), toast, esc, nf, fecha, icon, mensajeError });
AC.init({ S, DB, render: () => render(true), toast, esc, nf, fecha, icon, mensajeError, confirmar: (...a) => CO.confirmar(...a), vSemana: () => RS.vSemana() });
RS.init({ S, render: () => render(true), toast, esc, fecha, icon,
  irA: tab => { if (tab === "progreso") AC.irHoy(); S.tab = tab; history.replaceState(null, "", "#" + tab); render(true); window.scrollTo(0, 0); } });
CO.init({ S, DB, render: () => render(true), toast, esc, nf, fecha, icon, mensajeError,
  peso: () => S.ajustes ? pesoDeCalculo().valor : null,
  baseTotal: BASE.length,
  reponerBase: () => { const n = CO.sincronizarBase(true); toast(n ? `${n} alimentos base repuestos.` : "Ya tienes todos los alimentos base."); render(true); } });
arrancar();
