/* V.I.T.A. — pantalla de Google Drive: copia de seguridad semanal y buzón de
   entrada (lo que te deja Claude para que lo revises). Lógica: drive.js y
   buzon-calc.js. */

import { hoyISO } from "./model.js";
import * as B from "./buzon-calc.js";

let C = null;
export function init(ctx) { C = ctx; }
const N = { ocupado: null, entradas: null, error: null };   // entradas = [{ e, v }] pendientes del buzón ya validadas

const aj = () => { const a = C.S.ajustes.app; a.drive = a.drive || {}; return a.drive; };
const cada = () => aj().cadaDias || 7;
const diasDesde = iso => Math.floor((new Date(hoyISO() + "T00:00:00") - new Date(iso + "T00:00:00")) / 86400000);
export const usaDrive = () => !!aj().carpeta;
/* La última copia: la de V.I.T.A. o la que sube NEXO desde el móvil (app.drive.ultimaSubidaNexo), la más reciente */
const ultimaCopiaDrive = () => [aj().ultimaSubida, aj().ultimaSubidaNexo].filter(Boolean).sort().pop() || null;
const deNexo = () => !!aj().ultimaSubidaNexo && ultimaCopiaDrive() === aj().ultimaSubidaNexo && aj().ultimaSubidaNexo !== aj().ultimaSubida;
export const copiaDriveDebida = () => usaDrive() && (!ultimaCopiaDrive() || diasDesde(ultimaCopiaDrive()) >= cada());
const ctxValidar = () => ({ dias: C.S.dias, diario: C.S.diario, alimentos: C.S.alimentos, menus: C.S.menus, hoy: hoyISO() });
const fallo = e => { N.ocupado = null; N.error = C.mensajeError(e); C.toast(N.error, 7000); C.render(); };

/* Guarda en Ajustes los ids de la carpeta, el buzón y la copia (si han cambiado) */
async function ids() {
  const antes = JSON.stringify({ carpeta: aj().carpeta, buzon: aj().buzon, ultima: aj().ultima });
  const r = await C.DR.asegurar({ carpeta: aj().carpeta, buzon: aj().buzon, ultima: aj().ultima });
  Object.assign(aj(), r);
  if (JSON.stringify({ carpeta: r.carpeta, buzon: r.buzon, ultima: r.ultima }) !== antes) await C.DB.guardarAjustes(C.S.user.uid, C.S.ajustes).catch(() => {});
  return r;
}
async function cargarBuzon() {
  const filas = B.pendientes(B.leerFilas(await C.DR.leerBuzon(aj())));
  N.entradas = filas.map(e => ({ e, v: B.validar(e, ctxValidar()) }));
  return N.entradas.length;
}

