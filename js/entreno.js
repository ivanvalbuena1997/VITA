/* V.I.T.A. — módulo de Entreno: registrar, progresión, volumen e historial.
   Las sesiones se guardan una por fecha en Firestore (sesiones/{fecha}).
   Mientras escribes una serie, los cambios se guardan con un pequeño retraso
   y las actualizaciones que llegan de la nube no pisan lo que estás tecleando. */

import { GRUPOS, hoyISO, toISO } from "./model.js";
import { notaVolumen, OPCIONALES } from "./semana-calc.js";

let C = null;                      // contexto que pasa app.js
export function init(ctx) { C = ctx; }

/* ---------- estado de la pantalla ---------- */
const E = {
  sub: "registrar", fecha: hoyISO(), picker: false, q: "", creando: false, editandoEj: null, confirmEj: null,
  copiando: false, plegados: new Set(), progRango: "6m", progEj: null, punto: null,
  volRango: "6m", semana: null, anios: new Set([String(new Date().getFullYear())]),
  meses: new Set([hoyISO().slice(0, 7)]), abierta: null, confirmBorrar: null, confirmTodo: false
};

/* ---------- utilidades ---------- */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const parseISO = iso => new Date(iso + "T00:00:00");
const diaSemana = iso => DIAS[parseISO(iso).getDay()];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { if (v === null || v === undefined || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : null; };
const fmtNum = n => n === null || n === undefined ? "" : String(n).replace(".", ",");
const completa = st => st.peso !== null && st.peso !== undefined && st.reps !== null && st.reps !== undefined;
export const e1rm = (p, r) => (!p || !r || r > 12) ? 0 : p * (1 + r / 30);
const lunesDe = iso => { const d = parseISO(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); };
const haceMeses = m => { if (m === null) return null; const d = new Date(); d.setMonth(d.getMonth() - m); return toISO(d); };
const RANGOS = { "1m": 1, "6m": 6, "1y": 12, "all": null };
const RANGO_TXT = { "1m": "1 mes", "6m": "6 meses", "1y": "1 año", "all": "Todo" };
const grupoPrincipal = e => Object.keys(e.grupos || {})[0] || "Otros";
// Prioritarios ×1,5 y opcionales (solo si se entrenan): ver semana-calc.js
const COLORES = {
  "Pecho": "#FF7A90", "Dorsal": "#4D8BFF", "Espalda media": "#3FE0FF", "Hombro anterior": "#FFB547",
  "Hombro lateral": "#FFD24D", "Hombro posterior": "#FF9F43", "Bíceps": "#B8FF5A", "Tríceps": "#FF6BD6",
  "Antebrazo": "#E0E07A", "Cuádriceps": "#8F9CFF", "Femoral/Glúteo": "#C38CFF", "Gemelos": "#6EE7A8", "Core": "#9DBDC7"
};

/* Color de grupo: etiqueta rellena y franja lateral (con varios grupos, a tramos) */
const colorDe = g => COLORES[g] || "#9DBDC7";
const tag = g => `<span class="tag" style="--c:${colorDe(g)}">${C.esc(g)}</span>`;
function franja(grupos) {
  const gs = Object.keys(grupos || {}); if (!gs.length) return "";
  const paso = 100 / gs.length;
  return `--franja:linear-gradient(to bottom,${gs.map((g, k) => `${colorDe(g)} ${(k * paso).toFixed(2)}% ${((k + 1) * paso).toFixed(2)}%`).join(",")})`;
}

const sesiones = () => C.S.sesiones;
const sesionDe = f => sesiones().find(s => s.fecha === f) || null;
const ejercicioDe = id => C.S.ejercicios.find(e => e.id === id) || null;

/* Mejor marca de un ejercicio antes de una fecha (sin contarla) */
function mejorPrevio(ejId, antesDe) {
  let best = { e1: 0, peso: 0, reps: 0, fecha: null, pMax: 0 };
  sesiones().forEach(s => {
    if (antesDe && s.fecha >= antesDe) return;
    s.ejercicios.forEach(e => {
      if (e.ejercicioId !== ejId) return;
      e.series.forEach(st => {
        if (!completa(st) || !st.peso || !st.reps) return;
        const v = e1rm(st.peso, st.reps);
        if (v > best.e1) Object.assign(best, { e1: v, peso: st.peso, reps: st.reps, fecha: s.fecha });
        if (st.peso > best.pMax) best.pMax = st.peso;
      });
    });
  });
  return best;
}
/* La sesión donde mejor hiciste un ejercicio (por 1RM estimado; si no hay, por peso) */
function mejorEntrada(ejId) {
  let mejor = null, val = 0;
  sesiones().forEach(s => s.ejercicios.forEach(e => {
    if (e.ejercicioId !== ejId) return;
    let v = Math.max(0, ...e.series.filter(completa).map(st => e1rm(st.peso, st.reps)));
    if (!v) v = Math.max(0, ...e.series.filter(completa).map(st => st.peso || 0));
    if (v > val) { val = v; mejor = e; }
  }));
  return mejor;
}
/* Última sesión anterior en el mismo día de la semana, para los números en gris */
function anteriorMismoDia(fecha) {
  const d = parseISO(fecha).getDay();
  return sesiones().filter(s => s.fecha < fecha && parseISO(s.fecha).getDay() === d)
    .sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0] || null;
}

/* ---------- guardado ---------- */
let tGuardar = null, pendiente = null;
export const editando = () => pendiente !== null;
function programarGuardado(ses, inmediato) {
  pendiente = ses;
  clearTimeout(tGuardar);
  if (inmediato) return guardarYa();
  tGuardar = setTimeout(guardarYa, 500);
}
export function guardarYa() {
  clearTimeout(tGuardar);
  if (!pendiente) return;
  const s = pendiente; pendiente = null;
  const vacia = s.ejercicios.length === 0;
  const op = vacia ? C.DB.borrarDoc(C.S.user.uid, "sesiones", s.fecha) : C.DB.guardarDoc(C.S.user.uid, "sesiones", s.fecha, limpia(s));
  op.catch(err => C.toast("No se pudo guardar la sesión: " + C.mensajeError(err), 6000));
}
const limpia = s => JSON.parse(JSON.stringify(s));
document.addEventListener("visibilitychange", () => { if (document.hidden) guardarYa(); });
window.addEventListener("pagehide", guardarYa);

/* Modifica (o crea) la sesión de la fecha elegida y la guarda */
function conSesion(fn, inmediato = true) {
  let s = sesionDe(E.fecha);
  if (!s) { s = { fecha: E.fecha, ejercicios: [] }; C.S.sesiones.push(s); }
  fn(s);
  if (s.ejercicios.length === 0) C.S.sesiones = sesiones().filter(x => x !== s);
  programarGuardado(s, inmediato);
}

