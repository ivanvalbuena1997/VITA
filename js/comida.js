/* V.I.T.A. — módulo de Comida: diario, semana, menús, alimentos y compra.
   Los cálculos viven en comida-calc.js. Aquí solo hay pantallas y acciones.
   Las hojas (añadir alimento, ficha de producto, plato…) se pintan en #hoja,
   fuera de la pantalla principal, para que la sincronización no las repinte
   mientras escribes. */

import { COMIDAS, SUPERS, hoyISO, toISO } from "./model.js";
import * as K from "./comida-calc.js";

let C = null;
export function init(ctx) { C = ctx; }

/* ---------- estado de la pantalla ---------- */
const F = {
  sub: "diario", fecha: hoyISO(), menuAbierto: null, semana: null,
  q: "", tipo: "todos", superF: "todos", sinPrecio: false, orden: "nombre",
  hoja: null
};

/* ---------- datos fijos ---------- */
const SUPER_INFO = {
  generico: { n: "Genérico", c: "#9DBDC7" }, mercadona: { n: "Mercadona", c: "#2EBD5F" }, dia: { n: "Día", c: "#FF5A52" },
  lidl: { n: "Lidl", c: "#FFD24D" }, carrefour: { n: "Carrefour", c: "#4D8BFF" }, aldi: { n: "Aldi", c: "#FF9F43" },
  decathlon: { n: "Decathlon", c: "#3FB8FF" }, hsn: { n: "HSN", c: "#B8FF5A" }
};
const COLOR_COMIDA = { desayuno: "#FFB547", almuerzo: "#B8FF5A", comida: "#3FE0FF", merienda: "#FF7A90", cena: "#B48CFF" };
const MAC = [
  { k: "prot", n: "Proteína", l: "P", c: "var(--prot)" }, { k: "hid", n: "Hidratos", l: "H", c: "var(--hid)" },
  { k: "gra", n: "Grasas", l: "G", c: "var(--gra)" }, { k: "fib", n: "Fibra", l: "F", c: "var(--fib)" }
];
const ORDENES = { nombre: "Nombre", prot: "Proteína por 100 kcal", hid: "Hidratos por 100 kcal", kcal: "Calorías", precio: "Precio" };

/* ---------- utilidades ---------- */
const esc = s => C.esc(s);
const f0 = n => Math.round(n || 0).toLocaleString("es-ES");
const f1 = n => (Math.round((n || 0) * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const eur = n => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mapa = () => K.porId(C.S.alimentos);
const activos = () => C.S.alimentos.filter(a => !a.archivado);
const vacias = () => Object.fromEntries(COMIDAS.map(m => [m.k, []]));
const nombreComida = k => (COMIDAS.find(m => m.k === k) || {}).n || k;
const sumarDias = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };
const lunesDe = iso => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); };
const limpio = o => JSON.parse(JSON.stringify(o));
const fallo = err => C.toast("No se pudo guardar: " + C.mensajeError(err), 6000);
const superTag = a => { if (K.esPlato(a)) return `<span class="tag" style="--c:#FF9F43">plato</span>`; const s = SUPER_INFO[a.super] || SUPER_INFO.generico; return `<span class="tag" style="--c:${s.c}">${esc(s.n)}</span>`; };
const pills = (m, fibra = false) => MAC.filter(x => fibra || x.k !== "fib").map(x => `<span class="mp" style="--c:${x.c}">${x.l} ${f1(m[x.k])}</span>`).join("");
const pastillas = (m, fibra = false) => `<span class="mps">${pills(m, fibra)}</span>`;
function objetivo() { return K.objetivoGramos(C.S.ajustes.objetivo, C.peso()); }
function cantidadTxt(a, g) {
  const u = K.unidad(a), f = K.factorDe(a);
  return f ? `${f0(g)} ${u} crudo <span class="muted">· ≈${f0(g * f)} ${u} hecho</span>` : `${f0(g)} ${u}`;
}

/* ---------- contenedores: un día del diario o un menú ---------- */
function contenedor(t) {
  return t.kind === "dia" ? C.S.diario.find(d => d.fecha === t.fecha) || null : C.S.menus.find(m => m.id === t.id) || null;
}
function normalizar(c) { c.comidas = c.comidas || {}; COMIDAS.forEach(m => { if (!Array.isArray(c.comidas[m.k])) c.comidas[m.k] = []; }); return c; }
function asegurar(t) {
  let c = contenedor(t);
  if (!c && t.kind === "dia") { c = { fecha: t.fecha, origen: null, comidas: vacias() }; C.S.diario.push(c); }
  return c ? normalizar(c) : null;
}
const vacio = c => !c || COMIDAS.every(m => !((c.comidas || {})[m.k] || []).length);
function guardarCont(t) {
  const c = contenedor(t); if (!c) return;
  const u = C.S.user.uid;
  if (t.kind === "dia") {
    if (vacio(c)) { C.S.diario = C.S.diario.filter(x => x !== c); C.DB.borrarDoc(u, "diario", t.fecha).catch(fallo); return; }
    C.DB.guardarDoc(u, "diario", t.fecha, limpio(c)).catch(fallo);
  } else C.DB.guardarDoc(u, "menus", c.id, limpio(c)).catch(fallo);
}
const guardarAlimento = a => C.DB.guardarDoc(C.S.user.uid, "alimentos", a.id, limpio(a)).catch(fallo);
const guardarCompra = () => C.DB.guardarDoc(C.S.user.uid, "compra", "actual", limpio(C.S.compra)).catch(fallo);
/* Tras cambiar un producto o plato: recalcula los platos y guarda los que cambien */
function recalcularYGuardar(extra = []) {
  const cambiados = new Set([...K.recalcPlatos(C.S.alimentos), ...extra]);
  cambiados.forEach(guardarAlimento);
}

/* ---------- hojas (ventanas inferiores) ---------- */
let hojaEnHistorial = false;
function abrirHoja(h) {
  F.hoja = h;
  if (!hojaEnHistorial) { history.pushState({ vitaHoja: 1 }, ""); hojaEnHistorial = true; }
  pintarHoja();
}
function cerrarHoja() {
  pararCamara();
  F.hoja = null; pintarHoja();
  if (hojaEnHistorial) { hojaEnHistorial = false; history.back(); }
}
window.addEventListener("popstate", () => { if (F.hoja) { hojaEnHistorial = false; pararCamara(); F.hoja = null; pintarHoja(); } });
function pintarHoja() {
  const host = document.getElementById("hoja"); if (!host) return;
  document.body.classList.toggle("con-hoja", !!F.hoja);
  if (!F.hoja) { host.innerHTML = ""; return; }
  const cuerpo = { elegir: hElegir, libre: hLibre, copiarComida: hCopiarComida, cargarMenu: hCargarMenu, copiarDia: hCopiarDia,
    texto: hTexto, completar: hCompletar, producto: hProducto, plato: hPlato, confirmar: hConfirmar, compraAdd: hCompraAdd }[F.hoja.tipo]();
  host.innerHTML = `<div class="hoja-fondo" data-c="cerrar-hoja"></div>
    <div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(F.hoja.titulo || "")}">
      <div class="hoja-cab"><b>${esc(F.hoja.titulo || "")}</b><button class="icon-btn sm" data-c="cerrar-hoja" aria-label="Cerrar">${C.icon("cerrar", 18)}</button></div>
      <div class="hoja-cuerpo">${cuerpo}</div></div>`;
  // Cada campo marcado se enfoca solo la primera vez que aparece en esta hoja
  const foco = host.querySelector("[data-foco]");
  const clave = foco && (foco.id || foco.name);
  F.hoja._enfocados = F.hoja._enfocados || [];
  if (foco && !F.hoja._enfocados.includes(clave)) { F.hoja._enfocados.push(clave); setTimeout(() => { foco.focus(); if (foco.select) foco.select(); }, 60); }
}
export function confirmar(titulo, texto, boton, accion, peligro = true) {
  abrirHoja({ tipo: "confirmar", titulo, texto, boton, accion, peligro, previa: F.hoja && F.hoja.tipo !== "confirmar" ? F.hoja : null });
}

/* ================= vista principal ================= */
export function vista() {
  const subs = [["diario", "Diario"], ["semana", "Semana"], ["menus", "Menús"], ["alimentos", "Alimentos"], ["compra", "Compra"]];
  const cuerpo = { diario: vDiario, semana: vSemana, menus: vMenus, alimentos: vAlimentos, compra: vCompra }[F.sub]();
  return `<div class="label">Comida</div>
  <div class="seg seg5" role="tablist">${subs.map(([k, n]) => `<button data-csub="${k}" aria-pressed="${F.sub === k}">${n}</button>`).join("")}</div>
  ${cuerpo}`;
}

/* ---------- resumen frente al objetivo ---------- */
function barra(nombre, valor, meta, color, u = "g") {
  const pct = meta > 0 ? valor / meta * 100 : 0;
  return `<div class="mbar">
    <div class="mbar-top"><span><i class="dot" style="background:${color}"></i>${nombre}</span><span><b style="color:${color}">${f1(valor)}</b> <span class="muted">/ ${f1(meta)} ${u}</span></span></div>
    <div class="mbar-pista"><i style="width:${Math.min(pct, 100)}%;background:${color}"></i>${pct > 100 ? `<i class="mbar-exceso" style="width:${Math.min(pct - 100, 100)}%"></i>` : ""}</div></div>`;
}
function resumen(c, t, conCompletar) {
  const mp = mapa(), tot = K.totalComidas(c ? c.comidas : {}, mp), o = objetivo();
  const pct = o.kcal > 0 ? tot.kcal / o.kcal * 100 : 0, resto = o.kcal - tot.kcal;
  const col = pct > 105 ? "var(--bad)" : pct >= 95 ? "var(--ok)" : "var(--acc)";
  const cs = K.costeComidas(c ? c.comidas : {}, mp);
  const peso = C.peso();
  return `<div class="card" data-sec="resumen"><p class="card-title">Resumen</p>
    <div class="kcal-hero"><div><b class="mono" style="color:${col}">${f0(tot.kcal)}</b><span class="muted"> de ${f0(o.kcal)} kcal</span></div>
      <div class="kcal-resto"><span class="muted">${resto >= 0 ? "faltan" : "sobran"}</span><b class="mono">${f0(Math.abs(resto))}</b></div></div>
    <div class="mbar-pista grande"><i style="width:${Math.min(pct, 100)}%;background:${col}"></i></div>
    ${MAC.map(x => barra(x.n, tot[x.k], o[x.k], x.c)).join("")}
    ${peso ? `<p class="muted" style="margin:0">Proteína: ${f1(tot.prot / peso)} g/kg de ${f1(o.prot / peso)} g/kg (peso de cálculo ${f1(peso)} kg).</p>` : ""}
    ${cs.coste > 0 ? `<div class="row"><span>Coste aproximado</span><span>${eur(cs.coste)}${cs.sinPrecio ? ` <span class="muted">· ${cs.sinPrecio} sin precio</span>` : ""}</span></div>` : ""}
    ${o.avisos.length ? `<p class="err" style="margin:0">${esc(o.avisos.join(" "))}</p>` : ""}
    ${conCompletar ? `<div class="btn-row"><button class="btn" data-c="completar">${C.icon("objetivo", 18)}Completar el objetivo</button></div>` : ""}
  </div>`;
}
/* Las cinco comidas con sus alimentos (sirve para un día o para un menú) */
function bloqueComidas(c, t) {
  const mp = mapa(), o = objetivo(), rep = C.S.ajustes.objetivo.reparto || {};
  const tk = t.kind === "dia" ? `dia` : `menu:${t.id}`;
  return COMIDAS.map(m => {
    const items = c ? c.comidas[m.k] || [] : [];
    const tm = K.totalItems(items, mp), meta = o.kcal * (rep[m.k] || 0) / 100;
    return `<div class="card franja comida-card" style="--franja:${COLOR_COMIDA[m.k]}" data-sec="${t.kind === "dia" ? "c-" + m.k : "m-" + m.k}">
      <p class="card-title comida-tit"><span>${m.n}</span><span class="comida-kcal"><b>${f0(tm.kcal)}</b> / ${f0(meta)} kcal</span></p>
      ${items.length ? `<div class="items">${items.map((it, i) => {
        const mm = K.macrosItem(it, mp);
        if (it.libre) return `<button class="item" data-c="editar-libre" data-t="${tk}" data-m="${m.k}" data-i="${i}">
          <span class="item-main"><b>${esc(it.nombre || "Comida fuera")} <span class="tag line">fuera</span></b>${pastillas(mm)}</span><span class="item-kcal mono">${f0(mm.kcal)}</span></button>`;
        const a = mp[it.id];
        if (!a) return `<div class="item"><span class="item-main"><b class="muted">Alimento borrado</b></span><button class="icon-btn sm danger" data-c="quitar-item" data-t="${tk}" data-m="${m.k}" data-i="${i}" aria-label="Quitar">${C.icon("papelera", 16)}</button></div>`;
        return `<button class="item" data-c="editar-item" data-t="${tk}" data-m="${m.k}" data-i="${i}">
          <span class="item-main"><b>${esc(a.nombre)}</b><span class="muted">${cantidadTxt(a, it.g)}</span>${pastillas(mm)}</span><span class="item-kcal mono">${f0(mm.kcal)}</span></button>`;
      }).join("")}</div>` : `<p class="muted" style="margin:0">Sin nada apuntado.</p>`}
      <div class="btn-row acciones-comida">
        <button class="btn sm" data-c="anadir" data-t="${tk}" data-m="${m.k}">${C.icon("mas", 16)}Alimento</button>
        <button class="btn sm" data-c="libre" data-t="${tk}" data-m="${m.k}">Fuera</button>
        <button class="btn sm" data-c="copiar-comida" data-t="${tk}" data-m="${m.k}">${C.icon("copiar", 16)}Copiar</button>
        ${items.length ? `<button class="btn sm" data-c="guardar-comida" data-t="${tk}" data-m="${m.k}">Guardar</button>` : ""}
      </div></div>`;
  }).join("");
}
const objetivoDe = tk => tk === "dia" ? { kind: "dia", fecha: F.fecha } : { kind: "menu", id: tk.slice(5) };