/* ---------- acciones (siempre desde un toque: el permiso de Google lo necesita) ---------- */
function copia() {
  N.ocupado = "copia"; N.error = null; C.render();
  C.DR.permiso().then(async () => {
    const r = await ids();
    C.EN.guardarYa();
    Object.assign(aj(), await C.DR.subirCopia(r, C.crearCopia(C.S), hoyISO()));
    aj().ultimaSubida = hoyISO(); C.S.ajustes.app.ultimaCopia = hoyISO();
    await C.DB.guardarAjustes(C.S.user.uid, C.S.ajustes).catch(() => {});
    let n = 0; try { n = await cargarBuzon(); } catch {}
    N.ocupado = null;
    C.toast(`Copia guardada en Drive (carpeta «V.I.T.A.»).${n ? ` Tienes ${n} ${n === 1 ? "entrada" : "entradas"} en el buzón: revísalas en Ajustes → Google Drive.` : ""}`, n ? 7000 : 4000);
    C.render();
  }).catch(fallo);
}
function buzon(irAjustes) {
  N.ocupado = "buzon"; N.error = null; C.render();
  C.DR.permiso().then(async () => {
    await ids();
    const n = await cargarBuzon();
    N.ocupado = null;
    C.toast(n ? `${n} ${n === 1 ? "entrada" : "entradas"} en el buzón.` : "El buzón está vacío.");
    if (irAjustes) C.irA("ajustes", "aj-drive"); else C.render();
  }).catch(fallo);
}
/* Guarda una entrada (validándola otra vez con los datos de ahora) y la marca en la hoja */
async function guardar(item) {
  const v = B.validar(item.e, ctxValidar());
  if (!v.ok) throw new Error(`${v.titulo}: ${v.error}`);
  const c = v.cambios, uid = C.S.user.uid;
  if (c.col === "dias") await C.DB.actualizarDoc(uid, "dias", c.id, c.campos);
  else if (c.col === "diario") await C.DB.guardarDoc(uid, "diario", c.id, JSON.parse(JSON.stringify(c.doc)));
  else if (c.col === "menus" || c.col === "alimentos") {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7), doc = { id, ...c.doc };
    if (c.col === "alimentos") C.darNumero(doc);   // con su número ya puesto, en la misma escritura
    await C.DB.guardarDoc(uid, c.col, id, doc);
  }
  await C.DR.marcarFila(aj(), item.e.fila, `aplicado ${hoyISO()}`, v.titulo);
  N.entradas = N.entradas.filter(x => x !== item);
}
function aplicar(filas) {
  const lista = (N.entradas || []).filter(x => filas.includes(x.e.fila) && x.v.ok);
  if (!lista.length) return;
  N.ocupado = "aplicar"; C.render();
  C.DR.permiso().then(async () => {
    let ok = 0;
    for (const it of lista) { await guardar(it); ok++; }
    N.ocupado = null; C.toast(`${ok} ${ok === 1 ? "entrada guardada" : "entradas guardadas"} en V.I.T.A.`); C.render();
  }).catch(fallo);
}
function descartar(fila) {
  const it = (N.entradas || []).find(x => x.e.fila === fila); if (!it) return;
  N.ocupado = "aplicar"; C.render();
  C.DR.permiso().then(async () => {
    await C.DR.marcarFila(aj(), fila, `descartado ${hoyISO()}`, it.v.titulo);
    N.entradas = N.entradas.filter(x => x !== it); N.ocupado = null; C.toast("Entrada descartada."); C.render();
  }).catch(fallo);
}