/* ---------- temporizador de descanso ---------- */
let rest = null, restTick = null, audio = null, wake = null;
function desbloquearAudio() {
  try {
    if (!audio) { const A = window.AudioContext || window.webkitAudioContext; if (A) audio = new A(); }
    if (audio && audio.state === "suspended") audio.resume();
  } catch {}
}
document.addEventListener("pointerdown", desbloquearAudio);
export function pitido() {
  try {
    if (!audio || C.S.ajustes.entreno.sonido === false) return;
    const t0 = audio.currentTime;
    [[0, 660], [0.22, 880], [0.44, 1100]].forEach(([o, f]) => {
      const osc = audio.createOscillator(), g = audio.createGain();
      osc.type = "triangle"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + o); g.gain.exponentialRampToValueAtTime(0.6, t0 + o + 0.02);
      g.gain.setValueAtTime(0.6, t0 + o + 0.14); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o + 0.2);
      osc.connect(g); g.connect(audio.destination); osc.start(t0 + o); osc.stop(t0 + o + 0.22);
    });
  } catch {}
}
async function pantallaEncendida(on) {
  try {
    if (on && "wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); }
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch {}
}
function iniciarDescanso(etiqueta) {
  const seg = Math.round((C.S.ajustes.entreno.descansoMin ?? 2) * 60);
  if (seg <= 0) return;
  rest = { fin: Date.now() + seg * 1000, total: seg, etiqueta, hecho: false };
  clearInterval(restTick); restTick = setInterval(tick, 250);
  desbloquearAudio(); pantallaEncendida(true); pintarDescanso();
}
function pararDescanso() { rest = null; clearInterval(restTick); pantallaEncendida(false); pintarDescanso(); }
const restante = () => rest ? Math.max(0, Math.round((rest.fin - Date.now()) / 1000)) : 0;
function tick() {
  if (!rest) return;
  if (restante() <= 0 && !rest.hecho) {
    rest.hecho = true; pitido(); pantallaEncendida(false);
    setTimeout(() => { if (rest && rest.hecho) pararDescanso(); }, 12000);
  }
  pintarDescanso();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && rest && !rest.hecho) pantallaEncendida(true); });