/* ---------- diario ---------- */
function vDiario() {
  const t = { kind: "dia", fecha: F.fecha }, d = contenedor(t);
  const mp = mapa(), o = objetivo();
  const recientes = C.S.diario.filter(x => !vacio(x)).sort((a, b) => a.fecha < b.fecha ? 1 : -1).slice(0, 7);
  return `<div class="card">
    <div class="fecha-nav">
      <button class="icon-btn sm" data-c="dia" data-n="-1" aria-label="Día anterior">${C.icon("izq", 18)}</button>
      <input type="date" id="c-fecha" value="${F.fecha}" aria-label="Fecha del diario">
      <button class="icon-btn sm" data-c="dia" data-n="1" aria-label="Día siguiente">${C.icon("der", 18)}</button>
      ${F.fecha !== hoyISO() ? `<button class="btn sm" data-c="hoy">Hoy</button>` : `<span class="chip">hoy</span>`}
    </div>
    ${d && d.origen ? `<p class="muted" style="margin:0">Copiado de «${esc(d.origen)}». Lo que cambies aquí no toca el original.</p>` : ""}
    <div class="btn-row">
      <button class="btn sm" data-c="cargar-menu">Cargar menú</button>
      <button class="btn sm" data-c="copiar-dia">${C.icon("copiar", 16)}Copiar otro día</button>
      ${!vacio(d) ? `<button class="btn sm" data-c="dia-a-menu">Guardar como menú</button>
      <button class="btn sm danger" data-c="vaciar-dia">${C.icon("papelera", 16)}Vaciar</button>` : ""}
    </div></div>
  ${resumen(d, t, true)}
  ${bloqueComidas(d, t)}
  ${recientes.length ? `<div class="card" data-sec="recientes"><p class="card-title">Últimos días con registro</p>
    ${recientes.map(x => { const tt = K.totalComidas(x.comidas, mp), dif = tt.kcal - o.kcal;
      return `<button class="item" data-c="ir-dia" data-f="${x.fecha}"><span class="item-main"><b>${esc(C.fecha(x.fecha))}</b><span class="muted">${x.origen ? esc(x.origen) : "suelto"}</span></span>
        <span class="mono">${f0(tt.kcal)}<small class="${dif > 0 ? "sube" : "baja"}"> ${dif > 0 ? "+" : "−"}${f0(Math.abs(dif))}</small></span></button>`; }).join("")}</div>` : ""}`;
}

/* ---------- semana ---------- */
function vSemana() {
  if (!F.semana) F.semana = lunesDe(hoyISO());
  const mp = mapa(), o = objetivo(), peso = C.peso();
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(F.semana, i)).map(f => {
    const d = C.S.diario.find(x => x.fecha === f);
    if (vacio(d)) return { f, vacio: true };
    const t = K.totalComidas(d.comidas, mp), cs = K.costeComidas(d.comidas, mp);
    return { f, t, pct: o.kcal > 0 ? t.kcal / o.kcal * 100 : 0, cs };
  });
  const con = dias.filter(x => !x.vacio);
  const media = k => con.length ? con.reduce((s, x) => s + x.t[k], 0) / con.length : 0;
  const dentro = con.filter(x => Math.abs(x.pct - 100) <= 10).length;
  const coste = con.reduce((s, x) => s + x.cs.coste, 0);
  const max = Math.max(o.kcal * 1.15, ...con.map(x => x.t.kcal), 1);
  const colPct = p => p > 110 ? "var(--bad)" : p >= 90 ? "var(--ok)" : "var(--acc)";
  const L = ["L", "M", "X", "J", "V", "S", "D"];
  return `<div class="card">
    <div class="fecha-nav">
      <button class="icon-btn sm" data-c="semana" data-n="-1" aria-label="Semana anterior">${C.icon("izq", 18)}</button>
      <div style="flex:1;text-align:center"><b>${esc(C.fecha(F.semana))} – ${esc(C.fecha(sumarDias(F.semana, 6)))}</b><div class="muted">${con.length} días con registro</div></div>
      <button class="icon-btn sm" data-c="semana" data-n="1" aria-label="Semana siguiente">${C.icon("der", 18)}</button>
    </div>
    ${F.semana !== lunesDe(hoyISO()) ? `<div class="btn-row"><button class="btn sm" data-c="semana-actual">Semana actual</button></div>` : ""}
  </div>
  <div class="card" data-sec="sem-graf"><p class="card-title">Calorías por día</p>
    <div class="sem-graf">${dias.map((x, i) => `<button class="sem-dia" data-c="ir-dia" data-f="${x.f}" aria-label="${esc(C.fecha(x.f))}">
      <span class="sem-barra">${x.vacio ? "" : `<i class="sem-fill" style="height:${Math.max(3, x.t.kcal / max * 100)}%;background:${colPct(x.pct)}"></i>`}<i class="sem-obj" style="bottom:${o.kcal / max * 100}%"></i></span>
      <span class="sem-num mono">${x.vacio ? "–" : f0(x.t.kcal)}</span><span class="sem-lb">${L[i]}</span></button>`).join("")}</div>
    <p class="muted" style="margin:0">La raya marca tu objetivo (${f0(o.kcal)} kcal). Toca un día para abrirlo en el diario.</p></div>
  <div class="card" data-sec="sem-medias"><p class="card-title">Medias de la semana</p>
    ${con.length ? `<div class="row"><span>Calorías</span><span><b>${f0(media("kcal"))}</b> kcal</span></div>
    ${MAC.map(x => `<div class="row"><span><i class="dot" style="background:${x.c}"></i> ${x.n}</span><span><b>${f1(media(x.k))}</b> / ${f1(o[x.k])} g</span></div>`).join("")}
    ${peso ? `<div class="row"><span>Proteína por kilo</span><span><b>${f1(media("prot") / peso)}</b> g/kg</span></div>` : ""}
    <div class="row"><span>Días dentro del ±10 %</span><span style="color:${dentro / con.length >= 0.7 ? "var(--ok)" : "var(--warn)"}"><b>${dentro}</b> de ${con.length}</span></div>
    ${coste > 0 ? `<div class="row"><span>Coste medio al día</span><span>${eur(coste / con.length)} <span class="muted">· total ${eur(coste)}</span></span></div>` : ""}`
    : `<p class="muted" style="margin:0">Sin días registrados esta semana.</p>`}</div>`;
}

/* ---------- menús ---------- */
function ambito(m) {
  const ll = COMIDAS.filter(x => ((m.comidas || {})[x.k] || []).length);
  if (!ll.length) return "Vacío";
  if (ll.length === COMIDAS.length) return "Día completo";
  return ll.map(x => x.n).join(" + ");
}
function vMenus() {
  const mp = mapa();
  if (F.menuAbierto) {
    const m = C.S.menus.find(x => x.id === F.menuAbierto);
    if (m) {
      normalizar(m);
      const t = { kind: "menu", id: m.id };
      return `<div class="card">
        <button class="btn sm" data-c="menus-volver" style="align-self:flex-start">${C.icon("izq", 16)}Todos los menús</button>
        <label class="campo">Nombre del menú<input id="c-menu-nombre" value="${esc(m.nombre)}"></label>
        <div class="btn-row">
          <button class="btn sm" data-c="menu-duplicar">${C.icon("copiar", 16)}Duplicar</button>
          <button class="btn sm" data-c="menu-a-compra">Añadir a la compra</button>
          <button class="btn sm danger" data-c="menu-borrar">${C.icon("papelera", 16)}Borrar</button>
        </div></div>
      ${resumen(m, t, true)}${bloqueComidas(m, t)}`;
    }
    F.menuAbierto = null;
  }
  const lista = C.S.menus.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return `<div class="card"><p class="muted" style="margin:0">Plantillas de un día completo o de una sola comida. Cargarlas en el diario no las cambia.</p>
    <div class="btn-row"><button class="btn primary" data-c="menu-nuevo">${C.icon("mas", 18)}Nuevo menú</button></div></div>
  ${lista.length ? `<div class="card" data-sec="menus-lista"><p class="card-title">Biblioteca (${lista.length})</p>${lista.map(m => {
    const t = K.totalComidas(m.comidas, mp);
    return `<button class="item" data-c="menu-abrir" data-id="${m.id}"><span class="item-main"><b>${esc(m.nombre)}</b><span class="muted">${esc(ambito(m))}</span>${pastillas(t)}</span><span class="item-kcal mono">${f0(t.kcal)}</span></button>`;
  }).join("")}</div>` : `<div class="card vacio"><p>Aún no tienes menús.</p></div>`}`;
}