/* ---------- vistas ---------- */
export function avisoHoy() {
  if (!copiaDriveDebida() && !(N.entradas && N.entradas.length)) return "";
  const u = ultimaCopiaDrive(), n = N.entradas ? N.entradas.length : 0;
  return `<div class="notice">${C.icon("nube", 20, "var(--acc)")}<div style="flex:1">
    ${copiaDriveDebida() ? `<div>${u ? `Tu última copia en Drive es de hace ${diasDesde(u)} días.` : "Aún no has guardado ninguna copia en Drive."} Toca subirla (cada ${cada()} días).</div>` : ""}
    ${n ? `<div>Tienes ${n} ${n === 1 ? "entrada" : "entradas"} en el buzón por revisar.</div>` : ""}
    <div class="btn-row" style="margin-top:8px">${copiaDriveDebida() ? `<button class="btn primary" data-act="drive-copia" ${N.ocupado ? "disabled" : ""}>${N.ocupado === "copia" ? "Subiendo…" : "Subir copia a Drive"}</button>` : ""}
      <button class="btn" data-act="${n ? "drive-ver" : "drive-buzon-ir"}" ${N.ocupado ? "disabled" : ""}>${n ? "Revisar el buzón" : "Mirar el buzón"}</button></div></div></div>`;
}
export function vAjustes() {
  const d = aj(), con = usaDrive();
  return `<div class="card" data-sec="aj-drive" id="aj-drive"><p class="card-title">Google Drive</p>
    <div class="row"><span>Copia en Drive</span><span>${ultimaCopiaDrive() ? `${C.esc(C.fecha(ultimaCopiaDrive()))}${deNexo() ? ` <span class="muted">· desde NEXO</span>` : ""}${diasDesde(ultimaCopiaDrive()) >= cada() ? ` <span class="muted">· toca otra</span>` : ""}` : "nunca"}</span></div>
    <div class="btn-row">
      <button class="btn primary" data-act="drive-copia" ${N.ocupado ? "disabled" : ""}>${N.ocupado === "copia" ? "Subiendo…" : con ? "Guardar copia en Drive" : "Conectar Drive y guardar copia"}</button>
      ${con ? `<button class="btn" data-act="drive-buzon" ${N.ocupado ? "disabled" : ""}>${N.ocupado === "buzon" ? "Leyendo…" : "Revisar el buzón"}</button>` : ""}
    </div>
    ${N.error ? `<p class="err" style="margin:0">${C.esc(N.error)}</p>` : ""}
    <p class="muted" style="margin:0">Se guarda en la carpeta «V.I.T.A.» de tu Drive: «vita-copia-ultima.json» y las ${8} últimas con fecha. V.I.T.A. solo puede ver los archivos que ella crea, no el resto de tu Drive. Google pide un toque tuyo cada vez (el permiso dura alrededor de una hora), por eso te avisa en Hoy cada ${cada()} días.</p>
    ${N.entradas ? vBuzon() : con ? `<p class="muted" style="margin:0">Buzón: la hoja «V.I.T.A. buzón» de esa carpeta. Ahí Claude puede dejarte pesajes, medidas, comidas, menús y alimentos nuevos; aquí los revisas antes de que se guarden.</p>` : ""}
  </div>`;
}
function vBuzon() {
  const l = N.entradas;
  if (!l.length) return `<div class="sub-label">Buzón</div><p class="muted" style="margin:0">Vacío: no hay nada por revisar.</p>`;
  const validas = l.filter(x => x.v.ok);
  return `<div class="sub-label">Buzón · ${l.length} por revisar</div>
    <div class="items">${l.map(({ e, v }) => `<div class="item buzon ${v.ok ? "" : "mal"}">
      <div class="item-main"><b>${C.esc(v.titulo)}</b>
        ${e.nota ? `<span class="muted">${C.esc(e.nota)}</span>` : ""}
        ${v.ok ? v.lineas.map(x => `<span>${C.esc(x)}</span>`).join("") : `<span class="err">No se puede guardar: ${C.esc(v.error)}</span>`}
        ${v.avisos.map(x => `<span class="aviso-buzon">${C.icon("aviso", 14, "var(--warn)")} ${C.esc(x)}</span>`).join("")}
        <div class="btn-row">${v.ok ? `<button class="btn sm primary" data-act="bz-aplicar" data-fila="${e.fila}" ${N.ocupado ? "disabled" : ""}>Guardar</button>` : ""}<button class="btn sm" data-act="bz-descartar" data-fila="${e.fila}" ${N.ocupado ? "disabled" : ""}>Descartar</button></div>
      </div></div>`).join("")}</div>
    ${validas.length > 1 ? `<div class="btn-row"><button class="btn primary" data-act="bz-todas" ${N.ocupado ? "disabled" : ""}>Guardar las ${validas.length} válidas</button></div>` : ""}`;
}

export function click(b) {
  switch (b.dataset.act) {
    case "drive-copia": copia(); return true;
    case "drive-buzon": buzon(false); return true;
    case "drive-buzon-ir": buzon(true); return true;
    case "drive-ver": C.irA("ajustes", "aj-drive"); return true;
    case "bz-aplicar": aplicar([+b.dataset.fila]); return true;
    case "bz-todas": aplicar((N.entradas || []).filter(x => x.v.ok).map(x => x.e.fila)); return true;
    case "bz-descartar": descartar(+b.dataset.fila); return true;
  }
  return false;
}