function pintarDescanso() {
  const host = document.getElementById("rest"); if (!host) return;
  if (!rest) { host.innerHTML = ""; return; }
  const left = restante(), pct = rest.total ? (1 - left / rest.total) * 100 : 100;
  const reloj = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  host.innerHTML = `<div class="rest ${rest.hecho ? "done" : ""}" role="timer" aria-live="off">
    <div class="rest-row">${C.icon("reloj", 22, "var(--acc)")}
      <span class="rest-time">${rest.hecho ? "¡Ya!" : reloj}</span>
      <span class="rest-lbl">${rest.hecho ? "Descanso terminado" : "Descanso"} · ${C.esc(rest.etiqueta)}</span>
      ${rest.hecho ? "" : `<button class="btn sm" data-rest="mas">+30 s</button>`}
      <button class="icon-btn sm" data-rest="saltar" aria-label="Cerrar descanso">${C.icon("cerrar", 18)}</button>
    </div>
    <div class="bar"><div style="width:${pct}%"></div></div></div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-rest]"); if (!b) return;
  if (b.dataset.rest === "mas" && rest) { rest.fin += 30000; rest.hecho = false; pintarDescanso(); }
  if (b.dataset.rest === "saltar") pararDescanso();
});

/* ---------- vista principal ---------- */
export function vista() {
  const subs = [["registrar", "Registrar"], ["progresion", "Progresión"], ["volumen", "Volumen"], ["historial", "Historial"]];
  const cuerpo = { registrar: vRegistrar, progresion: vProgresion, volumen: vVolumen, historial: vHistorial }[E.sub]();
  return `<div class="label">Entreno</div>
  <div class="seg seg4" role="tablist">${subs.map(([k, n]) => `<button data-esub="${k}" aria-pressed="${E.sub === k}">${n}</button>`).join("")}</div>
  ${cuerpo}`;
}

/* ---------- registrar ---------- */
function vRegistrar() {
  const s = sesionDe(E.fecha);
  const ents = s ? s.ejercicios : [];
  const prev = anteriorMismoDia(E.fecha);
  const total = ents.reduce((a, e) => a + e.series.length, 0);
  const hechas = ents.reduce((a, e) => a + e.series.filter(completa).length, 0);
  const vol = ents.reduce((a, e) => a + e.series.reduce((t, st) => t + (completa(st) ? st.peso * st.reps : 0), 0), 0);
  const hayOtras = sesiones().some(x => x.fecha !== E.fecha && x.ejercicios.length);
  return `
  <div class="card">
    <div class="fecha-row">
      <label class="campo" style="flex:1">Fecha<input type="date" id="e-fecha" value="${E.fecha}" max="${hoyISO()}"></label>
      <div class="chip">${diaSemana(E.fecha)}</div>
    </div>
    ${ents.length ? `<div class="grid3" id="e-resumen">
      <div class="stat"><b>${hechas}<small>/${total}</small></b><span>series</span></div>
      <div class="stat"><b>${C.nf(Math.round(vol))}</b><span>kg volumen</span></div>
      <div class="stat"><b>${ents.length}</b><span>ejercicios</span></div></div>` : ""}
    ${s && s.copiadaDe ? `<p class="muted" style="margin:0">Copiada del ${C.esc(C.fecha(s.copiadaDe))}. Los números en gris son tu mejor marca de cada ejercicio.</p>` : ""}
    ${!ents.length && hayOtras ? `<div class="btn-row"><button class="btn" data-e="copiar-abrir">${C.icon("copiar", 18)}Copiar una sesión anterior</button></div>` : ""}
    ${ents.length > 1 ? (() => { const todos = ents.every(e => E.plegados.has(e.ejercicioId));
      return `<div class="btn-row"><button class="btn sm" data-e="plegar-todos">${C.icon(todos ? "abajo" : "arriba", 16)}${todos ? "Desplegar ejercicios" : "Plegar ejercicios"}</button></div>`; })() : ""}
  </div>
  ${E.copiando ? vCopiar() : ""}
  ${ents.map((e, i) => vEjercicio(s, e, i, ents.length, prev)).join("")}
  ${!ents.length && !E.picker && !E.copiando ? `<div class="card vacio">${C.icon("entreno", 32, "var(--mute)")}<p>Sin ejercicios el ${C.esc(C.fecha(E.fecha))}.</p></div>` : ""}
  ${E.picker ? vPicker() : `<button class="btn dashed" data-e="picker">${C.icon("mas", 18)}Añadir ejercicio</button>`}
  <div class="card" data-sec="criterios" data-plegada="1"><p class="card-title">Criterios de registro</p>
    <ul class="list">${(C.S.ajustes.entreno.criterios || []).map(c => `<li>${C.esc(c)}</li>`).join("")}</ul>
    <p class="muted" style="margin:0">Se editan en Ajustes.</p></div>`;
}

function vEjercicio(s, e, i, n, prev) {
  const hechas = e.series.filter(completa).length;
  const abierto = !E.plegados.has(e.ejercicioId);
  const ref = mejorPrevio(e.ejercicioId, s.fecha);
  const prevE = prev ? prev.ejercicios.find(x => x.ejercicioId === e.ejercicioId) : null;
  const grupos = Object.keys(e.grupos || {});
  return `<div class="card ej franja" style="${franja(e.grupos)}">
    <div class="ej-head">
      <button class="ej-tit" data-e="plegar" data-id="${e.ejercicioId}" aria-expanded="${abierto}">
        <span class="ej-nombre">${C.esc(e.nombre)}</span>
        <span class="tags">${grupos.map(tag).join("")}${e.unilateral ? `<span class="tag line">×2 unilateral</span>` : ""}</span>
      </button>
      <span class="ej-count mono">${hechas}/${e.series.length}</span>
      <button class="chev ${abierto ? "" : "cerrado"}" data-e="plegar" data-id="${e.ejercicioId}" aria-label="${abierto ? "Plegar" : "Desplegar"} ${C.esc(e.nombre)}"></button>
    </div>
    ${abierto ? `<div class="series">
      ${e.series.map((st, j) => {
        const rec = completa(st) && ref.e1 > 0 && e1rm(st.peso, st.reps) > ref.e1 * 1.001;
        const ph = prevE && prevE.series[j];
        const phP = st.sugPeso ?? (ph ? ph.peso : null), phR = st.sugReps ?? (ph ? ph.reps : null);
        return `<div class="serie ${completa(st) ? "ok" : ""} ${rec ? "rec" : ""}">
          <span class="serie-n mono">${j + 1}</span>
          <label class="sr-only" for="p-${i}-${j}">Peso serie ${j + 1}</label>
          <input id="p-${i}-${j}" class="num" inputmode="decimal" autocomplete="off" data-set="${i}:${j}:peso" value="${fmtNum(st.peso)}" placeholder="${phP != null ? fmtNum(phP) : "kg"}">
          <span class="x">kg ×</span>
          <label class="sr-only" for="r-${i}-${j}">Repeticiones serie ${j + 1}</label>
          <input id="r-${i}-${j}" class="num" inputmode="numeric" autocomplete="off" data-set="${i}:${j}:reps" value="${fmtNum(st.reps)}" placeholder="${phR != null ? fmtNum(phR) : "reps"}">
          ${rec ? `<span class="badge-rec">${C.icon("trofeo", 14)}RÉCORD</span>` : ""}
          <button class="icon-btn sm" data-e="quitar-serie" data-i="${i}" data-j="${j}" aria-label="Quitar serie ${j + 1}">${C.icon("cerrar", 16)}</button>
        </div>`;
      }).join("")}
      <div class="ej-actions">
        <button class="btn sm" data-e="mas-serie" data-i="${i}">${C.icon("mas", 16)}Serie</button>
        <span style="flex:1"></span>
        <button class="icon-btn sm" data-e="subir" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Subir ejercicio">${C.icon("arriba", 18)}</button>
        <button class="icon-btn sm" data-e="bajar" data-i="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="Bajar ejercicio">${C.icon("abajo", 18)}</button>
        <button class="icon-btn sm danger" data-e="quitar-ej" data-i="${i}" aria-label="Quitar ejercicio de la sesión">${C.icon("papelera", 18)}</button>
      </div>
    </div>` : ""}
  </div>`;
}

function vCopiar() {
  const dn = parseISO(E.fecha).getDay();
  const cands = sesiones().filter(x => x.fecha !== E.fecha && x.ejercicios.length).sort((a, b) => a.fecha < b.fecha ? 1 : -1);
  const mismos = cands.filter(x => parseISO(x.fecha).getDay() === dn).slice(0, 6);
  const otros = cands.filter(x => parseISO(x.fecha).getDay() !== dn).slice(0, 6);
  const item = x => {
    const porG = {};
    x.ejercicios.forEach(e => Object.keys(e.grupos || {}).forEach(g => porG[g] = (porG[g] || 0) + e.series.length));
    const gs = Object.entries(porG).sort((a, b) => b[1] - a[1]).slice(0, 4).map(g => g[0]);
    return `<button class="item" data-e="copiar" data-f="${x.fecha}">
      <span class="item-main"><b>${C.esc(C.fecha(x.fecha))}</b><span class="muted">${x.ejercicios.length} ejercicios · ${x.ejercicios.reduce((a, e) => a + e.series.length, 0)} series</span></span>
      <span class="tags">${gs.map(tag).join("")}</span></button>`;
  };
  return `<div class="card accent"><p class="card-title">Copiar una sesión</p>
    <p class="muted" style="margin:0">De cada ejercicio se copia tu mejor sesión: mismas series, con sus pesos y repeticiones en gris como marca a batir.</p>
    ${mismos.length ? `<div class="sub-label">Otros ${diaSemana(E.fecha)}</div>${mismos.map(item).join("")}` : ""}
    ${otros.length ? `<div class="sub-label">Más recientes</div>${otros.map(item).join("")}` : ""}
    <div class="btn-row"><button class="btn" data-e="copiar-cerrar">Cancelar</button></div></div>`;
}

function vPicker() {
  if (E.creando || E.editandoEj) {
    const ej = E.editandoEj ? ejercicioDe(E.editandoEj) : null;
    const gs = ej ? Object.keys(ej.grupos || {}) : [];
    return `<form class="card accent" id="form-ej"><p class="card-title">${ej ? "Editar ejercicio" : "Ejercicio nuevo"}</p>
      <label class="campo">Nombre<input name="nombre" required value="${C.esc(ej ? ej.nombre : E.q)}"></label>
      <fieldset class="grupos"><legend class="campo">Grupos que trabaja (cada serie cuenta entera en cada grupo marcado)</legend>
        ${GRUPOS.map(g => `<label class="check"><input type="checkbox" name="g" value="${g}" ${gs.includes(g) ? "checked" : ""}><span>${g}</span></label>`).join("")}
      </fieldset>
      <label class="check"><input type="checkbox" name="uni" ${ej && ej.unilateral ? "checked" : ""}><span>Unilateral (se hace lado a lado)</span></label>
      <div class="btn-row"><button class="btn primary" type="submit">${ej ? "Guardar cambios" : "Añadir a la sesión"}</button>
      <button class="btn" type="button" data-e="form-cancelar">Cancelar</button></div></form>`;
  }
  const q = E.q.toLowerCase();
  const lista = C.S.ejercicios.filter(e => e.nombre.toLowerCase().includes(q) || Object.keys(e.grupos || {}).some(g => g.toLowerCase().includes(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return `<div class="card accent"><p class="card-title">Añadir ejercicio</p>
    <input class="buscar" id="e-buscar" placeholder="Buscar por nombre o grupo" value="${C.esc(E.q)}" autocomplete="off" aria-label="Buscar ejercicio">
    <div class="lista">${lista.map(e => E.confirmEj === e.id ? `
      <div class="item confirm"><span>¿Eliminar «${C.esc(e.nombre)}» del catálogo? Tus sesiones antiguas lo conservan.</span>
        <span class="btn-row"><button class="btn danger sm" data-e="borrar-ej" data-id="${e.id}">Eliminar</button><button class="btn sm" data-e="no-borrar-ej">Cancelar</button></span></div>` : `
      <div class="item franja" style="${franja(e.grupos)}">
        <button class="item-main pick" data-e="elegir" data-id="${e.id}"><b>${C.esc(e.nombre)}</b>
          <span class="tags">${Object.keys(e.grupos || {}).map(tag).join("")}${e.unilateral ? `<span class="tag line">×2</span>` : ""}</span></button>
        <button class="icon-btn sm" data-e="editar-ej" data-id="${e.id}" aria-label="Editar ${C.esc(e.nombre)}">${C.icon("lapiz", 16)}</button>
        <button class="icon-btn sm danger" data-e="pedir-borrar-ej" data-id="${e.id}" aria-label="Eliminar ${C.esc(e.nombre)}">${C.icon("papelera", 16)}</button>
      </div>`).join("") || `<p class="muted">Sin coincidencias.</p>`}</div>
    <div class="btn-row"><button class="btn" data-e="crear">${C.icon("mas", 16)}Crear ejercicio nuevo</button><button class="btn" data-e="picker-cerrar">Cerrar</button></div></div>`;
}

/* ---------- progresión ---------- */
function selectorRango(id, actual) {
  return `<div class="seg seg4">${Object.keys(RANGOS).map(r => `<button data-rango="${id}:${r}" aria-pressed="${actual === r}">${RANGO_TXT[r]}</button>`).join("")}</div>`;
}
function vProgresion() {
  const desde = haceMeses(RANGOS[E.progRango]);
  const enRango = sesiones().filter(s => !desde || s.fecha >= desde).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const ids = new Set(); enRango.forEach(s => s.ejercicios.forEach(e => { if (e.series.some(completa)) ids.add(e.ejercicioId); }));
  if (!ids.size) return selectorRango("prog", E.progRango) + `<div class="card vacio"><p>No hay series en este periodo.</p></div>`;
  if (!E.progEj || !ids.has(E.progEj)) E.progEj = [...ids][0];
  const nombre = (ejercicioDe(E.progEj) || {}).nombre || buscarNombre(E.progEj);
  const pts = enRango.map(s => {
    const e = s.ejercicios.find(x => x.ejercicioId === E.progEj); if (!e) return null;
    const ok = e.series.filter(completa); if (!ok.length) return null;
    return { f: s.fecha, a: Math.max(...ok.map(x => x.peso)), b: Math.round(ok.reduce((t, x) => t + x.peso * x.reps, 0)) };
  }).filter(Boolean);
  const b = mejorPrevio(E.progEj, null);
  return selectorRango("prog", E.progRango) + `
  <div class="card" data-sec="records-ej"><p class="card-title">Récords · ${C.esc(nombre)}</p>
    <div class="grid3">
      <div class="stat"><b>${b.pMax ? C.nf(b.pMax, b.pMax % 1 ? 1 : 0) : "—"}</b><span>kg peso máximo</span></div>
      <div class="stat"><b class="acc">${b.e1 ? C.nf(Math.round(b.e1)) : "—"}</b><span>kg 1RM estimado</span></div>
      <div class="stat"><b>${b.fecha ? `${fmtNum(b.peso)}×${b.reps}` : "—"}</b><span>${b.fecha ? C.esc(C.fecha(b.fecha)) : "mejor serie"}</span></div>
    </div>
    <p class="muted" style="margin:0">1RM estimado con la fórmula de Epley, solo con series de hasta 12 repeticiones.</p></div>
  ${pts.length >= 2 ? `<div class="card" data-sec="evolucion"><p class="card-title">Evolución · ${C.esc(nombre)}</p>${grafLinea(pts)}</div>`
    : `<div class="card vacio"><p>Hacen falta al menos 2 sesiones de este ejercicio en el periodo para ver la gráfica.</p></div>`}
  ${vRecords()}`;
}
function buscarNombre(id) {
  for (const s of sesiones()) { const e = s.ejercicios.find(x => x.ejercicioId === id); if (e) return e.nombre; }
  return "(ejercicio eliminado)";
}
function grafLinea(pts) {
  const W = 480, H = 230, L = 40, R = 40, T = 14, B = 30;
  const rng = v => { const mn = Math.min(...v), mx = Math.max(...v), p = (mx - mn) * 0.15 || Math.abs(mx * 0.1) || 1; return [mn - p, mx + p]; };
  const [aMin, aMax] = rng(pts.map(p => p.a)), [bMin, bMax] = rng(pts.map(p => p.b));
  const x = i => L + i * (W - L - R) / (pts.length - 1);
  const ya = v => H - B - (v - aMin) / (aMax - aMin) * (H - T - B), yb = v => H - B - (v - bMin) / (bMax - bMin) * (H - T - B);
  const path = (f, k) => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${f(p[k]).toFixed(1)}`).join("");
  const grid = [0, 1, 2, 3].map(i => { const y = T + i * (H - T - B) / 3;
    return `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" class="g-grid"/>
      <text x="${L - 6}" y="${y + 4}" text-anchor="end" class="g-txt">${Math.round(aMax - i * (aMax - aMin) / 3)}</text>
      <text x="${W - R + 6}" y="${y + 4}" class="g-txt">${Math.round(bMax - i * (bMax - bMin) / 3)}</text>`; }).join("");
  const step = Math.max(1, Math.ceil(pts.length / 5));
  const labs = pts.map((p, i) => (i % step === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="g-txt">${parseISO(p.f).getDate()}/${parseISO(p.f).getMonth() + 1}</text>` : "").join("");
  const sel = E.punto !== null && pts[E.punto] ? pts[E.punto] : pts[pts.length - 1];
  const si = pts.indexOf(sel);
  return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Evolución del peso máximo y del volumen">
    ${grid}${labs}
    <line x1="${x(si)}" y1="${T}" x2="${x(si)}" y2="${H - B}" class="g-sel"/>
    <path d="${path(yb, "b")}" class="g-b"/><path d="${path(ya, "a")}" class="g-a"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${ya(p.a)}" r="3.5" class="g-pa"/>`).join("")}
    ${pts.map((p, i) => `<rect x="${x(i) - (W - L - R) / pts.length / 2}" y="${T}" width="${(W - L - R) / pts.length}" height="${H - T - B}" fill="transparent" data-punto="${i}" style="cursor:pointer"/>`).join("")}
  </svg>
  <div class="leyenda"><span><i class="l-a"></i>Peso máximo (kg)</span><span><i class="l-b"></i>Volumen (kg)</span></div>
  <p class="muted" style="margin:0"><b class="dim">${C.esc(C.fecha(sel.f))}</b> · peso máximo ${fmtNum(sel.a)} kg · volumen ${C.nf(sel.b)} kg. Toca la gráfica para ver otro día.</p>`;
}
function vRecords() {
  const ids = new Set(); sesiones().forEach(s => s.ejercicios.forEach(e => ids.add(e.ejercicioId)));
  const porG = {};
  ids.forEach(id => {
    const b = mejorPrevio(id, null); if (!b.e1) return;
    const ej = ejercicioDe(id);
    let ses = null; if (!ej) for (const s of sesiones()) { ses = s.ejercicios.find(x => x.ejercicioId === id); if (ses) break; }
    const g = grupoPrincipal(ej || ses || {});
    (porG[g] = porG[g] || []).push({ id, nombre: ej ? ej.nombre : (ses ? ses.nombre : "(eliminado)"), ...b });
  });
  const grupos = [...GRUPOS.filter(g => porG[g]), ...Object.keys(porG).filter(g => !GRUPOS.includes(g))];
  if (!grupos.length) return "";
  return `<div class="card"><p class="card-title">Récords por ejercicio</p>
    ${grupos.map(g => `<div class="sub-label" style="--c:${COLORES[g] || "var(--dim)"}"><i class="dot"></i>${C.esc(g)}</div>
      ${porG[g].sort((a, b) => b.e1 - a.e1).map(r => `<button class="item record franja ${r.id === E.progEj ? "on" : ""}" style="--franja:${colorDe(g)}" data-e="ver-ej" data-id="${r.id}">
        <span class="item-main"><b>${C.esc(r.nombre)}</b><span class="muted">${fmtNum(r.peso)}×${r.reps} · ${C.esc(C.fecha(r.fecha))}</span></span>
        <span class="mono acc">${C.nf(Math.round(r.e1))}<small> kg</small></span></button>`).join("")}`).join("")}
    <p class="muted" style="margin:0">1RM estimado de la mejor serie de cada ejercicio. Pulsa uno para ver su evolución arriba.</p></div>`;
}

/* ---------- volumen ---------- */
export function seriesPorSemana(desde) {
  const out = {};
  sesiones().forEach(s => {
    if (desde && s.fecha < desde) return;
    const wk = lunesDe(s.fecha);
    const row = out[wk] = out[wk] || {};
    s.ejercicios.forEach(e => {
      const n = e.series.filter(completa).length; if (!n) return;
      Object.entries(e.grupos || {}).forEach(([g, w]) => { row[g] = (row[g] || 0) + n * w; });
    });
  });
  return out;
}
/* Nota de un grupo: 100 dentro del rango; por debajo, proporcional a lo hecho
   (6 de 12 = 50); por encima, se resta lo que te pasas (24 sobre 20 = 80),
   sin bajar de 50. */
function estadoVolumen(sets, lm) {
  if (!lm) return { txt: sets ? "sin rango definido" : "sin trabajar", col: "var(--dim)", nota: null };
  if (!sets) return { txt: "sin trabajar", col: "var(--bad)", marca: "▼", nota: 0 };
  if (sets < lm.min) return { txt: `por debajo del rango (faltan ${C.nf(lm.min - sets, (lm.min - sets) % 1 ? 1 : 0)})`, col: "var(--warn)", marca: "▼", nota: Math.round(sets / lm.min * 100) };
  if (sets <= lm.max) return { txt: "en rango", col: "var(--acc)", marca: "✓", nota: 100 };
  return { txt: `por encima del rango (+${C.nf(sets - lm.max, (sets - lm.max) % 1 ? 1 : 0)})`, col: "var(--warn)", marca: "▲", nota: Math.max(50, Math.round(100 - (sets - lm.max) / lm.max * 100)) };
}
const notaSemana = row => notaVolumen(row, C.S.ajustes.entreno.rangos);
function vVolumen() {
  const desdeRaw = haceMeses(RANGOS[E.volRango]);
  const porSem = seriesPorSemana(desdeRaw ? lunesDe(desdeRaw) : null);
  const semanas = Object.keys(porSem).sort();
  if (!semanas.length) return selectorRango("vol", E.volRango) + `<div class="card vacio"><p>No hay series en este periodo.</p></div>`;
  if (!E.semana || !semanas.includes(E.semana)) E.semana = semanas[semanas.length - 1];
  const idx = semanas.indexOf(E.semana), row = porSem[E.semana];
  const activos = GRUPOS.filter(g => semanas.some(w => porSem[w][g]));
  const rangos = C.S.ajustes.entreno.rangos || {};
  const nota = notaSemana(row);
  const tier = nota === null ? null : nota >= 85 ? ["Semana muy completa", "var(--acc)"] : nota >= 70 ? ["Semana correcta", "var(--text)"] : nota >= 50 ? ["Mejorable", "var(--warn)"] : ["Semana floja", "var(--bad)"];
  const filas = GRUPOS.filter(g => (row[g] || 0) > 0 || (rangos[g] && !OPCIONALES.has(g)));
  return selectorRango("vol", E.volRango) + `
  <div class="card"><p class="card-title">Series semanales por grupo</p>${grafBarras(semanas, porSem, activos)}</div>
  <div class="card">
    <div class="sem-nav">
      <button class="icon-btn sm" data-sem="-1" ${idx === 0 ? "disabled" : ""} aria-label="Semana anterior">${C.icon("izq", 18)}</button>
      <div style="flex:1;text-align:center"><p class="card-title" style="margin:0">Semana frente al rango</p>
        <span class="muted">Del ${C.esc(C.fecha(E.semana))}${idx === semanas.length - 1 ? " · última" : ""}</span></div>
      <button class="icon-btn sm" data-sem="1" ${idx === semanas.length - 1 ? "disabled" : ""} aria-label="Semana siguiente">${C.icon("der", 18)}</button>
    </div>
    ${tier ? `<div class="nota"><span class="mono" style="color:${tier[1]}">${nota}<small>/100</small></span><span style="color:${tier[1]}">${tier[0]}</span></div>` : ""}
    ${filas.map(g => {
      const sets = row[g] || 0, lm = rangos[g], st = estadoVolumen(sets, lm);
      const escala = Math.max(lm ? lm.max * 1.3 : 20, sets) * 1.05, pc = v => Math.min(100, v / escala * 100);
      return `<div class="vol">
        <div class="vol-top"><span class="g-nombre"><i class="dot" style="background:${colorDe(g)}"></i>${C.esc(g)}</span><span style="color:${st.col}"><b>${C.nf(sets, sets % 1 ? 1 : 0)}</b> ${lm ? `<span class="muted">/ ${lm.min}–${lm.max}</span>` : ""}</span></div>
        <div class="vol-bar">${lm ? `<i class="vol-rango" style="left:${pc(lm.min)}%;width:${pc(lm.max) - pc(lm.min)}%"></i>` : ""}<i class="vol-fill" style="width:${pc(sets)}%;background:${st.col}"></i></div>
        <div class="vol-txt" style="color:${st.col}">${st.marca ? st.marca + " " : ""}${st.txt}</div></div>`;
    }).join("")}
    <p class="muted" style="margin:0">La franja clara es tu rango (desde–hasta). Dentro del rango, 100; por debajo, proporcional a las series hechas; por encima, se resta lo que te pasas (mínimo 50). Los grupos sin rango no cuentan; hombro anterior, core y antebrazo solo cuentan si los entrenas. Los rangos se editan en Ajustes.</p>
  </div>`;
}
function grafBarras(semanas, porSem, activos) {
  const W = 480, H = 250, L = 30, R = 6, T = 10, B = 28;
  const totales = semanas.map(w => activos.reduce((a, g) => a + (porSem[w][g] || 0), 0));
  const max = Math.max(...totales, 1), gap = (W - L - R) / semanas.length, bw = Math.min(36, gap * 0.7);
  const step = Math.max(1, Math.ceil(semanas.length / 6));
  const barras = semanas.map((w, i) => {
    const x0 = L + i * gap + (gap - bw) / 2; let acc = 0;
    const segs = activos.map(g => { const v = porSem[w][g] || 0; if (!v) return ""; const h = v / max * (H - T - B); const y = H - B - acc - h; acc += h;
      return `<rect x="${x0}" y="${y}" width="${bw}" height="${h}" fill="${COLORES[g] || "#888"}"/>`; }).join("");
    const lab = (i % step === 0 || i === semanas.length - 1) ? `<text x="${x0 + bw / 2}" y="${H - 8}" text-anchor="middle" class="g-txt">${parseISO(w).getDate()}/${parseISO(w).getMonth() + 1}</text>` : "";
    const sel = w === E.semana ? `<rect x="${L + i * gap}" y="${T}" width="${gap}" height="${H - T - B}" class="g-selbg"/>` : "";
    return sel + segs + lab + `<rect x="${L + i * gap}" y="${T}" width="${gap}" height="${H - T - B}" fill="transparent" data-semana="${w}" style="cursor:pointer"/>`;
  }).join("");
  const grid = [0, 1, 2, 3, 4].map(i => { const y = T + i * (H - T - B) / 4; return `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" class="g-grid"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" class="g-txt">${Math.round(max - i * max / 4)}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Series semanales por grupo muscular">${grid}${barras}</svg>
    <div class="leyenda">${activos.map(g => `<span><i style="background:${COLORES[g] || "#888"}"></i>${C.esc(g)}</span>`).join("")}</div>
    <p class="muted" style="margin:0">Toca una barra para ver esa semana abajo.</p>`;
}

/* ---------- historial ---------- */
function vHistorial() {
  if (!sesiones().length) return `<div class="card vacio"><p>Sin sesiones registradas.</p></div>`;
  const orden = sesiones().slice().sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const numero = Object.fromEntries(orden.map((s, i) => [s.fecha, i + 1]));
  const arbol = {};
  orden.forEach(s => { const [y, m] = s.fecha.split("-"); ((arbol[y] = arbol[y] || {})[m] = arbol[y][m] || []).push(s); });
  const aj = C.S.ajustes.entreno;
  const minutos = s => { const ef = s.ejercicios.reduce((a, e) => a + e.series.filter(completa).length * (e.unilateral ? 2 : 1), 0);
    return Math.round(ef * ((aj.segundosSerie || 60) / 60 + (aj.descansoMin ?? 2))); };
  return Object.keys(arbol).sort().reverse().map(y => {
    const abierto = E.anios.has(y), total = Object.values(arbol[y]).reduce((a, l) => a + l.length, 0);
    return `<div class="card hist">
      <button class="hist-head" data-anio="${y}" aria-expanded="${abierto}"><span class="mono">${y}</span><span class="muted">${total} sesiones</span></button>
      ${abierto ? Object.keys(arbol[y]).sort().reverse().map(m => {
        const mk = `${y}-${m}`, mab = E.meses.has(mk), lista = arbol[y][m].slice().reverse();
        return `<button class="hist-mes" data-mes="${mk}" aria-expanded="${mab}"><span>${MESES[+m - 1]}</span><span class="muted">${lista.length}</span></button>
          ${mab ? lista.map(s => {
            const ab = E.abierta === s.fecha, vol = s.ejercicios.reduce((a, e) => a + e.series.reduce((t, x) => t + (completa(x) ? x.peso * x.reps : 0), 0), 0);
            return `<div class="hist-ses">
              <button class="hist-ses-head" data-ses="${s.fecha}" aria-expanded="${ab}">
                <span><span class="mono muted">#${numero[s.fecha]}</span> ${C.esc(C.fecha(s.fecha))}</span>
                <span class="muted">${minutos(s)} min · ${s.ejercicios.length} ej.</span></button>
              ${ab ? `<div class="hist-body">
                <div class="acc">${C.nf(Math.round(vol))} kg de volumen</div>
                ${s.ejercicios.map(e => `<div class="hist-ej franja" style="${franja(e.grupos)}"><b>${C.esc(e.nombre)}</b> <span class="muted">${e.series.map(x => completa(x) ? `${fmtNum(x.peso)}×${x.reps}` : "—").join(", ")}</span></div>`).join("")}
                <div class="btn-row">
                  <button class="btn sm" data-e="ir-fecha" data-f="${s.fecha}">Abrir en Registrar</button>
                  ${E.confirmBorrar === s.fecha
                    ? `<button class="btn sm danger" data-e="borrar-ses" data-f="${s.fecha}">Sí, borrar sesión</button><button class="btn sm" data-e="no-borrar">Cancelar</button>`
                    : `<button class="btn sm danger" data-e="pedir-borrar" data-f="${s.fecha}">Borrar sesión</button>`}
                </div></div>` : ""}
            </div>`;
          }).join("") : ""}`;
      }).join("") : ""}
    </div>`;
  }).join("") + `<div class="card"><div class="btn-row">${E.confirmTodo
    ? `<span class="err" style="flex-basis:100%">Se borrarán las ${sesiones().length} sesiones del historial, en todos tus dispositivos. Descarga antes una copia.</span><button class="btn danger" data-e="borrar-todo">Sí, borrar todo</button><button class="btn" data-e="no-borrar-todo">Cancelar</button>`
    : `<button class="btn danger" data-e="pedir-borrar-todo">Borrar todo el historial</button>`}</div></div>`;
}

/* ---------- ajustes de entreno (se muestran en la pestaña Ajustes) ---------- */
export function vAjustes() {
  const a = C.S.ajustes.entreno, r = a.rangos || {};
  return `<form id="aj-entreno" class="pila"><div class="card"><p class="card-title">Entreno</p>
    <div class="grid2">
      <label class="campo">Descanso entre series (min)<input name="descansoMin" inputmode="decimal" value="${fmtNum(a.descansoMin)}"></label>
      <label class="campo">Duración de una serie (s)<input name="segundosSerie" inputmode="numeric" value="${a.segundosSerie}"></label>
    </div>
    <label class="check"><input type="checkbox" name="sonido" ${a.sonido !== false ? "checked" : ""}><span>Sonido al terminar el descanso</span></label>
    <div class="btn-row"><button class="btn sm" type="button" data-e="probar-sonido">Probar sonido</button></div>
    <label class="campo">Criterios de registro (uno por línea)<textarea name="criterios" rows="5">${C.esc((a.criterios || []).join("\n"))}</textarea></label>
    <div class="btn-row"><button class="btn primary" type="submit">Guardar entreno</button></div>
  </div>
  <div class="card"><p class="card-title">Rangos semanales de series</p>
    <p class="muted" style="margin:0">Series efectivas por semana. Deja un grupo en blanco para no darle rango (no contará en la nota).</p>
    <div class="rangos">
      <span></span><span class="muted">Desde</span><span class="muted">Hasta</span>
      ${GRUPOS.map(g => `<span>${C.esc(g)}</span>${[["min", "desde"], ["max", "hasta"]].map(([k, t]) => `<input inputmode="decimal" name="r|${g}|${k}" value="${r[g] ? fmtNum(r[g][k]) : ""}" aria-label="${C.esc(g)} ${t}">`).join("")}`).join("")}
    </div>
    <div class="btn-row"><button class="btn primary" type="submit">Guardar rangos</button></div>
  </div></form>`;
}
function guardarAjustesEntreno(form) {
  const f = new FormData(form), a = C.S.ajustes.entreno;
  const r = {}, malos = [];
  GRUPOS.forEach(g => {
    const [min, max] = ["min", "max"].map(k => num(f.get(`r|${g}|${k}`)));
    if (min === null && max === null) { r[g] = null; return; }
    if (min === null || max === null || min > max || max === 0) { malos.push(g); return; }
    r[g] = { min, max };
  });
  if (malos.length) { C.toast(`Revisa el rango de ${malos.join(", ")}: rellena desde y hasta, con desde ≤ hasta.`, 6000); return; }
  a.rangos = r;
  a.descansoMin = num(f.get("descansoMin")) ?? 2;
  a.segundosSerie = num(f.get("segundosSerie")) ?? 60;
  a.sonido = !!f.get("sonido");
  a.criterios = String(f.get("criterios") || "").split("\n").map(x => x.trim()).filter(Boolean);
  C.DB.guardarAjustes(C.S.user.uid, C.S.ajustes).catch(err => C.toast("No se pudo guardar: " + C.mensajeError(err), 5000));
  C.toast("Ajustes de entreno guardados."); C.render();
}

/* ---------- eventos ---------- */
export function click(e) {
  const t = e.target;
  const sub = t.closest("[data-esub]"); if (sub) { E.sub = sub.dataset.esub; C.render(); return true; }
  const rg = t.closest("[data-rango]");
  if (rg) { const [w, v] = rg.dataset.rango.split(":"); if (w === "prog") { E.progRango = v; E.punto = null; } else { E.volRango = v; E.semana = null; } C.render(); return true; }
  const pt = t.closest("[data-punto]"); if (pt) { E.punto = +pt.dataset.punto; C.render(); return true; }
  const sm = t.closest("[data-semana]"); if (sm) { E.semana = sm.dataset.semana; C.render(); return true; }
  const sn = t.closest("[data-sem]");
  if (sn && !sn.disabled) {
    const desdeRaw = haceMeses(RANGOS[E.volRango]);
    const sems = Object.keys(seriesPorSemana(desdeRaw ? lunesDe(desdeRaw) : null)).sort();
    const j = sems.indexOf(E.semana) + (+sn.dataset.sem); if (sems[j]) { E.semana = sems[j]; C.render(); } return true;
  }
  const an = t.closest("[data-anio]"); if (an) { const y = an.dataset.anio; E.anios.has(y) ? E.anios.delete(y) : E.anios.add(y); C.render(); return true; }
  const me = t.closest("[data-mes]"); if (me) { const m = me.dataset.mes; E.meses.has(m) ? E.meses.delete(m) : E.meses.add(m); C.render(); return true; }
  const se = t.closest("[data-ses]"); if (se) { E.abierta = E.abierta === se.dataset.ses ? null : se.dataset.ses; E.confirmBorrar = null; C.render(); return true; }

  const b = t.closest("[data-e]"); if (!b) return false;
  const act = b.dataset.e, i = +b.dataset.i, j = +b.dataset.j;
  switch (act) {
    case "picker": E.picker = true; E.q = ""; E.creando = false; E.editandoEj = null; break;
    case "picker-cerrar": E.picker = false; E.confirmEj = null; break;
    case "crear": E.creando = true; break;
    case "form-cancelar": E.creando = false; E.editandoEj = null; break;
    case "editar-ej": E.editandoEj = b.dataset.id; E.confirmEj = null; break;
    case "pedir-borrar-ej": E.confirmEj = b.dataset.id; break;
    case "no-borrar-ej": E.confirmEj = null; break;
    case "borrar-ej":
      C.S.ejercicios = C.S.ejercicios.filter(x => x.id !== b.dataset.id);
      C.DB.borrarDoc(C.S.user.uid, "ejercicios", b.dataset.id).catch(err => C.toast(C.mensajeError(err), 5000));
      E.confirmEj = null; C.toast("Ejercicio eliminado del catálogo."); break;
    case "elegir": {
      const ej = ejercicioDe(b.dataset.id); if (!ej) break;
      conSesion(s => s.ejercicios.push({ ejercicioId: ej.id, nombre: ej.nombre, grupos: { ...ej.grupos }, unilateral: !!ej.unilateral, series: [{ peso: null, reps: null }] }));
      E.picker = false; E.q = ""; break;
    }
    case "plegar-todos": {
      const s = sesionDe(E.fecha); if (!s) break;
      const todos = s.ejercicios.every(e => E.plegados.has(e.ejercicioId));
      s.ejercicios.forEach(e => todos ? E.plegados.delete(e.ejercicioId) : E.plegados.add(e.ejercicioId)); break;
    }
    case "plegar": { const id = b.dataset.id; E.plegados.has(id) ? E.plegados.delete(id) : E.plegados.add(id); break; }
    case "mas-serie": conSesion(s => { s.ejercicios[i].series.push({ peso: null, reps: null }); }); break;
    case "quitar-serie": conSesion(s => { s.ejercicios[i].series.splice(j, 1); }); break;
    case "subir": case "bajar": conSesion(s => { const k = act === "subir" ? i - 1 : i + 1; if (k < 0 || k >= s.ejercicios.length) return; [s.ejercicios[i], s.ejercicios[k]] = [s.ejercicios[k], s.ejercicios[i]]; }); break;
    case "quitar-ej": conSesion(s => { s.ejercicios.splice(i, 1); }); C.toast("Ejercicio quitado de la sesión."); break;
    case "copiar-abrir": E.copiando = true; E.picker = false; break;
    case "copiar-cerrar": E.copiando = false; break;
    case "copiar": {
      const src = sesionDe(b.dataset.f); if (!src) break;
      conSesion(s => {
        s.ejercicios = src.ejercicios.map(e => {
          const mejor = mejorEntrada(e.ejercicioId);
          const ref = (mejor && mejor.series.length) ? mejor.series : e.series;
          const ej = ejercicioDe(e.ejercicioId);
          return { ejercicioId: e.ejercicioId, nombre: ej ? ej.nombre : e.nombre, grupos: { ...(ej ? ej.grupos : e.grupos) },
            unilateral: ej ? !!ej.unilateral : !!e.unilateral,
            series: ref.map(r => ({ peso: null, reps: null, ...(r.peso != null ? { sugPeso: r.peso } : {}), ...(r.reps != null ? { sugReps: r.reps } : {}) })) };
        });
        s.copiadaDe = src.fecha;
      });
      E.copiando = false; C.toast(`Copiada la sesión del ${C.fecha(src.fecha)}.`); break;
    }
    case "ver-ej": E.progEj = b.dataset.id; E.punto = null; window.scrollTo({ top: 0, behavior: "smooth" }); break;
    case "ir-fecha": E.fecha = b.dataset.f; E.sub = "registrar"; window.scrollTo(0, 0); break;
    case "pedir-borrar": E.confirmBorrar = b.dataset.f; break;
    case "no-borrar": E.confirmBorrar = null; break;
    case "borrar-ses": {
      const f = b.dataset.f;
      C.S.sesiones = sesiones().filter(s => s.fecha !== f);
      C.DB.borrarDoc(C.S.user.uid, "sesiones", f).catch(err => C.toast(C.mensajeError(err), 5000));
      E.confirmBorrar = null; E.abierta = null; C.toast("Sesión borrada."); break;
    }
    case "pedir-borrar-todo": E.confirmTodo = true; break;
    case "no-borrar-todo": E.confirmTodo = false; break;
    case "borrar-todo": {
      const fechas = sesiones().map(s => s.fecha);
      C.S.sesiones = [];
      C.DB.borrarVarios(C.S.user.uid, "sesiones", fechas).catch(err => C.toast(C.mensajeError(err), 5000));
      E.confirmTodo = false; C.toast("Historial borrado."); break;
    }
    case "probar-sonido": desbloquearAudio(); setTimeout(pitido, 60); return true;
    default: return false;
  }
  C.render();
  return true;
}

/* Al teclear: se actualiza la serie y el resumen sin repintar (para no perder el foco) */
export function input(t) {
  if (t.id === "e-buscar") { E.q = t.value; const pos = t.selectionStart; C.render(); const n = document.getElementById("e-buscar"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return true; }
  if (!t.dataset.set) return false;
  const [i, j, campo] = t.dataset.set.split(":");
  const s = sesionDe(E.fecha); if (!s) return true;
  const st = s.ejercicios[+i].series[+j];
  st[campo] = num(t.value);
  t.closest(".serie").classList.toggle("ok", completa(st));
  programarGuardado(s, false);
  return true;
}

/* Al terminar de escribir un campo: guarda, comprueba récord y arranca el descanso */
const yaDescansado = new Set();
export function change(t) {
  if (t.id === "e-fecha") { guardarYa(); E.fecha = t.value || hoyISO(); E.picker = false; E.copiando = false; C.render(); return true; }
  if (!t.dataset.set) return false;
  const [i, j] = t.dataset.set.split(":").map(Number);
  const s = sesionDe(E.fecha); if (!s) return true;
  const ej = s.ejercicios[i], st = ej.series[j];
  guardarYa();
  if (completa(st)) {
    const clave = `${s.fecha}|${i}|${j}`;
    if (!yaDescansado.has(clave)) { yaDescansado.add(clave); iniciarDescanso(ej.nombre); }
    const ref = mejorPrevio(ej.ejercicioId, s.fecha);
    if (ref.e1 > 0 && e1rm(st.peso, st.reps) > ref.e1 * 1.001)
      C.toast(`Récord en ${ej.nombre}: ${fmtNum(st.peso)} kg × ${st.reps} (1RM estimado ${C.nf(Math.round(e1rm(st.peso, st.reps)))} kg, antes ${C.nf(Math.round(ref.e1))}).`, 6000, "rec");
  }
  marcarFila(t, s, i, j);
  return true;
}

/* Actualiza solo la fila y el resumen: repintar todo aquí haría perder el
   toque con el que pasas al siguiente campo. */
function marcarFila(t, s, i, j) {
  const fila = t.closest(".serie"); if (!fila) return;
  const ej = s.ejercicios[i], st = ej.series[j];
  const ref = mejorPrevio(ej.ejercicioId, s.fecha);
  const rec = completa(st) && ref.e1 > 0 && e1rm(st.peso, st.reps) > ref.e1 * 1.001;
  fila.classList.toggle("ok", completa(st));
  fila.classList.toggle("rec", rec);
  const badge = fila.querySelector(".badge-rec");
  if (rec && !badge) fila.querySelector(".icon-btn").insertAdjacentHTML("beforebegin", `<span class="badge-rec">${C.icon("trofeo", 14)}RÉCORD</span>`);
  if (!rec && badge) badge.remove();
  const card = fila.closest(".ej"), cnt = card && card.querySelector(".ej-count");
  if (cnt) cnt.textContent = `${ej.series.filter(completa).length}/${ej.series.length}`;
  const stats = document.querySelectorAll("#e-resumen b");
  if (stats.length === 3) {
    const ents = s.ejercicios;
    stats[0].innerHTML = `${ents.reduce((a, e) => a + e.series.filter(completa).length, 0)}<small>/${ents.reduce((a, e) => a + e.series.length, 0)}</small>`;
    stats[1].textContent = C.nf(Math.round(ents.reduce((a, e) => a + e.series.reduce((x, y) => x + (completa(y) ? y.peso * y.reps : 0), 0), 0)));
  }
}

export function submit(form) {
  if (form.id === "aj-entreno") { guardarAjustesEntreno(form); return true; }
  if (form.id !== "form-ej") return false;
  const f = new FormData(form);
  const nombre = String(f.get("nombre") || "").trim(); if (!nombre) return true;
  const gs = f.getAll("g"); if (!gs.length) { C.toast("Marca al menos un grupo muscular."); return true; }
  const grupos = Object.fromEntries(gs.map(g => [g, 1]));
  const uni = !!f.get("uni");
  if (E.editandoEj) {
    const ej = ejercicioDe(E.editandoEj);
    Object.assign(ej, { nombre, grupos, unilateral: uni });
    C.DB.guardarDoc(C.S.user.uid, "ejercicios", ej.id, ej).catch(err => C.toast(C.mensajeError(err), 5000));
    E.editandoEj = null; C.toast("Ejercicio actualizado. Las sesiones nuevas usarán estos grupos.");
  } else {
    const ej = { id: uid(), nombre, grupos, unilateral: uni };
    C.S.ejercicios.push(ej);
    C.DB.guardarDoc(C.S.user.uid, "ejercicios", ej.id, ej).catch(err => C.toast(C.mensajeError(err), 5000));
    conSesion(s => s.ejercicios.push({ ejercicioId: ej.id, nombre, grupos: { ...grupos }, unilateral: uni, series: [{ peso: null, reps: null }] }));
    E.creando = false; E.picker = false; E.q = "";
  }
  C.render();
  return true;
}