/* ---------- alimentos ---------- */
function filtrarAlimentos() {
  const q = F.q.trim().toLowerCase();
  let l = activos();
  if (F.tipo !== "todos") l = l.filter(a => F.tipo === "plato" ? K.esPlato(a) : !K.esPlato(a));
  if (F.superF !== "todos") l = l.filter(a => !K.esPlato(a) && (a.super || "generico") === F.superF);
  if (F.sinPrecio) l = l.filter(a => K.esPlato(a) ? a.precioIncompleto : !(K.num(a.precio) > 0));
  if (q) l = l.filter(a => a.nombre.toLowerCase().includes(q) || String(a.codigo || "").includes(q) || (!K.esPlato(a) && (SUPER_INFO[a.super] || {}).n?.toLowerCase().includes(q)));
  const dens = (a, k) => K.num(a.kcal) > 0 ? K.num(a[k]) / K.num(a.kcal) * 100 : 0;
  const ord = { nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"), prot: (a, b) => dens(b, "prot") - dens(a, "prot"),
    hid: (a, b) => dens(b, "hid") - dens(a, "hid"), kcal: (a, b) => K.num(b.kcal) - K.num(a.kcal),
    precio: (a, b) => (K.num(a.precio) || 1e9) - (K.num(b.precio) || 1e9) }[F.orden];
  return l.sort(ord);
}
function listaAlimentosHTML() {
  const l = filtrarAlimentos();
  if (!l.length) return `<p class="muted">Nada coincide con los filtros.</p>`;
  return `<p class="muted" style="margin:0">${l.length} de ${activos().length}</p>` + l.map(a => {
    const u = K.unidad(a);
    const extra = F.orden === "prot" && K.num(a.kcal) > 0 ? `<span class="mp" style="--c:var(--prot)">${f1(a.prot / a.kcal * 100)} g P/100 kcal</span>`
      : F.orden === "hid" && K.num(a.kcal) > 0 ? `<span class="mp" style="--c:var(--hid)">${f1(a.hid / a.kcal * 100)} g H/100 kcal</span>` : "";
    return `<button class="item franja" style="--franja:${K.esPlato(a) ? "#FF9F43" : (SUPER_INFO[a.super] || SUPER_INFO.generico).c}" data-c="${K.esPlato(a) ? "abrir-plato" : "abrir-producto"}" data-id="${a.id}">
      <span class="item-main"><b>${a.codigo ? `<span class="muted mono cod">#${esc(a.codigo)}</span> ` : ""}${esc(a.nombre)}</b>
        <span class="tags">${superTag(a)}${K.num(a.precio) > 0 ? `<span class="tag line">${eur(K.num(a.precio))}/${u === "ml" ? "L" : "kg"}${a.precioIncompleto ? " ?" : ""}</span>` : ""}</span>
        <span class="mps">${pills(a, true)}${extra}</span></span>
      <span class="item-kcal mono">${f0(a.kcal)}<small>/100 ${u}</small></span></button>`;
  }).join("");
}
function vAlimentos() {
  return `<div class="card">
    <div class="btn-row"><button class="btn primary" data-c="nuevo-producto">${C.icon("mas", 18)}Producto</button><button class="btn primary" data-c="nuevo-plato">${C.icon("mas", 18)}Plato</button></div>
    <input class="buscar" id="c-buscar" placeholder="Buscar por nombre, súper o código" value="${esc(F.q)}" autocomplete="off" aria-label="Buscar alimento">
    <div class="seg"><button data-c="tipo" data-v="todos" aria-pressed="${F.tipo === "todos"}">Todos</button><button data-c="tipo" data-v="basico" aria-pressed="${F.tipo === "basico"}">Productos</button><button data-c="tipo" data-v="plato" aria-pressed="${F.tipo === "plato"}">Platos</button></div>
    <div class="grid2">
      <label class="campo">Dónde se compra<select id="c-super"><option value="todos">Cualquier sitio</option>${SUPERS.map(s => `<option value="${s}" ${F.superF === s ? "selected" : ""}>${SUPER_INFO[s].n}</option>`).join("")}</select></label>
      <label class="campo">Ordenar por<select id="c-orden">${Object.entries(ORDENES).map(([k, n]) => `<option value="${k}" ${F.orden === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    </div>
    <label class="check"><input type="checkbox" id="c-sinprecio" ${F.sinPrecio ? "checked" : ""}><span>Solo los que no tienen precio</span></label>
  </div>
  <div class="card lista-alimentos" id="c-lista">${listaAlimentosHTML()}</div>
  <div class="card" data-sec="base" data-plegada="1"><p class="card-title">Alimentos base</p>
    <p class="muted" style="margin:0">Los ${C.baseTotal} productos de tu hoja de Drive. Los nuevos entran solos al actualizar la app; lo que borres no vuelve, salvo que lo repongas aquí.</p>
    <div class="btn-row"><button class="btn sm" data-c="reponer-base">Reponer alimentos base</button></div></div>`;
}

/* ---------- compra ---------- */
function vCompra() {
  const compra = C.S.compra = C.S.compra || { items: [], marcados: [] };
  const mp = mapa();
  const items = (compra.items || []).filter(i => i.tipo === "plato" ? mp[i.id] : C.S.menus.some(m => m.id === i.id));
  const marcados = new Set(compra.marcados || []);
  const porSuper = K.calcularCompra({ items }, C.S.alimentos, C.S.menus);
  const claves = SUPERS.filter(s => porSuper[s] && porSuper[s].length);
  let total = 0, sinPrecio = 0, lineas = 0, hechas = 0;
  claves.forEach(s => porSuper[s].forEach(x => { lineas++; if (marcados.has(x.a.id)) hechas++; if (K.num(x.a.precio) > 0) total += K.coste(x.a, x.g); else sinPrecio++; }));
  const cant = (a, g) => { const u = K.unidad(a); return g >= 1000 ? `${f1(g / 1000)} ${u === "ml" ? "L" : "kg"}` : `${f0(g)} ${u}`; };
  return `<div class="card" data-sec="compra-sel"><p class="card-title">Qué vas a cocinar</p>
    ${items.length ? items.map(it => {
      const o = it.tipo === "plato" ? mp[it.id] : C.S.menus.find(m => m.id === it.id);
      const idx = compra.items.indexOf(it);
      return `<div class="item"><span class="item-main"><b>${esc(o.nombre)}</b><span class="muted">${it.tipo === "plato" ? "plato · raciones" : "menú · veces"}</span></span>
        <input class="num" inputmode="decimal" data-ccant="${idx}" value="${String(it.cant).replace(".", ",")}" aria-label="Cantidad de ${esc(o.nombre)}">
        <button class="icon-btn sm danger" data-c="compra-quitar" data-i="${idx}" aria-label="Quitar ${esc(o.nombre)}">${C.icon("cerrar", 16)}</button></div>`;
    }).join("") : `<p class="muted" style="margin:0">Elige los platos o menús que vas a cocinar y la lista sale sola.</p>`}
    <div class="btn-row"><button class="btn sm" data-c="compra-add" data-v="plato">${C.icon("mas", 16)}Plato</button><button class="btn sm" data-c="compra-add" data-v="menu">${C.icon("mas", 16)}Menú</button></div></div>
  ${claves.length ? `<div class="card" data-sec="compra-lista"><p class="card-title">Lista de la compra</p>
    ${claves.map(s => `<div class="sub-label" style="--c:${SUPER_INFO[s].c}"><i class="dot" style="background:${SUPER_INFO[s].c}"></i>${SUPER_INFO[s].n}</div>
      ${porSuper[s].map(x => { const ok = marcados.has(x.a.id), c = K.coste(x.a, x.g);
        return `<button class="item compra-item ${ok ? "hecho" : ""}" data-c="compra-marcar" data-id="${x.a.id}" aria-pressed="${ok}">
          <span class="caja">${ok ? C.icon("check", 16) : ""}</span><span class="item-main"><b>${esc(x.a.nombre)}</b>${c > 0 ? `<span class="muted">${eur(c)}</span>` : ""}</span>
          <span class="mono">${cant(x.a, x.g)}</span></button>`; }).join("")}`).join("")}
    <p class="muted" style="margin:0">${hechas} de ${lineas} hechas${total > 0 ? ` · ${eur(total)}${sinPrecio ? ` (parcial: ${sinPrecio} sin precio)` : ""}` : ""}. Cantidades en crudo, sin descontar lo que tengas en casa.</p>
    <div class="btn-row"><button class="btn sm" data-c="compra-copiar">${C.icon("copiar", 16)}Copiar lista</button><button class="btn sm danger" data-c="compra-vaciar">${C.icon("papelera", 16)}Vaciar</button></div></div>` : ""}`;
}

/* ================= hojas ================= */
function hojaItem(tk, meal, idx) {
  const t = objetivoDe(tk), c = contenedor(t);
  return { t, meal, idx, it: c && idx !== null ? c.comidas[meal][idx] : null };
}

/* --- añadir o editar un alimento en una comida --- */
const hist = () => K.historialPorciones(C.S.diario, sumarDias(hoyISO(), -180));
function listaElegir() {
  const h = F.hoja, q = (h.q || "").trim().toLowerCase(), H = hist();
  let l = activos();
  if (q) l = l.filter(a => a.nombre.toLowerCase().includes(q) || String(a.codigo || "").includes(q));
  const usos = a => (H[a.id] && H[a.id].comidas[h.meal]) || 0;
  const habituales = q ? [] : l.filter(a => usos(a) > 0).sort((a, b) => usos(b) - usos(a)).slice(0, 8);
  const resto = l.filter(a => !habituales.includes(a)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).slice(0, 80);
  const fila = a => `<button class="item" data-c="elegir-id" data-id="${a.id}"><span class="item-main"><b>${esc(a.nombre)}</b><span class="tags">${superTag(a)}</span></span><span class="item-kcal mono">${f0(a.kcal)}<small>/100</small></span></button>`;
  return (habituales.length ? `<div class="sub-label">Lo que sueles tomar en ${nombreComida(h.meal).toLowerCase()}</div>${habituales.map(fila).join("")}<div class="sub-label">Todos</div>` : "")
    + (resto.length ? resto.map(fila).join("") : `<p class="muted">Nada coincide.</p>`);
}
function hElegir() {
  const h = F.hoja;
  if (!h.id) return `<input class="buscar" id="h-q" data-foco placeholder="Buscar alimento o plato" value="${esc(h.q || "")}" autocomplete="off" aria-label="Buscar">
    <div class="lista" id="h-lista">${listaElegir()}</div>`;
  const a = mapa()[h.id], f = K.factorDe(a), u = K.unidad(a), H = hist()[a.id];
  const racion = K.esPlato(a) && K.num(a.pesoTotal) > 0 ? Math.round(a.pesoTotal / (K.num(a.raciones) || 1)) : 0;
  const tuyas = H ? [...new Set(H.valores.map(v => Math.round(v)))].sort((x, y) => H.valores.filter(v => Math.round(v) === y).length - H.valores.filter(v => Math.round(v) === x).length).slice(0, 3).sort((x, y) => x - y) : [];
  const atajos = [...new Set([...tuyas, ...(tuyas.length ? [] : [50, 100, 150, 200])])];
  return `<div class="item-sel"><b>${esc(a.nombre)}</b>${h.idx === null ? `<button class="btn sm" data-c="elegir-otro">Cambiar</button>` : ""}</div>
    ${f ? `<div class="seg"><button data-c="modo-peso" data-v="crudo" aria-pressed="${h.modo !== "cocinado"}">Pesado en crudo</button><button data-c="modo-peso" data-v="cocinado" aria-pressed="${h.modo === "cocinado"}">Ya cocinado</button></div>` : ""}
    <label class="campo">Cantidad en ${u}${f && h.modo === "cocinado" ? " (cocinado)" : ""}<input id="h-g" data-foco inputmode="decimal" value="${String(h.g ?? 100).replace(".", ",")}"></label>
    <div class="chips">${atajos.map(g => `<button class="chip" data-c="poner-g" data-v="${g}">${g} ${u}</button>`).join("")}${racion ? `<button class="chip" data-c="poner-g" data-v="${racion}">1 ración (${racion} g)</button>` : ""}</div>
    ${tuyas.length ? `<p class="muted" style="margin:0">Los primeros atajos son las cantidades que más usas.</p>` : ""}
    <div id="h-prev">${prevCantidad()}</div>
    <div class="btn-row">${h.idx !== null ? `<button class="btn danger" data-c="quitar-item-hoja">${C.icon("papelera", 16)}Quitar</button>` : ""}
      <button class="btn primary" data-c="confirmar-item">${h.idx !== null ? "Guardar" : `Añadir a ${nombreComida(h.meal).toLowerCase()}`}</button></div>`;
}
function gramosGuardar() {
  const h = F.hoja, a = mapa()[h.id], f = K.factorDe(a), g = K.num(h.g);
  return h.modo === "cocinado" && f ? g / f : g;
}
function prevCantidad() {
  const h = F.hoja, a = mapa()[h.id], f = K.factorDe(a), u = K.unidad(a);
  const crudo = gramosGuardar(), m = K.macrosDe(a, crudo);
  return `<div class="prev"><span class="mono acc">${f0(m.kcal)} kcal</span>${pastillas(m, true)}</div>
    ${f ? `<p class="muted" style="margin:0">${h.modo === "cocinado" ? `Se guardan <b>${f0(crudo)} ${u}</b> en crudo (factor ${f1(f)}).` : `Ya hecho serán unos <b>${f0(K.num(h.g) * f)} ${u}</b>.`}</p>` : ""}`;
}

/* --- comida fuera --- */
function hLibre() {
  const v = F.hoja.it || {};
  const campo = (k, n) => `<label class="campo">${n}<input name="${k}" inputmode="decimal" value="${v[k] != null && v[k] !== 0 ? String(v[k]).replace(".", ",") : ""}"></label>`;
  return `<form id="h-libre" class="pila-form">
    <p class="muted" style="margin:0">Valores TOTALES de lo que comiste (no por 100 g). Es una estimación y no entra en la lista de la compra.</p>
    <label class="campo">Qué fue<input name="nombre" data-foco value="${esc(v.nombre || "")}" placeholder="Menú del día, bocadillo…"></label>
    <div class="grid2">${campo("kcal", "Calorías")}${campo("precio", "Importe € (opcional)")}${campo("prot", "Proteína g")}${campo("hid", "Hidratos g")}${campo("gra", "Grasas g")}${campo("fib", "Fibra g")}</div>
    <div class="btn-row">${F.hoja.idx !== null ? `<button class="btn danger" type="button" data-c="quitar-item-hoja">${C.icon("papelera", 16)}Quitar</button>` : ""}<button class="btn primary" type="submit">Guardar</button></div></form>`;
}

/* --- copiar una comida desde otro día o un menú --- */
function hCopiarComida() {
  const h = F.hoja, mp = mapa(), k = h.meal;
  const nombres = items => items.map(it => it.libre ? it.nombre || "fuera" : (mp[it.id] || {}).nombre).filter(Boolean).join(", ");
  const menus = C.S.menus.filter(m => ((m.comidas || {})[k] || []).length).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const dias = C.S.diario.filter(d => ((d.comidas || {})[k] || []).length && !(h.t.kind === "dia" && d.fecha === h.t.fecha)).sort((a, b) => a.fecha < b.fecha ? 1 : -1).slice(0, 14);
  const fila = (tipo, id, titulo, items) => `<button class="item" data-c="aplicar-copia-comida" data-v="${tipo}" data-id="${id}"><span class="item-main"><b>${esc(titulo)}</b><span class="muted">${esc(nombres(items).slice(0, 90))}</span></span><span class="item-kcal mono">${f0(K.totalItems(items, mp).kcal)}</span></button>`;
  return `<p class="muted" style="margin:0">Se añade a lo que ya haya en ${nombreComida(k).toLowerCase()}.</p>
    ${menus.length ? `<div class="sub-label">De la biblioteca</div>${menus.map(m => fila("menu", m.id, m.nombre, m.comidas[k])).join("")}` : ""}
    ${dias.length ? `<div class="sub-label">De otro día</div>${dias.map(d => fila("dia", d.fecha, C.fecha(d.fecha), d.comidas[k])).join("")}` : ""}
    ${!menus.length && !dias.length ? `<p class="muted">No hay ninguna ${nombreComida(k).toLowerCase()} guardada todavía.</p>` : ""}`;
}
function hCargarMenu() {
  const mp = mapa();
  const l = C.S.menus.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (!l.length) return `<p class="muted">Aún no tienes menús en la biblioteca.</p>`;
  return `<p class="muted" style="margin:0">Un menú de día completo sustituye el día; uno parcial solo sustituye sus comidas.</p>` + l.map(m => `<button class="item" data-c="aplicar-menu" data-id="${m.id}"><span class="item-main"><b>${esc(m.nombre)}</b><span class="muted">${esc(ambito(m))}</span></span><span class="item-kcal mono">${f0(K.totalComidas(m.comidas, mp).kcal)}</span></button>`).join("");
}
function hCopiarDia() {
  const mp = mapa();
  const l = C.S.diario.filter(d => d.fecha !== F.fecha && !vacio(d)).sort((a, b) => a.fecha < b.fecha ? 1 : -1).slice(0, 21);
  if (!l.length) return `<p class="muted">No hay otros días registrados.</p>`;
  return `<p class="muted" style="margin:0">Sustituye todo lo apuntado el ${esc(C.fecha(F.fecha))}.</p>` + l.map(d => `<button class="item" data-c="aplicar-dia" data-f="${d.fecha}"><span class="item-main"><b>${esc(C.fecha(d.fecha))}</b><span class="muted">${d.origen ? esc(d.origen) : "suelto"}</span></span><span class="item-kcal mono">${f0(K.totalComidas(d.comidas, mp).kcal)}</span></button>`).join("");
}
function hTexto() {
  return `<form id="h-texto" class="pila-form"><label class="campo">${esc(F.hoja.etiqueta || "Nombre")}<input name="v" data-foco value="${esc(F.hoja.valor || "")}"></label>
    <div class="btn-row"><button class="btn primary" type="submit">${esc(F.hoja.boton || "Guardar")}</button></div></form>`;
}
function hConfirmar() {
  const h = F.hoja;
  return `<p style="margin:0;white-space:pre-line">${esc(h.texto)}</p>
    <div class="btn-row"><button class="btn" data-c="confirmar-no">Cancelar</button><button class="btn ${h.peligro ? "danger" : "primary"}" data-c="confirmar-si">${esc(h.boton)}</button></div>`;
}
function hCompraAdd() {
  const mp = mapa(), tipo = F.hoja.v;
  const l = tipo === "plato" ? activos().filter(K.esPlato).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) : C.S.menus.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (!l.length) return `<p class="muted">${tipo === "plato" ? "Aún no tienes platos." : "Aún no tienes menús."}</p>`;
  return l.map(o => `<button class="item" data-c="compra-elegir" data-id="${o.id}"><span class="item-main"><b>${esc(o.nombre)}</b><span class="muted">${tipo === "plato" ? `${f0(K.num(o.pesoTotal) / (K.num(o.raciones) || 1))} g por ración` : esc(ambito(o))}</span></span><span class="item-kcal mono">${f0(tipo === "plato" ? o.kcal * (K.num(o.pesoTotal) / (K.num(o.raciones) || 1)) / 100 : K.totalComidas(o.comidas, mp).kcal)}</span></button>`).join("");
}

/* --- completar el objetivo --- */
function hCompletar() {
  const h = F.hoja, mp = mapa(), o = objetivo(), c = contenedor(h.t);
  const tot = K.totalComidas(c ? c.comidas : {}, mp);
  const hueco = { kcal: o.kcal - tot.kcal, prot: o.prot - tot.prot, hid: o.hid - tot.hid, gra: o.gra - tot.gra };
  const ops = K.completarObjetivo({ hueco, obj: o, alimentos: C.S.alimentos, hist: hist(), comida: h.meal, foco: h.foco, incluirTodos: h.todos });
  h.ops = ops;
  const focos = [[null, "Equilibrado"], ["prot", "Proteína"], ["hid", "Hidratos"], ["gra", "Grasas"], ["kcal", "Calorías"]];
  // En positivo, lo que falta; en negativo, lo que te pasas (en rojo, con «+»)
  const pill = (txt, v, col) => v < -0.5 ? `<span class="mp" style="--c:var(--bad)">${txt} +${txt === "kcal" ? f0(-v) : f1(-v)}</span>` : `<span class="mp" style="--c:${col}">${txt} ${txt === "kcal" ? f0(Math.max(0, v)) : f1(Math.max(0, v))}</span>`;
  const q = x => `<span class="mps">${pill("kcal", x.kcal, "var(--acc)")}${["prot", "hid", "gra"].map(k => { const m = MAC.find(y => y.k === k); return pill(m.l, x[k], m.c); }).join("")}</span>`;
  return `<div class="prev"><span class="muted">Te falta</span>${q(hueco)}</div>
    <p class="muted" style="margin:0">En rojo y con «+», lo que ya te pasas.</p>
    ${hueco.kcal <= 0 && hueco.prot <= 0 ? `<p class="muted">Ya has llegado al objetivo de calorías y de proteína.</p>` : ""}
    <div class="sub-label">Prioridad</div>
    <div class="chips">${focos.map(([k, n]) => `<button class="chip" data-c="comp-foco" data-v="${k || ""}" aria-pressed="${(h.foco || null) === k}">${n}</button>`).join("")}</div>
    <div class="sub-label">Añadirlo a</div>
    <div class="chips">${COMIDAS.map(m => `<button class="chip" data-c="comp-comida" data-v="${m.k}" aria-pressed="${h.meal === m.k}">${m.n}</button>`).join("")}</div>
    <label class="check"><input type="checkbox" id="h-todos" ${h.todos ? "checked" : ""}><span>Incluir alimentos que no sueles comer</span></label>
    ${ops.length ? `<p class="muted" style="margin:0">Combinaciones de 1 o 2 alimentos en cantidades que sueles tomar, ordenadas por lo bien que cierran el día sin pasarse.</p>
      ${ops.map((x, i) => `<div class="opcion">
        <div class="opcion-items">${x.items.map(it => `<div><b class="mono acc">${f0(it.g)} ${K.unidad(it.a)}</b> ${esc(it.a.nombre)}${K.factorDe(it.a) ? ` <span class="muted">(≈${f0(it.g * K.factorDe(it.a))} ${K.unidad(it.a)} hecho)</span>` : ""}</div>`).join("")}</div>
        <div class="muted">Aporta ${f0(x.add.kcal)} kcal · después queda</div>${q(x.queda)}
        <div class="btn-row"><button class="btn sm primary" data-c="comp-aplicar" data-i="${i}">Añadir a ${nombreComida(h.meal).toLowerCase()}</button></div></div>`).join("")}`
    : `<p class="muted">No encuentro ninguna combinación razonable con lo que sueles comer${h.todos ? "" : ". Prueba a incluir otros alimentos"}.</p>`}`;
}

/* --- ficha de producto --- */
function hProducto() {
  const h = F.hoja, v = h.datos;
  if (h.paso === "etiqueta") return `<p class="muted" style="margin:0">Pega el texto de la información nutricional por 100 g (de la web del súper o dictado). Funciona sin conexión.</p>
    <textarea id="h-etiqueta" data-foco rows="6" class="area" placeholder="Valor energético 1.550 kJ / 370 kcal&#10;Grasas 12 g, de las cuales saturadas 2 g&#10;Hidratos de carbono 60 g&#10;Fibra 5 g&#10;Proteínas 12 g">${esc(h.etiqueta || "")}</textarea>
    <div class="btn-row"><button class="btn" data-c="prod-volver">Volver</button><button class="btn primary" data-c="etiqueta-analizar">Analizar</button></div>
    ${h.leido ? `<div class="prev-tabla">${["kcal", "prot", "hid", "gra", "fib"].map(k => { const d = h.leido[k], n = { kcal: "Calorías", prot: "Proteínas", hid: "Hidratos", gra: "Grasas", fib: "Fibra" }[k];
      return `<div class="row"><span>${n}</span><span>${d ? `<b>${f1(d.v)}</b> ${k === "kcal" ? "kcal" : "g"}${d.dudoso ? ` <span style="color:var(--warn)">revisar</span>` : ""}` : `<span class="muted">no detectado</span>`}</span></div>`; }).join("")}
      <p class="muted" style="margin:0">Compruébalo con la etiqueta: «revisar» puede ser un valor de «de las cuales».</p>
      <div class="btn-row"><button class="btn primary" data-c="etiqueta-usar">Usar estos valores</button></div></div>` : ""}`;
  if (h.paso === "codigo") {
    const cam = "BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    return `<p class="muted" style="margin:0">Consulta Open Food Facts, una base de datos abierta que mantienen sus usuarios. Necesita conexión y conviene contrastar los valores con el envase.</p>
      <label class="campo">Número del código<input id="h-codigo" data-foco inputmode="numeric" value="${esc(h.codigo || "")}"></label>
      ${cam ? `<button class="btn" data-c="codigo-camara">Escanear con la cámara</button><video id="h-video" playsinline muted class="hide video"></video>` : `<p class="muted" style="margin:0">Este navegador no permite escanear con la cámara; teclea el número.</p>`}
      <div class="btn-row"><button class="btn" data-c="prod-volver">Volver</button><button class="btn primary" data-c="codigo-buscar">Buscar</button></div>
      <div id="h-off">${h.off ? offHTML(h.off) : ""}</div>`;
  }
  const campo = (k, n) => `<label class="campo">${n}<input name="${k}" inputmode="decimal" value="${v[k] != null && v[k] !== "" ? String(v[k]).replace(".", ",") : ""}"></label>`;
  return `<form id="h-producto" class="pila-form">
    <div class="btn-row"><button class="btn sm" type="button" data-c="prod-etiqueta">Pegar etiqueta</button><button class="btn sm" type="button" data-c="prod-codigo">Código de barras</button>${h.id ? `<button class="btn sm" type="button" data-c="prod-duplicar">${C.icon("copiar", 16)}Duplicar</button>` : ""}</div>
    <label class="campo">Nombre<input name="nombre" ${h.id ? "" : "data-foco"} value="${esc(v.nombre || "")}" required></label>
    <div class="grid2">
      <label class="campo">Dónde se compra<select name="super">${SUPERS.map(s => `<option value="${s}" ${v.super === s ? "selected" : ""}>${SUPER_INFO[s].n}</option>`).join("")}</select></label>
      <label class="campo">Se mide en<select name="unidad"><option value="g" ${v.unidad !== "ml" ? "selected" : ""}>gramos (g)</option><option value="ml" ${v.unidad === "ml" ? "selected" : ""}>mililitros (ml)</option></select></label>
      ${campo("precio", "Precio €/kg o €/L")}${campo("factor", "Factor de cocción")}
    </div>
    <p class="muted" style="margin:0">Factor = peso cocinado ÷ crudo (arroz ≈ 2,5; pasta ≈ 2,2; carne ≈ 0,75). Vacío si no cambia al cocinarlo.</p>
    <div class="sub-label">Valores por 100 ${v.unidad === "ml" ? "ml" : "g"}, como en la etiqueta</div>
    <div class="grid2">${campo("kcal", "Calorías")}${campo("prot", "Proteínas g")}${campo("hid", "Hidratos g")}${campo("gra", "Grasas g")}${campo("fib", "Fibra g")}</div>
    <div class="btn-row">${h.id ? `<button class="btn danger" type="button" data-c="prod-borrar">${C.icon("papelera", 16)}Borrar</button>` : ""}<button class="btn primary" type="submit">Guardar</button></div></form>`;
}
function offHTML(o) {
  if (o.error) return `<p class="muted">${esc(o.error)}</p>`;
  return `<div class="prev-tabla"><b>${esc(o.nombre || "Sin nombre")}</b>
    ${[["kcal", "Calorías", "kcal"], ["prot", "Proteínas", "g"], ["hid", "Hidratos", "g"], ["gra", "Grasas", "g"], ["fib", "Fibra", "g"]].map(([k, n, u]) => `<div class="row"><span>${n}</span><span>${o[k] != null ? `<b>${f1(o[k])}</b> ${u}` : `<span class="muted">sin dato</span>`}</span></div>`).join("")}
    <p class="muted" style="margin:0">Por 100 g, según Open Food Facts. Pueden estar incompletos o desactualizados.</p>
    <div class="btn-row"><button class="btn primary" data-c="codigo-usar">Usar estos valores</button></div></div>`;
}
function leerProducto() {
  const form = document.getElementById("h-producto"); if (!form) return;
  const fd = new FormData(form), v = F.hoja.datos;
  ["nombre", "super", "unidad", "precio", "factor", "kcal", "prot", "hid", "gra", "fib"].forEach(k => { v[k] = fd.get(k); });
}

/* --- plato --- */
function hPlato() {
  const h = F.hoja, v = h.datos, mp = mapa();
  if (h.buscando !== null && h.buscando !== undefined) {
    return `<input class="buscar" id="h-qing" data-foco placeholder="Buscar ingrediente" value="${esc(h.qIng || "")}" autocomplete="off" aria-label="Buscar ingrediente">
      <div class="lista" id="h-lista-ing">${listaIngredientes()}</div>
      <div class="btn-row"><button class="btn" data-c="ing-cancelar">Volver al plato</button></div>`;
  }
  const aceites = activos().filter(a => !K.esPlato(a) && /aceite/i.test(a.nombre));
  const hayFrito = v.ingredientes.some(i => K.num(i.frito) > 0);
  return `<form id="h-plato" class="pila-form">
    <label class="campo">Nombre del plato<input name="nombre" ${h.id ? "" : "data-foco"} value="${esc(v.nombre || "")}"></label>
    <div class="sub-label">Ingredientes (en crudo)</div>
    ${v.ingredientes.map((ing, i) => { const a = mp[ing.id];
      return `<div class="ing">
        <button type="button" class="btn ing-nombre" data-c="ing-elegir" data-i="${i}">${a ? esc(a.nombre) : `<span class="muted">Elegir alimento…</span>`}</button>
        <input class="num" name="g${i}" inputmode="decimal" placeholder="${a ? K.unidad(a) : "g"}" value="${ing.g !== "" && ing.g != null ? String(ing.g).replace(".", ",") : ""}" aria-label="Cantidad">
        <button type="button" class="icon-btn sm danger" data-c="ing-quitar" data-i="${i}" aria-label="Quitar ingrediente">${C.icon("cerrar", 16)}</button>
        ${a && !K.esPlato(a) ? `<label class="ing-frito">Cocinado<select name="f${i}">
          <option value="0" ${!K.num(ing.frito) ? "selected" : ""}>Normal / plancha</option>
          <option value="${K.FRITURA.frito.pct}" ${K.num(ing.frito) === K.FRITURA.frito.pct ? "selected" : ""}>Frito (≈${K.FRITURA.frito.pct} % de aceite)</option>
          <option value="${K.FRITURA.rebozado.pct}" ${K.num(ing.frito) === K.FRITURA.rebozado.pct ? "selected" : ""}>Rebozado o empanado (≈${K.FRITURA.rebozado.pct} %)</option>
          ${K.num(ing.frito) && ![K.FRITURA.frito.pct, K.FRITURA.rebozado.pct].includes(K.num(ing.frito)) ? `<option value="${K.num(ing.frito)}" selected>${f1(ing.frito)} %</option>` : ""}
        </select></label>` : ""}
      </div>`; }).join("")}
    <div class="btn-row"><button type="button" class="btn sm" data-c="ing-anadir">${C.icon("mas", 16)}Ingrediente</button></div>
    ${hayFrito ? `<label class="campo">Aceite de freír<select name="aceiteId">${aceites.map(a => `<option value="${a.id}" ${(v.aceiteId || (K.aceiteDe(v, mp, C.S.alimentos) || {}).id) === a.id ? "selected" : ""}>${esc(a.nombre)}</option>`).join("")}</select></label>` : ""}
    <p class="muted" style="margin:0">Frito: se suma el aceite que absorbe el alimento, estimado en un % de su peso crudo (fritura normal 5–10 %, rebozado 10–20 %; se usa el punto medio). A la plancha, añade como ingrediente el aceite que echas.</p>
    <div class="grid2">
      <label class="campo">Peso cocinado (g)<input name="pesoFinal" inputmode="decimal" placeholder="estimado" value="${K.num(v.pesoFinal) > 0 ? String(v.pesoFinal).replace(".", ",") : ""}"></label>
      <label class="campo">Raciones<input name="raciones" inputmode="decimal" value="${String(v.raciones || 1).replace(".", ",")}"></label>
    </div>
    <div id="h-plato-prev">${prevPlato()}</div>
    <div class="btn-row">${h.id ? `<button class="btn danger" type="button" data-c="plato-borrar">${C.icon("papelera", 16)}Borrar</button>` : ""}<button class="btn primary" type="submit">Guardar plato</button></div></form>`;
}
function leerPlato() {
  const form = document.getElementById("h-plato"); if (!form) return;
  const fd = new FormData(form), v = F.hoja.datos;
  v.nombre = fd.get("nombre") || "";
  v.ingredientes.forEach((ing, i) => {
    if (fd.has("g" + i)) ing.g = fd.get("g" + i);
    if (fd.has("f" + i)) ing.frito = K.num(fd.get("f" + i));
  });
  v.pesoFinal = fd.get("pesoFinal") || "";
  v.raciones = fd.get("raciones") || 1;
  if (fd.has("aceiteId")) v.aceiteId = fd.get("aceiteId");
}
function platoTemporal() {
  const v = F.hoja.datos;
  return { ...v, tipo: "plato", ingredientes: v.ingredientes.filter(i => i.id && K.num(i.g) > 0).map(i => ({ id: i.id, g: K.num(i.g), ...(K.num(i.frito) > 0 ? { frito: K.num(i.frito) } : {}) })), pesoFinal: K.num(v.pesoFinal), raciones: K.num(v.raciones) || 1 };
}
function prevPlato() {
  const p = platoTemporal(), r = K.calcularPlato(p, mapa(), C.S.alimentos);
  if (!(r.peso > 0)) return `<p class="muted">Elige ingredientes y sus gramos para ver los valores.</p>`;
  const bloque = (n, m, c) => `<div class="row"><span>${n}</span><span><b>${f0(m.kcal)}</b> kcal${c > 0 ? ` · ${eur(c)}` : ""}</span></div>${pastillas(m, true)}`;
  return `<div class="prev-tabla">
    ${bloque("Por 100 g", K.escalar(r.total, 100 / r.peso), r.coste / r.peso * 100)}
    ${bloque(`Por ración (${f0(r.peso / r.raciones)} g)`, K.escalar(r.total, 1 / r.raciones), r.coste / r.raciones)}
    ${bloque(`Plato entero (${f0(r.peso)} g)`, r.total, r.coste)}
    <p class="muted" style="margin:0">En crudo suma ${f0(r.crudo)} g${Math.abs(r.cocinado - r.crudo) > 0.5 ? `; con los factores de cocción${r.aceiteG ? " y el aceite" : ""}, unos ${f0(r.cocinado)} g hecho` : ""}.
      ${r.aceiteG > 0 ? ` Aceite absorbido estimado: ${f0(r.aceiteG)} g (${f0(r.aceiteCant)} ${K.unidad(r.aceite)} de ${esc(r.aceite.nombre)}).` : ""}
      ${K.num(p.pesoFinal) > 0 ? " Se usa el peso cocinado que has puesto." : " Si lo pesas ya hecho, pon el peso: los valores por 100 g serán más exactos."}
      ${r.coste > 0 && r.faltaPrecio ? " El coste es parcial: hay ingredientes sin precio." : ""}</p></div>`;
}
function listaIngredientes() {
  const h = F.hoja, mp = mapa(), q = (h.qIng || "").trim().toLowerCase();
  const l = activos().filter(a => !h.id || !K.dependeDe(a.id, h.id, mp))
    .filter(a => !q || a.nombre.toLowerCase().includes(q) || String(a.codigo || "").includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).slice(0, 80);
  return l.length ? l.map(a => `<button class="item" data-c="ing-id" data-id="${a.id}"><span class="item-main"><b>${esc(a.nombre)}</b><span class="tags">${superTag(a)}</span></span><span class="item-kcal mono">${f0(a.kcal)}<small>/100</small></span></button>`).join("") : `<p class="muted">Nada coincide.</p>`;
}

/* ================= acciones ================= */
function abrirProducto(id, datos) {
  const a = id ? mapa()[id] : null;
  abrirHoja({ tipo: "producto", titulo: a ? "Editar producto" : "Nuevo producto", id, paso: "form",
    datos: datos || (a ? { nombre: a.nombre, super: a.super || "generico", unidad: K.unidad(a), precio: a.precio || "", factor: a.factor || "", kcal: a.kcal, prot: a.prot, hid: a.hid, gra: a.gra, fib: a.fib }
      : { nombre: "", super: "generico", unidad: "g", precio: "", factor: "", kcal: "", prot: "", hid: "", gra: "", fib: "" }) });
}
function abrirPlato(id) {
  const p = id ? mapa()[id] : null;
  abrirHoja({ tipo: "plato", titulo: p ? "Editar plato" : "Nuevo plato", id, buscando: null,
    datos: p ? { nombre: p.nombre, ingredientes: (p.ingredientes || []).map(i => ({ ...i })), pesoFinal: p.pesoFinal || "", raciones: p.raciones || 1, aceiteId: p.aceiteId || null }
      : { nombre: "", ingredientes: [{ id: "", g: "" }], pesoFinal: "", raciones: 1, aceiteId: null } });
}
function borrarAlimento(id) {
  const a = mapa()[id]; if (!a) return;
  const u = K.usosDe(id, C.S.alimentos, C.S.menus, C.S.diario);   // también platos archivados: sus días antiguos dependen de él
  const usado = u.platos.length || u.menus.length || u.dias;
  const donde = [u.platos.length ? `${u.platos.length} plato(s)` : "", u.menus.length ? `${u.menus.length} menú(s)` : "", u.dias ? `${u.dias} día(s) del diario` : ""].filter(Boolean).join(", ");
  confirmar(`Borrar «${a.nombre}»`, usado
    ? `Se usa en ${donde}. Se quitará del catálogo y de las búsquedas, pero los platos, menús y días que lo usan conservan sus valores.`
    : "Se borra del catálogo.", "Borrar", () => {
      if (usado) { a.archivado = true; guardarAlimento(a); }
      else { C.S.alimentos = C.S.alimentos.filter(x => x.id !== id); C.DB.borrarDoc(C.S.user.uid, "alimentos", id).catch(fallo); }
      if (a.codigo) { const ap = C.S.ajustes.app; ap.baseVistos = [...new Set([...(ap.baseVistos || []), a.codigo])]; }
      cerrarHoja(); C.toast(`«${a.nombre}» borrado.`); C.render();
    });
}
function guardarProductoForm() {
  leerProducto();
  const v = F.hoja.datos, id = F.hoja.id;
  const nombre = String(v.nombre || "").trim();
  if (!nombre) { C.toast("Ponle un nombre al producto."); return; }
  const d = { nombre, super: v.super || "generico", unidad: v.unidad === "ml" ? "ml" : "g", precio: K.num(v.precio), factor: K.num(v.factor) };
  ["kcal", "prot", "hid", "gra", "fib"].forEach(k => d[k] = K.num(v[k]));
  const hacer = () => {
    let a;
    if (id) { a = mapa()[id]; Object.assign(a, d); }
    else { a = { id: nuevoId(), tipo: "basico", ...d }; C.S.alimentos.push(a); }
    guardarAlimento(a); recalcularYGuardar();
    F.hoja = null; cerrarHoja(); C.toast(id ? "Producto actualizado." : "Producto añadido."); C.render();
  };
  const calc = K.kcalDeMacros(d);
  const descuadra = d.kcal > 0 && calc > 0 && Math.abs(calc - d.kcal) > Math.max(15, d.kcal * 0.12);
  const parecido = id ? [] : K.parecidos(nombre, C.S.alimentos, null);
  const avisos = [];
  if (parecido.length) avisos.push(`Ya tienes «${parecido[0].nombre}».`);
  if (descuadra) avisos.push(`Has puesto ${f0(d.kcal)} kcal, pero de los macros salen unas ${f0(calc)} (4/4/9 y 2 por la fibra). Suele ser un dedazo.`);
  if (avisos.length) {
    const previa = F.hoja;
    abrirHoja({ tipo: "confirmar", titulo: "Revisa antes de guardar", texto: avisos.join("\n\n"), boton: "Guardar igualmente", peligro: false, accion: hacer, previa });
    return;
  }
  hacer();
}
function guardarPlatoForm() {
  leerPlato();
  const v = F.hoja.datos, id = F.hoja.id;
  const nombre = String(v.nombre || "").trim();
  if (!nombre) { C.toast("Ponle un nombre al plato."); return; }
  const p = platoTemporal();
  if (!p.ingredientes.length) { C.toast("Añade al menos un ingrediente con cantidad."); return; }
  const datos = { nombre, tipo: "plato", ingredientes: p.ingredientes, pesoFinal: p.pesoFinal || 0, raciones: p.raciones, ...(p.ingredientes.some(i => i.frito) && v.aceiteId ? { aceiteId: v.aceiteId } : {}) };
  let plato;
  if (id) { plato = mapa()[id]; delete plato.aceiteId; Object.assign(plato, datos); }
  else { plato = { id: nuevoId(), kcal: 0, prot: 0, hid: 0, gra: 0, fib: 0, ...datos }; C.S.alimentos.push(plato); }
  recalcularYGuardar([plato]);
  cerrarHoja(); C.toast(id ? "Plato actualizado." : "Plato añadido."); C.render();
}
async function buscarCodigo() {
  const h = F.hoja, inp = document.getElementById("h-codigo");
  const cod = String(inp ? inp.value : h.codigo || "").replace(/\D/g, ""); h.codigo = cod;
  const host = document.getElementById("h-off");
  if (cod.length < 6) { host.innerHTML = `<p class="muted">Escribe el número completo.</p>`; return; }
  host.innerHTML = `<p class="muted">Buscando…</p>`;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cod}.json?fields=product_name,brands,nutriments`);
    const j = await r.json();
    if (!j || j.status === 0 || !j.product) h.off = { error: "Ese código no está en Open Food Facts. Mételo a mano o usa «Pegar etiqueta»." };
    else {
      const n = j.product.nutriments || {};
      let kcal = n["energy-kcal_100g"]; if (kcal == null && n["energy-kj_100g"] != null) kcal = Math.round(n["energy-kj_100g"] / 4.184 * 10) / 10;
      h.off = { nombre: [j.product.product_name, j.product.brands].filter(Boolean).join(" · "), kcal, prot: n.proteins_100g, hid: n.carbohydrates_100g, gra: n.fat_100g, fib: n.fiber_100g };
    }
  } catch { h.off = { error: "No se ha podido consultar (sin conexión o bloqueado por el navegador)." }; }
  if (F.hoja === h) document.getElementById("h-off").innerHTML = offHTML(h.off);
}
let camara = null;
function pararCamara() { if (camara) { camara.getTracks().forEach(t => t.stop()); camara = null; } }
async function escanear() {
  try {
    const video = document.getElementById("h-video");
    const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    camara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = camara; video.classList.remove("hide"); await video.play();
    const tic = setInterval(async () => {
      if (!camara) { clearInterval(tic); return; }
      try { const c = await det.detect(video); if (c.length) { clearInterval(tic); pararCamara(); video.classList.add("hide"); document.getElementById("h-codigo").value = c[0].rawValue; buscarCodigo(); } } catch {}
    }, 350);
  } catch { C.toast("No se ha podido abrir la cámara."); }
}
function aplicarMenu(id) {
  const m = C.S.menus.find(x => x.id === id); if (!m) return;
  const t = { kind: "dia", fecha: F.fecha }, d = contenedor(t);
  const llenas = COMIDAS.filter(x => ((m.comidas || {})[x.k] || []).length);
  const parcial = llenas.length < COMIDAS.length;
  const hacer = () => {
    const dd = asegurar(t);
    if (parcial) llenas.forEach(x => dd.comidas[x.k] = m.comidas[x.k].map(i => ({ ...i })));
    else { dd.comidas = limpio(normalizar({ comidas: m.comidas }).comidas); }
    dd.origen = m.nombre;
    guardarCont(t); cerrarHoja(); C.toast(`Cargado «${m.nombre}».`); C.render();
  };
  const pisa = parcial ? llenas.filter(x => d && (d.comidas[x.k] || []).length) : (vacio(d) ? [] : COMIDAS);
  if (pisa.length) confirmar("Sustituir lo apuntado", parcial
    ? `«${m.nombre}» trae ${llenas.map(x => x.n.toLowerCase()).join(" y ")}. Se sustituye lo que tengas en ${pisa.map(x => x.n.toLowerCase()).join(" y ")}; el resto del día no se toca.`
    : `Se borra lo apuntado el ${C.fecha(F.fecha)} y se copia «${m.nombre}».`, "Sustituir", hacer, false);
  else hacer();
}

export function click(e) {
  const t = e.target;
  const sub = t.closest("[data-csub]"); if (sub) { F.sub = sub.dataset.csub; F.menuAbierto = null; C.render(); return true; }
  const b = t.closest("[data-c]"); if (!b) return false;
  const act = b.dataset.c, h = F.hoja;
  const tk = b.dataset.t, meal = b.dataset.m, idx = b.dataset.i !== undefined ? +b.dataset.i : null;
  switch (act) {
    case "cerrar-hoja": cerrarHoja(); return true;
    case "confirmar-no": if (h.previa) { F.hoja = h.previa; pintarHoja(); } else cerrarHoja(); return true;
    case "confirmar-si": { const acc = h.accion; if (h.previa) F.hoja = h.previa; acc(); if (F.hoja === h) cerrarHoja(); return true; }
    /* navegación */
    case "dia": F.fecha = sumarDias(F.fecha, +b.dataset.n); break;
    case "hoy": F.fecha = hoyISO(); break;
    case "ir-dia": F.fecha = b.dataset.f; F.sub = "diario"; window.scrollTo(0, 0); break;
    case "semana": F.semana = sumarDias(F.semana, 7 * +b.dataset.n); break;
    case "semana-actual": F.semana = lunesDe(hoyISO()); break;
    /* comidas */
    case "anadir": abrirHoja({ tipo: "elegir", titulo: `Añadir a ${nombreComida(meal).toLowerCase()}`, ...hojaItem(tk, meal, null), id: null, q: "", g: 100, modo: "crudo" }); return true;
    case "editar-item": { const x = hojaItem(tk, meal, idx); const a = mapa()[x.it.id];
      abrirHoja({ tipo: "elegir", titulo: a ? a.nombre : "Editar", ...x, id: x.it.id, g: Math.round(K.num(x.it.g) * 10) / 10, modo: "crudo" }); return true; }
    case "elegir-id": h.id = b.dataset.id; h.g = 100; { const H = hist()[h.id]; if (H) { const v = H.valores.slice().sort((a, b2) => a - b2); h.g = Math.round(v[Math.floor(v.length / 2)]); } }
      pintarHoja(); return true;
    case "elegir-otro": h.id = null; pintarHoja(); return true;
    case "modo-peso": { const a = mapa()[h.id], f = K.factorDe(a), nuevo = b.dataset.v;
      if (f && nuevo !== h.modo) h.g = Math.round((nuevo === "cocinado" ? K.num(h.g) * f : K.num(h.g) / f) * 10) / 10;
      h.modo = nuevo; pintarHoja(); return true; }
    case "poner-g": h.g = +b.dataset.v; { const i = document.getElementById("h-g"); if (i) i.value = String(h.g).replace(".", ","); } document.getElementById("h-prev").innerHTML = prevCantidad(); return true;
    case "confirmar-item": {
      const g = Math.round(gramosGuardar() * 10) / 10;
      if (!(g > 0)) { C.toast("Pon una cantidad mayor que 0."); return true; }
      const c = asegurar(h.t);
      if (h.idx !== null) c.comidas[h.meal][h.idx] = { id: h.id, g }; else c.comidas[h.meal].push({ id: h.id, g });
      guardarCont(h.t); cerrarHoja(); C.render(); return true;
    }
    case "quitar-item-hoja": { const c = contenedor(h.t); if (c) { c.comidas[h.meal].splice(h.idx, 1); guardarCont(h.t); } cerrarHoja(); C.render(); return true; }
    case "quitar-item": { const tt = objetivoDe(tk), c = contenedor(tt); if (c) { c.comidas[meal].splice(idx, 1); guardarCont(tt); } break; }
    case "libre": abrirHoja({ tipo: "libre", titulo: `Comida fuera · ${nombreComida(meal)}`, ...hojaItem(tk, meal, null) }); return true;
    case "editar-libre": abrirHoja({ tipo: "libre", titulo: "Comida fuera", ...hojaItem(tk, meal, idx) }); return true;
    case "copiar-comida": abrirHoja({ tipo: "copiarComida", titulo: `Copiar ${nombreComida(meal).toLowerCase()}`, t: objetivoDe(tk), meal }); return true;
    case "aplicar-copia-comida": {
      const origen = b.dataset.v === "menu" ? (C.S.menus.find(m => m.id === b.dataset.id) || {}).comidas : (C.S.diario.find(d => d.fecha === b.dataset.id) || {}).comidas;
      const items = ((origen || {})[h.meal] || []).map(i => ({ ...i }));
      const c = asegurar(h.t); c.comidas[h.meal].push(...items); guardarCont(h.t);
      cerrarHoja(); C.toast(`${items.length} elemento(s) copiados.`); C.render(); return true;
    }
    case "guardar-comida": {
      const tt = objetivoDe(tk), c = contenedor(tt), mp = mapa(), items = c.comidas[meal];
      const primero = items[0].libre ? items[0].nombre : (mp[items[0].id] || {}).nombre;
      abrirHoja({ tipo: "texto", titulo: `Guardar ${nombreComida(meal).toLowerCase()} en la biblioteca`, etiqueta: "Nombre del menú", boton: "Guardar",
        valor: `${nombreComida(meal)}${primero ? " con " + primero.toLowerCase().split(" ").slice(0, 3).join(" ") : ""}`,
        accion: nombre => { const m = { id: nuevoId(), nombre, comidas: vacias() }; m.comidas[meal] = items.map(i => ({ ...i })); C.S.menus.push(m); guardarCont({ kind: "menu", id: m.id }); C.toast("Guardado en la biblioteca."); } });
      return true;
    }
    case "completar": {
      const t2 = F.sub === "menus" && F.menuAbierto ? { kind: "menu", id: F.menuAbierto } : { kind: "dia", fecha: F.fecha };
      const c = contenedor(t2), mealDef = COMIDAS.slice().reverse().find(m => !c || !(c.comidas[m.k] || []).length) || COMIDAS[COMIDAS.length - 1];
      abrirHoja({ tipo: "completar", titulo: "Completar el objetivo", t: t2, meal: mealDef.k, foco: null, todos: false }); return true;
    }
    case "comp-foco": h.foco = b.dataset.v || null; pintarHoja(); return true;
    case "comp-comida": h.meal = b.dataset.v; pintarHoja(); return true;
    case "comp-aplicar": {
      const op = h.ops[+b.dataset.i]; if (!op) return true;
      const c = asegurar(h.t); op.items.forEach(it => c.comidas[h.meal].push({ id: it.a.id, g: Math.round(it.g * 10) / 10 }));
      guardarCont(h.t); cerrarHoja(); C.toast("Añadido: " + op.items.map(it => `${f0(it.g)} ${K.unidad(it.a)} de ${it.a.nombre}`).join(" y ")); C.render(); return true;
    }
    /* día */
    case "cargar-menu": abrirHoja({ tipo: "cargarMenu", titulo: "Cargar un menú" }); return true;
    case "aplicar-menu": aplicarMenu(b.dataset.id); return true;
    case "copiar-dia": abrirHoja({ tipo: "copiarDia", titulo: "Copiar otro día" }); return true;
    case "aplicar-dia": {
      const o = C.S.diario.find(d => d.fecha === b.dataset.f); if (!o) return true;
      const hacer = () => { const t2 = { kind: "dia", fecha: F.fecha }, d = asegurar(t2); d.comidas = limpio(o.comidas); d.origen = o.origen || `día ${C.fecha(o.fecha)}`; guardarCont(t2); cerrarHoja(); C.toast(`Copiado el ${C.fecha(o.fecha)}.`); C.render(); };
      if (!vacio(contenedor({ kind: "dia", fecha: F.fecha }))) confirmar("Sustituir el día", `Se borra lo apuntado el ${C.fecha(F.fecha)} y se copia el ${C.fecha(o.fecha)}.`, "Sustituir", hacer, false);
      else hacer();
      return true;
    }
    case "dia-a-menu": {
      const d = contenedor({ kind: "dia", fecha: F.fecha });
      abrirHoja({ tipo: "texto", titulo: "Guardar el día como menú", etiqueta: "Nombre del menú", boton: "Guardar", valor: d.origen ? d.origen + " (variante)" : `Menú del ${C.fecha(F.fecha)}`,
        accion: nombre => { const m = { id: nuevoId(), nombre, comidas: limpio(d.comidas) }; C.S.menus.push(m); guardarCont({ kind: "menu", id: m.id }); C.toast("Guardado en la biblioteca."); } });
      return true;
    }
    case "vaciar-dia": confirmar("Vaciar el día", `Se borra todo lo apuntado el ${C.fecha(F.fecha)}.`, "Vaciar", () => {
      const t2 = { kind: "dia", fecha: F.fecha }, d = contenedor(t2); if (d) { d.comidas = vacias(); guardarCont(t2); } cerrarHoja(); C.toast("Día vaciado."); C.render(); }); return true;
    /* menús */
    case "menu-nuevo": { const m = { id: nuevoId(), nombre: `Menú ${C.S.menus.length + 1}`, comidas: vacias() }; C.S.menus.push(m); guardarCont({ kind: "menu", id: m.id }); F.menuAbierto = m.id; window.scrollTo(0, 0); break; }
    case "menu-abrir": F.menuAbierto = b.dataset.id; window.scrollTo(0, 0); break;
    case "menus-volver": F.menuAbierto = null; break;
    case "menu-duplicar": { const o = C.S.menus.find(m => m.id === F.menuAbierto); const m = { id: nuevoId(), nombre: o.nombre + " (copia)", comidas: limpio(o.comidas) }; C.S.menus.push(m); guardarCont({ kind: "menu", id: m.id }); F.menuAbierto = m.id; C.toast("Menú duplicado."); break; }
    case "menu-borrar": { const o = C.S.menus.find(m => m.id === F.menuAbierto);
      confirmar(`Borrar «${o.nombre}»`, "Los días del diario que lo cargaron no cambian.", "Borrar", () => {
        C.S.menus = C.S.menus.filter(m => m !== o); C.DB.borrarDoc(C.S.user.uid, "menus", o.id).catch(fallo);
        const cp = C.S.compra; if (cp) { cp.items = (cp.items || []).filter(i => !(i.tipo === "menu" && i.id === o.id)); guardarCompra(); }
        F.menuAbierto = null; cerrarHoja(); C.toast("Menú borrado."); C.render(); }); return true; }
    case "menu-a-compra": addCompra("menu", F.menuAbierto); C.toast("Añadido a la compra."); break;
    /* alimentos */
    case "tipo": F.tipo = b.dataset.v; break;
    case "nuevo-producto": abrirProducto(null); return true;
    case "abrir-producto": abrirProducto(b.dataset.id); return true;
    case "nuevo-plato": abrirPlato(null); return true;
    case "abrir-plato": abrirPlato(b.dataset.id); return true;
    case "prod-etiqueta": leerProducto(); h.paso = "etiqueta"; h.leido = null; pintarHoja(); return true;
    case "prod-codigo": leerProducto(); h.paso = "codigo"; h.off = null; pintarHoja(); return true;
    case "prod-volver": pararCamara(); h.paso = "form"; pintarHoja(); return true;
    case "prod-duplicar": leerProducto(); abrirHoja({ ...h, titulo: "Nuevo producto", id: null, datos: { ...h.datos, nombre: h.datos.nombre + " (copia)" } }); C.toast("Copia lista: cambia lo que sea distinto."); return true;
    case "prod-borrar": borrarAlimento(h.id); return true;
    case "etiqueta-analizar": h.etiqueta = document.getElementById("h-etiqueta").value; h.leido = K.analizarEtiqueta(h.etiqueta); pintarHoja(); return true;
    case "etiqueta-usar": ["kcal", "prot", "hid", "gra", "fib"].forEach(k => { if (h.leido[k]) h.datos[k] = h.leido[k].v; }); h.paso = "form"; pintarHoja(); C.toast("Valores puestos: revísalos."); return true;
    case "codigo-buscar": buscarCodigo(); return true;
    case "codigo-camara": escanear(); return true;
    case "codigo-usar": pararCamara(); if (!String(h.datos.nombre || "").trim() && h.off.nombre) h.datos.nombre = h.off.nombre;
      ["kcal", "prot", "hid", "gra", "fib"].forEach(k => { if (h.off[k] != null) h.datos[k] = Math.round(h.off[k] * 10) / 10; }); h.paso = "form"; pintarHoja(); C.toast("Valores puestos: revísalos."); return true;
    case "ing-anadir": leerPlato(); h.datos.ingredientes.push({ id: "", g: "" }); h.buscando = h.datos.ingredientes.length - 1; h.qIng = ""; pintarHoja(); return true;
    case "ing-elegir": leerPlato(); h.buscando = idx; h.qIng = ""; pintarHoja(); return true;
    case "ing-id": h.datos.ingredientes[h.buscando].id = b.dataset.id; h.buscando = null; pintarHoja(); return true;
    case "ing-cancelar": { const ing = h.datos.ingredientes[h.buscando]; if (ing && !ing.id) h.datos.ingredientes.splice(h.buscando, 1); h.buscando = null; pintarHoja(); return true; }
    case "ing-quitar": leerPlato(); h.datos.ingredientes.splice(idx, 1); pintarHoja(); return true;
    case "plato-borrar": borrarAlimento(h.id); return true;
    case "reponer-base": C.reponerBase(); return true;
    /* compra */
    case "compra-add": abrirHoja({ tipo: "compraAdd", titulo: b.dataset.v === "plato" ? "Añadir un plato" : "Añadir un menú", v: b.dataset.v }); return true;
    case "compra-elegir": addCompra(h.v, b.dataset.id); cerrarHoja(); C.render(); return true;
    case "compra-quitar": C.S.compra.items.splice(idx, 1); guardarCompra(); break;
    case "compra-marcar": { const s = new Set(C.S.compra.marcados || []); const id = b.dataset.id; s.has(id) ? s.delete(id) : s.add(id); C.S.compra.marcados = [...s]; guardarCompra(); break; }
    case "compra-copiar": {
      const porSuper = K.calcularCompra(C.S.compra, C.S.alimentos, C.S.menus);
      const txt = SUPERS.filter(s => porSuper[s]).map(s => SUPER_INFO[s].n + "\n" + porSuper[s].map(x => `- ${x.a.nombre}: ${f0(x.g)} ${K.unidad(x.a)}`).join("\n")).join("\n\n");
      if (navigator.clipboard && txt) navigator.clipboard.writeText(txt).then(() => C.toast("Lista copiada."), () => C.toast("El navegador no deja copiar."));
      return true;
    }
    case "compra-vaciar": confirmar("Vaciar la compra", "Se quitan los platos y menús elegidos y las marcas.", "Vaciar", () => { C.S.compra = { items: [], marcados: [] }; guardarCompra(); cerrarHoja(); C.render(); }); return true;
    default: return false;
  }
  C.render();
  return true;
}
function addCompra(tipo, id) {
  const cp = C.S.compra = C.S.compra || { items: [], marcados: [] };
  cp.items = cp.items || [];
  const ya = cp.items.find(i => i.tipo === tipo && i.id === id);
  if (ya) ya.cant = K.num(ya.cant) + 1; else cp.items.push({ tipo, id, cant: 1 });
  guardarCompra();
}

export function input(t) {
  if (t.id === "c-buscar") { F.q = t.value; const l = document.getElementById("c-lista"); if (l) l.innerHTML = listaAlimentosHTML(); return true; }
  if (t.id === "h-q") { F.hoja.q = t.value; document.getElementById("h-lista").innerHTML = listaElegir(); return true; }
  if (t.id === "h-qing") { F.hoja.qIng = t.value; document.getElementById("h-lista-ing").innerHTML = listaIngredientes(); return true; }
  if (t.id === "h-g") { F.hoja.g = K.num(t.value); document.getElementById("h-prev").innerHTML = prevCantidad(); return true; }
  if (t.closest && t.closest("#h-plato")) { leerPlato(); const p = document.getElementById("h-plato-prev"); if (p) p.innerHTML = prevPlato(); return true; }
  if (t.closest && t.closest("#aj-objetivo")) { prevObjetivo(t.closest("form")); return true; }
  return false;
}
export function change(t) {
  if (t.id === "c-fecha") { F.fecha = t.value || hoyISO(); C.render(); return true; }
  if (t.id === "c-super") { F.superF = t.value; C.render(); return true; }
  if (t.id === "c-orden") { F.orden = t.value; C.render(); return true; }
  if (t.id === "c-sinprecio") { F.sinPrecio = t.checked; C.render(); return true; }
  if (t.id === "h-todos") { F.hoja.todos = t.checked; pintarHoja(); return true; }
  if (t.id === "c-menu-nombre") { const m = C.S.menus.find(x => x.id === F.menuAbierto); if (m) { m.nombre = t.value.trim() || "Menú sin nombre"; guardarCont({ kind: "menu", id: m.id }); } return true; }
  if (t.dataset && t.dataset.ccant !== undefined) { const it = C.S.compra.items[+t.dataset.ccant]; if (it) { it.cant = K.num(t.value); guardarCompra(); C.render(); } return true; }
  if (t.closest && t.closest("#h-plato")) { leerPlato(); if (t.name && t.name.startsWith("f")) pintarHoja(); else { const p = document.getElementById("h-plato-prev"); if (p) p.innerHTML = prevPlato(); } return true; }
  if (t.closest && t.closest("#h-producto") && t.name === "unidad") { leerProducto(); pintarHoja(); return true; }
  return false;
}
export function submit(form) {
  if (form.id === "h-producto") { guardarProductoForm(); return true; }
  if (form.id === "h-plato") { guardarPlatoForm(); return true; }
  if (form.id === "h-texto") { const v = String(new FormData(form).get("v") || "").trim(); if (!v) return true; const acc = F.hoja.accion; cerrarHoja(); acc(v); C.render(); return true; }
  if (form.id === "h-libre") {
    const fd = new FormData(form), h = F.hoja;
    const it = { libre: true, nombre: String(fd.get("nombre") || "").trim() || "Comida fuera" };
    ["kcal", "prot", "hid", "gra", "fib", "precio"].forEach(k => it[k] = K.num(fd.get(k)));
    const c = asegurar(h.t);
    if (h.idx !== null) c.comidas[h.meal][h.idx] = it; else c.comidas[h.meal].push(it);
    guardarCont(h.t); cerrarHoja(); C.render(); return true;
  }
  if (form.id === "aj-objetivo") { guardarObjetivo(form); return true; }
  return false;
}
/* Al cambiar de día con la flecha atrás del sistema no hace falta nada más */

/* ================= ajustes: objetivo de comida ================= */
function leerObjetivo(form) {
  const fd = new FormData(form), o = {};
  o.kcal = K.num(fd.get("kcal"));
  ["prot", "hid", "gra"].forEach(k => o[k] = { modo: fd.get("m-" + k) === "gkg" ? "gkg" : "pct", valor: K.num(fd.get("v-" + k)) });
  o.fibra = K.num(fd.get("fibra"));
  o.reparto = Object.fromEntries(COMIDAS.map(m => [m.k, K.num(fd.get("r-" + m.k))]));
  return o;
}
function textoObjetivo(o) {
  const g = K.objetivoGramos(o, C.peso()), suma = Object.values(o.reparto || {}).reduce((s, v) => s + v, 0);
  return `<div class="prev-tabla">
    ${["prot", "hid", "gra"].map(k => { const m = MAC.find(x => x.k === k); return `<div class="row"><span><i class="dot" style="background:${m.c}"></i> ${m.n}</span><span><b>${f0(g[k])} g</b> <span class="muted">· ${f0(g.pct[k])} %${g.gkg[k] != null ? ` · ${f1(g.gkg[k])} g/kg` : ""}</span></span></div>`; }).join("")}
    <div class="row"><span><i class="dot" style="background:var(--fib)"></i> Fibra</span><span><b>${f0(g.fib)} g</b></span></div>
    ${g.avisos.map(a => `<p class="err" style="margin:0">${esc(a)}</p>`).join("")}
    ${Math.abs(suma - 100) > 0.5 ? `<p class="err" style="margin:0">El reparto por comidas suma ${f1(suma)} %, no 100 %.</p>` : ""}
    <p class="muted" style="margin:0">${C.peso() ? `Los g/kg usan tu peso de cálculo (${f1(C.peso())} kg).` : "Para usar g/kg hace falta el peso de referencia (apartado Cuerpo)."} Las kcal que dejan los macros en g/kg se reparten entre los que van en %.</p></div>`;
}
function prevObjetivo(form) { const p = document.getElementById("aj-obj-prev"); if (p) p.innerHTML = textoObjetivo(leerObjetivo(form)); }
function guardarObjetivo(form) {
  const o = leerObjetivo(form);
  if (!(o.kcal > 0)) { C.toast("Pon un objetivo de calorías."); return; }
  C.S.ajustes.objetivo = o;
  C.DB.guardarAjustes(C.S.user.uid, C.S.ajustes).catch(fallo);
  C.toast("Objetivo guardado."); C.render();
}
export function vAjustes() {
  const o = C.S.ajustes.objetivo;
  const macro = (k, n) => `<div class="obj-fila"><span>${n}</span>
    <input name="v-${k}" inputmode="decimal" value="${String(o[k].valor).replace(".", ",")}" aria-label="${n}">
    <select name="m-${k}" aria-label="Unidad de ${n}"><option value="pct" ${o[k].modo !== "gkg" ? "selected" : ""}>% kcal</option><option value="gkg" ${o[k].modo === "gkg" ? "selected" : ""}>g/kg</option></select></div>`;
  return `<form class="card" id="aj-objetivo"><p class="card-title">Objetivo de comida</p>
    <div class="grid2"><label class="campo">Calorías al día<input name="kcal" inputmode="numeric" value="${o.kcal}"></label>
      <label class="campo">Fibra (g)<input name="fibra" inputmode="decimal" value="${String(o.fibra).replace(".", ",")}"></label></div>
    <p class="muted" style="margin:0">Objetivo fijo para todos los días. En Progreso → Gasto tienes uno sugerido según tu gasto medio semanal; solo cambia si lo aceptas.</p>
    <div class="sub-label">Macros: en % de las calorías o en g por kg</div>
    ${macro("prot", "Proteína")}${macro("hid", "Hidratos")}${macro("gra", "Grasas")}
    <div class="sub-label">Reparto por comidas (% de las kcal)</div>
    <div class="reparto">${COMIDAS.map(m => `<label class="campo">${m.n}<input name="r-${m.k}" inputmode="decimal" value="${String((o.reparto || {})[m.k] ?? 0).replace(".", ",")}"></label>`).join("")}</div>
    <div id="aj-obj-prev">${textoObjetivo(o)}</div>
    <div class="btn-row"><button class="btn primary" type="submit">Guardar objetivo</button></div></form>`;
}

/* ================= base de alimentos ================= */
export function sincronizarBase(reponer = false) {
  const ap = C.S.ajustes.app;
  const r = K.baseNuevos(C.S.alimentos, ap.baseVistos, reponer, nuevoId);
  r.nuevos.forEach(a => { const i = C.S.alimentos.findIndex(x => x.id === a.id); if (i >= 0) C.S.alimentos[i] = a; else C.S.alimentos.push(a); guardarAlimento(a); });
  const cambiaVistos = r.vistos.length !== (ap.baseVistos || []).length;
  ap.baseVistos = r.vistos;
  if (cambiaVistos || r.nuevos.length) C.DB.guardarAjustes(C.S.user.uid, C.S.ajustes).catch(() => {});
  return r.nuevos.length;
}
export const editando = () => !!F.hoja;
/* A medianoche con la app abierta: si estabas en «hoy», pasa al nuevo día */
export function nuevoDia(antes, hoy) { if (F.fecha === antes) F.fecha = hoy; F.semana = null; }
document.addEventListener("keydown", e => { if (e.key === "Escape" && F.hoja) cerrarHoja(); });
