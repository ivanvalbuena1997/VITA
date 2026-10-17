/* V.I.T.A. — Progreso: actividad del día (pasos, peso, cardio), gráficas de
   pasos y peso, y gasto con calibración y objetivo sugerido.
   Los cálculos están en actividad-calc.js. */

import { hoyISO, toISO } from "./model.js";
import * as A from "./actividad-calc.js";
import * as K from "./comida-calc.js";

let C = null;
export function init(ctx) { C = ctx; }

const P = { sub: "dia", fecha: hoyISO(), rango: { pasos: "1m", peso: "3m", gasto: "1m" }, cardio: null };
const RANGOS = { "7d": 7, "1m": 30, "3m": 91, "6m": 182, "1y": 365 };
const RANGO_TXT = { "7d": "7 días", "1m": "1 mes", "3m": "3 meses", "6m": "6 meses", "1y": "1 año" };

/* ---------- utilidades ---------- */
const esc = s => C.esc(s);
const f0 = n => Math.round(n || 0).toLocaleString("es-ES");
const f1 = n => (Math.round((n || 0) * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const f2 = n => (Math.round((n || 0) * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const sumarDias = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };
const corta = iso => { const d = new Date(iso + "T00:00:00"); return `${d.getDate()}/${d.getMonth() + 1}`; };
const fallo = err => C.toast("No se pudo guardar: " + C.mensajeError(err), 6000);
const diaDe = f => C.S.dias.find(d => d.fecha === f) || null;
const nId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* Contexto para los cálculos de gasto (ingesta por fecha desde el diario) */
function ctxGasto() {
  const mapa = K.porId(C.S.alimentos), ingesta = {};
  C.S.diario.forEach(d => { const t = K.totalComidas(d.comidas, mapa); if (t.kcal > 0) ingesta[d.fecha] = t.kcal; });
  return { dias: C.S.dias, sesiones: C.S.sesiones, ajustes: C.S.ajustes, ingesta };
}
function guardarDia(f, cambio) {
  let d = diaDe(f);
  if (!d) { d = { fecha: f }; C.S.dias.push(d); }
  cambio(d);
  ["pasos", "peso"].forEach(k => { if (!(d[k] > 0)) delete d[k]; });
  if (d.cardio && !d.cardio.length) delete d.cardio;
  const vacio = !d.pasos && !d.peso && !d.cardio;
  if (vacio) { C.S.dias = C.S.dias.filter(x => x !== d); C.DB.borrarDoc(C.S.user.uid, "dias", f).catch(fallo); }
  else C.DB.guardarDoc(C.S.user.uid, "dias", f, JSON.parse(JSON.stringify(d))).catch(fallo);
}
export function nuevoDia(antes, hoy) { if (P.fecha === antes) P.fecha = hoy; }
export function irHoy() { P.sub = "dia"; P.fecha = hoyISO(); P.cardio = null; }
export function pesoHoy() { return A.pesoEn(C.S.dias, C.S.ajustes.perfil, hoyISO()); }

/* ---------- gráficas SVG ---------- */
function barras(puntos, { linea = null, color = "var(--acc)", alto = 200, unidad = "" } = {}) {
  const W = 480, H = alto, L = 40, R = 6, T = 10, B = 26;
  const max = Math.max(1, linea || 0, ...puntos.map(p => p.v || 0)) * 1.08;
  const gap = (W - L - R) / Math.max(1, puntos.length), bw = Math.max(2, Math.min(26, gap * 0.72));
  const y = v => H - B - v / max * (H - T - B);
  const paso = Math.max(1, Math.ceil(puntos.length / 7));
  const grid = [0, 1, 2, 3].map(i => { const v = max / 1.08 * i / 3, yy = y(v); return `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" class="g-grid"/><text x="${L - 5}" y="${yy + 4}" text-anchor="end" class="g-txt">${f0(v)}</text>`; }).join("");
  const bars = puntos.map((p, i) => { const x = L + i * gap + (gap - bw) / 2;
    return (p.v > 0 ? `<rect x="${x}" y="${y(p.v)}" width="${bw}" height="${H - B - y(p.v)}" rx="2" fill="${p.color || color}"><title>${esc(p.titulo || p.x)}: ${f0(p.v)} ${unidad}</title></rect>` : "")
      + ((i % paso === 0 || i === puntos.length - 1) ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="g-txt">${esc(p.x)}</text>` : ""); }).join("");
  const obj = linea ? `<line x1="${L}" y1="${y(linea)}" x2="${W - R}" y2="${y(linea)}" class="g-obj"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img">${grid}${bars}${obj}</svg>`;
}
function lineas(series, { alto = 220, decimales = 0 } = {}) {
  const W = 480, H = alto, L = 44, R = 8, T = 10, B = 26;
  const todos = series.flatMap(s => s.puntos);
  if (!todos.length) return "";
  const xs = [...new Set(todos.map(p => p.x))].sort();
  const vals = todos.map(p => p.v);
  let mn = Math.min(...vals), mx = Math.max(...vals); const pad = (mx - mn) * 0.15 || Math.max(0.5, Math.abs(mx) * 0.02); mn -= pad; mx += pad;
  const x0 = new Date(xs[0] + "T00:00:00"), x1 = new Date(xs[xs.length - 1] + "T00:00:00"), span = Math.max(1, (x1 - x0) / 86400000);
  const X = f => L + ((new Date(f + "T00:00:00") - x0) / 86400000) / span * (W - L - R);
  const Y = v => H - B - (v - mn) / (mx - mn) * (H - T - B);
  const grid = [0, 1, 2, 3].map(i => { const v = mn + (mx - mn) * i / 3; return `<line x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}" class="g-grid"/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" class="g-txt">${decimales ? f1(v) : f0(v)}</text>`; }).join("");
  const etis = [xs[0], xs[Math.floor(xs.length / 2)], xs[xs.length - 1]].filter((v, i, a) => a.indexOf(v) === i)
    .map((f, i, l) => `<text x="${X(f)}" y="${H - 8}" text-anchor="${i === 0 && l.length > 1 ? "start" : i === l.length - 1 && l.length > 1 ? "end" : "middle"}" class="g-txt">${corta(f)}</text>`).join("");
  const dib = series.map(s => {
    const pts = s.puntos.slice().sort((a, b) => a.x < b.x ? -1 : 1);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
    return (s.linea !== false && pts.length > 1 ? `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.grosor || 2.2}" ${s.discontinua ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round"/>` : "")
      + (s.puntosVisibles ? pts.map(p => `<circle cx="${X(p.x)}" cy="${Y(p.v)}" r="3" fill="var(--surf)" stroke="${s.color}" stroke-width="2"><title>${corta(p.x)}: ${decimales ? f1(p.v) : f0(p.v)}</title></circle>`).join("") : "");
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img">${grid}${etis}${dib}</svg>
    <div class="leyenda">${series.filter(s => s.nombre).map(s => `<span><i style="background:${s.color}"></i>${esc(s.nombre)}</span>`).join("")}</div>`;
}
const selector = (id, actual, opciones) => `<div class="seg seg${opciones.length}">${opciones.map(r => `<button data-arango="${id}:${r}" aria-pressed="${actual === r}">${RANGO_TXT[r]}</button>`).join("")}</div>`;

/* ================= vista ================= */
export function vista() {
  const subs = [["dia", "Día"], ["semana", "Semana"], ["pasos", "Pasos"], ["peso", "Peso"], ["gasto", "Gasto"]];
  const cuerpo = { dia: vDia, semana: () => C.vSemana(), pasos: vPasos, peso: vPeso, gasto: vGasto }[P.sub]();
  return `<div class="label">Progreso</div>
  <div class="seg seg5" role="tablist">${subs.map(([k, n]) => `<button data-asub="${k}" aria-pressed="${P.sub === k}">${n}</button>`).join("")}</div>
  ${cuerpo}`;
}

/* ---------- día ---------- */
function filaGasto(n, v, extra = "") { return `<div class="row"><span>${n}${extra ? ` <span class="muted">${extra}</span>` : ""}</span><span><b>${f0(v)}</b> kcal</span></div>`; }
function vDia() {
  const f = P.fecha, d = diaDe(f) || {}, ctx = ctxGasto(), g = A.gastoDia(f, ctx);
  const obj = C.S.ajustes.actividad.pasosObjetivo || 8000;
  const pct = d.pasos ? Math.min(100, d.pasos / obj * 100) : 0;
  const cal = A.calibracion(sumarDias(hoyISO(), -1), ctx);
  const usarCal = C.S.ajustes.gasto.usarCalibracion !== false && cal.listo;
  const altura = num(C.S.ajustes.perfil.altura);
  return `<div class="card"><div class="fecha-nav">
      <button class="icon-btn sm" data-a="dia" data-n="-1" aria-label="Día anterior">${C.icon("izq", 18)}</button>
      <input type="date" id="a-fecha" value="${f}" max="${hoyISO()}" aria-label="Fecha">
      <button class="icon-btn sm" data-a="dia" data-n="1" aria-label="Día siguiente" ${f >= hoyISO() ? "disabled" : ""}>${C.icon("der", 18)}</button>
      ${f !== hoyISO() ? `<button class="btn sm" data-a="hoy">Hoy</button>` : `<span class="chip">hoy</span>`}
    </div></div>
  <div class="card" data-sec="d-pasos"><p class="card-title">Pasos</p>
    <div class="fila-dato"><input class="num grande" id="a-pasos" inputmode="numeric" value="${d.pasos || ""}" placeholder="0" aria-label="Pasos del día"><span class="muted">de ${f0(obj)}</span></div>
    <div class="mbar-pista grande"><i style="width:${pct}%;background:${pct >= 100 ? "var(--ok)" : "var(--acc)"}"></i></div>
    ${d.pasos && altura ? `<p class="muted" style="margin:0">≈ ${f1(A.kmPasos(d.pasos, altura))} km${g.descontados ? ` · se descuentan ${f0(g.descontados)} pasos de la cinta para no contarlos dos veces` : ""}.</p>` : ""}
    <p class="muted" style="margin:0">De momento se apuntan a mano (por ejemplo, los de Mi Fitness al final del día).</p></div>
  <div class="card" data-sec="d-peso"><p class="card-title">Peso</p>
    <div class="fila-dato"><input class="num grande" id="a-peso" inputmode="decimal" value="${d.peso ? String(d.peso).replace(".", ",") : ""}" placeholder="kg" aria-label="Peso del día en kg"><span class="muted">kg · opcional</span></div>
    <p class="muted" style="margin:0">Peso para los cálculos de este día: ${g.peso ? `<b>${f1(g.peso)} kg</b> (${esc(g.pesoFuente)})` : "falta"}.</p></div>
  <div class="card" data-sec="d-cardio"><p class="card-title">Cardio</p>
    ${(d.cardio || []).map((c, i) => `<button class="item" data-a="cardio-editar" data-i="${i}"><span class="item-main"><b>${c.tipo === "cinta" ? "Cinta" : "Bici"} · ${f1(A.cardioMin(c))} min</b>
      <span class="muted">${c.tipo === "cinta" ? `${f1(c.velocidad)} km/h · ${f1(c.inclinacion)} %${c.km ? ` · ${f2(c.km)} km` : ""}${c.pasosReloj ? ` · ${f0(c.pasosReloj)} pasos` : ""}${c.llevaba === false ? " · sin reloj" : ""}` : (c.vatios ? `${f0(c.vatios)} W` : `intensidad ${c.intensidad || "moderada"}`)}</span></span>
      <span class="item-kcal mono">${f0(A.cardioKcal(c, g.peso))}</span></button>`).join("") || `<p class="muted" style="margin:0">Sin cardio este día.</p>`}
    ${P.cardio ? formCardio(d) : `<div class="btn-row"><button class="btn sm" data-a="cardio-nuevo" data-v="cinta">${C.icon("mas", 16)}Cinta</button><button class="btn sm" data-a="cardio-nuevo" data-v="bici">${C.icon("mas", 16)}Bici</button></div>`}</div>
  <div class="card" data-sec="d-gasto"><p class="card-title">Gasto del día</p>
    ${g.total == null ? `<p class="err" style="margin:0">Faltan datos para calcularlo: ${esc(g.faltan.join(", "))}. Complétalos en Ajustes → Cuerpo.</p>` : `
    ${filaGasto("Basal", g.basal, "Mifflin-St Jeor")}
    ${filaGasto("Pasos", g.kPasos, g.pasos ? `${f0(g.pasos - g.descontados)} pasos` : "")}
    ${filaGasto("Entreno", g.kEntreno, g.entreno.series ? `${g.entreno.series} series · ${f0(g.entreno.min)} min` : "")}
    ${filaGasto("Cardio", g.kCardio)}
    ${filaGasto("Digestión", g.kDigestion, g.ingesta != null ? `${C.S.ajustes.gasto.digestionPct ?? 10} % de lo comido` : "sin comida apuntada")}
    <div class="row total"><span>Gasto estimado</span><span><b class="mono">${f0(g.total)}</b> kcal</span></div>
    ${usarCal ? `<div class="row"><span>Calibrado con tu peso <span class="muted">× ${f2(cal.factor)}</span></span><span><b class="mono acc">${f0(g.total * cal.factor)}</b> kcal</span></div>` : ""}
    ${g.ingesta != null ? (() => { const gt = usarCal ? g.total * cal.factor : g.total, bal = g.ingesta - gt;
      return `<div class="row"><span>Comido</span><span><b>${f0(g.ingesta)}</b> kcal</span></div>
      <div class="row"><span>Balance</span><span style="color:${bal > 0 ? "var(--warn)" : "var(--ok)"}"><b class="mono">${bal > 0 ? "+" : "−"}${f0(Math.abs(bal))}</b> kcal ${bal > 0 ? "superávit" : "déficit"}</span></div>`; })() : ""}
    <p class="muted" style="margin:0">Es una estimación (error típico de un 10–20 %). ${usarCal ? "Se corrige con la evolución real de tu peso." : "Cuando haya pesajes suficientes se calibrará con tu peso real (Progreso → Gasto)."}</p>`}</div>`;
}
function formCardio(d) {
  const c = P.cardio.idx != null ? (d.cardio || [])[P.cardio.idx] || {} : {};
  const t = P.cardio.tipo, v = k => c[k] != null && c[k] !== "" ? String(c[k]).replace(".", ",") : "";
  return `<form id="a-cardio" class="pila-form sub-form">
    <div class="sub-label">${P.cardio.idx != null ? "Editar" : "Nuevo"}: ${t === "cinta" ? "cinta" : "bici"}</div>
    ${t === "cinta" ? `<div class="grid2">
      <label class="campo">Minutos<input name="min" inputmode="decimal" value="${v("min")}"></label>
      <label class="campo">Velocidad (km/h)<input name="velocidad" inputmode="decimal" value="${v("velocidad")}"></label>
      <label class="campo">Inclinación (%)<input name="inclinacion" inputmode="decimal" value="${v("inclinacion")}"></label>
      <label class="campo">Distancia (km)<input name="km" inputmode="decimal" value="${v("km")}" placeholder="opcional"></label>
      <label class="campo">Pasos del reloj<input name="pasosReloj" inputmode="numeric" value="${v("pasosReloj")}" placeholder="opcional"></label></div>
      <label class="check"><input type="checkbox" name="llevaba" ${c.llevaba !== false ? "checked" : ""}><span>Llevaba el reloj (sus pasos ya están en el total del día)</span></label>
      <p class="muted" style="margin:0">Pon los minutos o la distancia. Si llevabas el reloj, esos pasos se descuentan del día para no contarlos dos veces.</p>`
    : `<div class="grid2">
      <label class="campo">Minutos<input name="min" inputmode="decimal" value="${v("min")}"></label>
      <label class="campo">Vatios medios<input name="vatios" inputmode="numeric" value="${v("vatios")}" placeholder="si la bici los da"></label></div>
      <label class="campo">Intensidad (solo si no hay vatios)<select name="intensidad">${["suave", "moderada", "intensa"].map(x => `<option value="${x}" ${(c.intensidad || "moderada") === x ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)}</option>`).join("")}</select></label>`}
    <div class="btn-row">${P.cardio.idx != null ? `<button class="btn sm danger" type="button" data-a="cardio-borrar">${C.icon("papelera", 16)}Quitar</button>` : ""}<button class="btn sm" type="button" data-a="cardio-cancelar">Cancelar</button><button class="btn sm primary" type="submit">Guardar</button></div></form>`;
}

/* ---------- pasos ---------- */
function vPasos() {
  const r = P.rango.pasos, n = RANGOS[r], hoy = hoyISO(), obj = C.S.ajustes.actividad.pasosObjetivo || 8000;
  const fechas = Array.from({ length: n }, (_, i) => sumarDias(hoy, -(n - 1 - i)));
  const val = f => (diaDe(f) || {}).pasos || 0;
  let puntos;
  if (n > 31) {   // por semanas: media diaria de los días apuntados
    const sem = {};
    fechas.forEach(f => { const d = new Date(f + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = toISO(d); (sem[k] = sem[k] || []).push(val(f)); });
    puntos = Object.entries(sem).map(([k, l]) => { const c = l.filter(Boolean); const v = c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0; return { x: corta(k), titulo: `Semana del ${corta(k)}`, v, color: v >= obj ? "var(--ok)" : "var(--acc)" }; });
  } else puntos = fechas.map(f => ({ x: corta(f), v: val(f), color: val(f) >= obj ? "var(--ok)" : "var(--acc)" }));
  const ult7 = Array.from({ length: 7 }, (_, i) => val(sumarDias(hoy, -i))).filter(Boolean);
  let racha = 0; for (let i = (val(hoy) >= obj ? 0 : 1); i < 400; i++) { if (val(sumarDias(hoy, -i)) >= obj) racha++; else break; }
  const con = fechas.map(val).filter(Boolean);
  const cumplidos = con.filter(v => v >= obj).length;
  const altura = num(C.S.ajustes.perfil.altura);
  return selector("pasos", r, ["7d", "1m", "6m", "1y"]) + `
  <div class="card" data-sec="p-graf"><p class="card-title">${n > 31 ? "Media diaria por semana" : "Pasos por día"}</p>${barras(puntos, { linea: obj, unidad: "pasos" })}
    <p class="muted" style="margin:0">La raya es tu objetivo (${f0(obj)} pasos). En verde, los ${n > 31 ? "periodos" : "días"} que lo cumplen.</p></div>
  <div class="card" data-sec="p-datos"><p class="card-title">Resumen</p>
    <div class="grid3">
      <div class="stat"><b>${ult7.length ? f0(ult7.reduce((a, b) => a + b, 0) / ult7.length) : "—"}</b><span>media últimos 7 días</span></div>
      <div class="stat"><b>${racha}</b><span>días seguidos cumpliendo</span></div>
      <div class="stat"><b>${con.length ? Math.round(cumplidos / con.length * 100) + " %" : "—"}</b><span>días con objetivo (${RANGO_TXT[r]})</span></div>
    </div>
    ${con.length && altura ? `<p class="muted" style="margin:0">En ${RANGO_TXT[r].toLowerCase()}: ${f0(con.reduce((a, b) => a + b, 0))} pasos, unos ${f0(A.kmPasos(con.reduce((a, b) => a + b, 0), altura))} km.</p>` : ""}
    <p class="muted" style="margin:0">El objetivo se cambia en Ajustes → Actividad y gasto.</p></div>`;
}

/* ---------- peso ---------- */
function vPeso() {
  const r = P.rango.peso, n = RANGOS[r], hoy = hoyISO(), desde = sumarDias(hoy, -(n - 1));
  const todos = A.pesajes(C.S.dias), mm = A.mediaMovil(todos, C.S.ajustes.perfil.pesajesMedia || 7).filter(p => p.fecha >= desde);
  const pc = pesoHoy();
  const ult28 = todos.filter(p => p.fecha >= sumarDias(hoy, -27));
  const pend = ult28.length >= 3 ? A.pendiente(ult28) : null;
  const ultimo = todos[todos.length - 1];
  return selector("peso", r, ["1m", "3m", "6m", "1y"]) + `
  <div class="card" data-sec="w-graf"><p class="card-title">Evolución del peso</p>
    ${mm.length ? lineas([{ nombre: "Pesajes", color: "var(--dim)", puntos: mm.map(p => ({ x: p.fecha, v: p.peso })), linea: false, puntosVisibles: true },
      { nombre: `Media de ${C.S.ajustes.perfil.pesajesMedia || 7} pesajes`, color: "var(--acc)", puntos: mm.map(p => ({ x: p.fecha, v: p.media })), grosor: 2.6 }], { decimales: 1 })
      : `<p class="muted" style="margin:0">Sin pesajes en este periodo. Apúntalos en Progreso → Día.</p>`}
    <p class="muted" style="margin:0">El peso diario baila por agua y digestión; lo que informa es la media.</p></div>
  <div class="card" data-sec="w-datos"><p class="card-title">Resumen</p>
    <div class="grid3">
      <div class="stat"><b>${ultimo ? f1(ultimo.peso) : "—"}</b><span>último · ${ultimo ? esc(C.fecha(ultimo.fecha)) : "sin pesajes"}</span></div>
      <div class="stat"><b class="acc">${pc.valor ? f1(pc.valor) : "—"}</b><span>kg para los cálculos</span></div>
      <div class="stat"><b>${pend != null ? `${pend >= 0 ? "+" : "−"}${f2(Math.abs(pend * 7))}` : "—"}</b><span>kg/semana (4 semanas)</span></div>
    </div>
    <p class="muted" style="margin:0">Peso de cálculo: ${esc(pc.fuente)}. ${pend == null ? "La tendencia necesita al menos 3 pesajes en las últimas 4 semanas." : ""}</p></div>`;
}

/* ---------- gasto ---------- */
function vGasto() {
  const r = P.rango.gasto, n = RANGOS[r], hoy = hoyISO(), ctx = ctxGasto();
  const cal = A.calibracion(sumarDias(hoy, -1), ctx);
  const usarCal = C.S.ajustes.gasto.usarCalibracion !== false && cal.listo, fac = usarCal ? cal.factor : 1;
  const fechas = Array.from({ length: n }, (_, i) => sumarDias(hoy, -(n - 1 - i)));
  const gs = fechas.map(f => A.gastoDia(f, ctx)).filter(g => g.total != null && (g.conPasos || g.entreno.series || g.cardio.length || g.ingesta != null));
  const sug = A.objetivoSugerido(hoy, ctx);
  const objActual = C.S.ajustes.objetivo.kcal;
  const conAmbos = gs.filter(g => g.ingesta != null);
  const mediaG = conAmbos.length ? conAmbos.reduce((s, g) => s + g.total * fac, 0) / conAmbos.length : 0;
  const mediaI = conAmbos.length ? conAmbos.reduce((s, g) => s + g.ingesta, 0) / conAmbos.length : 0;
  return selector("gasto", r, ["7d", "1m", "3m"]) + `
  <div class="card" data-sec="g-graf"><p class="card-title">Gasto y comida por día</p>
    ${gs.length ? lineas([{ nombre: usarCal ? "Gasto calibrado" : "Gasto estimado", color: "var(--acc)", puntos: gs.map(g => ({ x: g.fecha, v: g.total * fac })), puntosVisibles: gs.length <= 31 },
      { nombre: "Comido", color: "var(--hid)", puntos: gs.filter(g => g.ingesta != null).map(g => ({ x: g.fecha, v: g.ingesta })), puntosVisibles: gs.length <= 31, discontinua: true },
      { nombre: "Objetivo", color: "var(--mute)", puntos: [{ x: gs[0].fecha, v: objActual }, { x: gs[gs.length - 1].fecha, v: objActual }], grosor: 1.2, discontinua: true }])
      : `<p class="muted" style="margin:0">Sin datos en este periodo.</p>`}
    ${conAmbos.length ? `<div class="row"><span>Media de los ${conAmbos.length} días con comida</span><span>come ${f0(mediaI)} · gasta ${f0(mediaG)} kcal</span></div>
      <div class="row"><span>Balance medio</span><span style="color:${mediaI - mediaG > 0 ? "var(--warn)" : "var(--ok)"}"><b>${mediaI - mediaG > 0 ? "+" : "−"}${f0(Math.abs(mediaI - mediaG))}</b> kcal/día</span></div>` : ""}</div>
  <div class="card" data-sec="g-cal"><p class="card-title">Calibración con tu peso</p>
    ${cal.listo ? `
      <div class="row"><span>Comida media (${cal.diasComida} días)</span><span><b>${f0(cal.ingesta)}</b> kcal</span></div>
      <div class="row"><span>Tendencia del peso</span><span><b>${cal.kgSemana >= 0 ? "+" : "−"}${f2(Math.abs(cal.kgSemana))}</b> kg/semana</span></div>
      <div class="row"><span>Gasto real según tu peso</span><span><b>${f0(cal.real)}</b> kcal</span></div>
      <div class="row"><span>Gasto según la fórmula</span><span><b>${f0(cal.estimado)}</b> kcal</span></div>
      <div class="row total"><span>Factor de corrección</span><span><b class="mono acc">× ${f2(cal.factor)}</b>${cal.limitado ? ` <span class="muted">(salía × ${f2(cal.bruto)}, limitado a ±25 %)</span>` : ""}</span></div>
      <p class="muted" style="margin:0">Gasto real = comida media − cambio de peso × 7.700 kcal/kg, en las últimas 4 semanas (${esc(C.fecha(cal.desde))} – ${esc(C.fecha(cal.hasta))}). Solo cuenta los días con la comida completa (al menos la mitad del objetivo) y supone que los demás se parecen a ellos. ${usarCal ? "Se está aplicando." : "Desactivado en Ajustes."}</p>`
    : `<p class="muted" style="margin:0">Aún no hay datos suficientes. Falta: ${esc(cal.falta.join(", "))}. Se necesitan, en las últimas 4 semanas, ${A.CALIBRACION.pesajesMin} pesajes repartidos en al menos ${A.CALIBRACION.diasMin} días y ${A.CALIBRACION.diarioMin} días con la comida completa (al menos la mitad de tu objetivo; los días con menos seguramente tienen comidas sin apuntar y no cuentan).</p>`}</div>
  <div class="card" data-sec="g-obj"><p class="card-title">Objetivo sugerido</p>
    ${sug.listo ? `
      <div class="kcal-hero"><div><b class="mono acc">${f0(sug.sugerido)}</b><span class="muted"> kcal/día</span></div><div class="kcal-resto"><span class="muted">ahora</span><b class="mono">${f0(objActual)}</b></div></div>
      <p class="muted" style="margin:0">Media de tu gasto ${sug.calibrado ? "calibrado" : "estimado"} de los últimos ${sug.dias} días (${f0(sug.media)} kcal)${sug.ajuste ? ` ${sug.ajuste > 0 ? "+" : "−"} ${f0(Math.abs(sug.ajuste))} kcal de ajuste` : ""}.
        ${!sug.calibrado ? "Sin calibrar, la fórmula suele quedarse corta: compárala con lo que comes y con cómo evoluciona tu peso." : ""}</p>
      ${Math.abs(sug.sugerido - objActual) >= 10 ? `<div class="btn-row"><button class="btn primary" data-a="usar-objetivo" data-v="${sug.sugerido}">Usar ${f0(sug.sugerido)} kcal como objetivo</button></div>` : `<p class="muted" style="margin:0">Coincide con tu objetivo actual.</p>`}
      <p class="muted" style="margin:0">El ajuste (déficit o superávit) y la calibración se cambian en Ajustes → Actividad y gasto. La app nunca cambia tu objetivo sin que lo aceptes.</p>`
    : `<p class="muted" style="margin:0">Hacen falta al menos 4 de los últimos 7 días con actividad apuntada (pasos, entreno o cardio) y el perfil completo.</p>`}</div>`;
}

/* ---------- ajustes ---------- */
export function vAjustes() {
  const a = C.S.ajustes, g = a.gasto;
  return `<form class="card" id="aj-actividad"><p class="card-title">Actividad y gasto</p>
    <div class="grid2">
      <label class="campo">Objetivo de pasos<input name="pasosObjetivo" inputmode="numeric" value="${a.actividad.pasosObjetivo || 8000}"></label>
      <label class="campo">Digestión (% de lo comido)<input name="digestionPct" inputmode="decimal" value="${String(g.digestionPct ?? 10).replace(".", ",")}"></label>
      <label class="campo">Ajuste del objetivo sugerido (kcal)<input name="ajusteObjetivo" inputmode="numeric" value="${g.ajusteObjetivo || 0}"></label>
    </div>
    <p class="muted" style="margin:0">Ajuste: negativo para definir (por ejemplo −300), positivo para volumen, 0 para mantener.</p>
    <label class="check"><input type="checkbox" name="usarCalibracion" ${g.usarCalibracion !== false ? "checked" : ""}><span>Calibrar el gasto con la evolución de mi peso (cuando haya datos)</span></label>
    <div class="btn-row"><button class="btn primary" type="submit">Guardar</button></div></form>`;
}

/* ================= eventos ================= */
export function click(e) {
  const t = e.target;
  const s = t.closest("[data-asub]"); if (s) { P.sub = s.dataset.asub; P.cardio = null; C.render(); return true; }
  const rg = t.closest("[data-arango]"); if (rg) { const [k, v] = rg.dataset.arango.split(":"); P.rango[k] = v; C.render(); return true; }
  const b = t.closest("[data-a]"); if (!b) return false;
  switch (b.dataset.a) {
    case "dia": P.fecha = sumarDias(P.fecha, +b.dataset.n); if (P.fecha > hoyISO()) P.fecha = hoyISO(); P.cardio = null; break;
    case "hoy": P.fecha = hoyISO(); P.cardio = null; break;
    case "cardio-nuevo": P.cardio = { tipo: b.dataset.v, idx: null }; break;
    case "cardio-editar": { const c = (diaDe(P.fecha) || {}).cardio[+b.dataset.i]; P.cardio = { tipo: c.tipo, idx: +b.dataset.i }; break; }
    case "cardio-cancelar": P.cardio = null; break;
    case "cardio-borrar": { const i = P.cardio.idx; guardarDia(P.fecha, d => d.cardio.splice(i, 1)); P.cardio = null; C.toast("Cardio quitado."); break; }
    case "usar-objetivo": {
      const v = +b.dataset.v;
      C.confirmar(`Cambiar el objetivo a ${f0(v)} kcal`, `Tu objetivo diario pasa de ${f0(C.S.ajustes.objetivo.kcal)} a ${f0(v)} kcal. Los macros en % se recalculan solos; los que van en g/kg no cambian.`, "Cambiar", () => {
        C.S.ajustes.objetivo.kcal = v; C.DB.guardarAjustes(C.S.user.uid, C.S.ajustes).catch(fallo); C.toast("Objetivo actualizado."); C.render();
      });
      return true;
    }
    default: return false;
  }
  C.render(); return true;
}
export function change(t) {
  if (t.id === "a-fecha") { P.fecha = t.value && t.value <= hoyISO() ? t.value : hoyISO(); P.cardio = null; C.render(); return true; }
  if (t.id === "a-pasos") { const v = Math.round(num(t.value) || 0); guardarDia(P.fecha, d => d.pasos = v); C.render(); return true; }
  if (t.id === "a-peso") {
    const v = num(t.value);
    if (v != null && v > 0 && (v < 30 || v > 250)) { C.toast("Ese peso no parece correcto."); return true; }
    guardarDia(P.fecha, d => d.peso = v ? Math.round(v * 10) / 10 : 0); C.render(); return true;
  }
  return false;
}
export function submit(form) {
  if (form.id === "a-cardio") {
    const fd = new FormData(form), tipo = P.cardio.tipo, idx = P.cardio.idx;
    const c = { id: idx != null ? ((diaDe(P.fecha) || {}).cardio[idx] || {}).id || nId() : nId(), tipo, min: num(fd.get("min")) };
    if (tipo === "cinta") Object.assign(c, { velocidad: num(fd.get("velocidad")), inclinacion: num(fd.get("inclinacion")) ?? 0, km: num(fd.get("km")), pasosReloj: num(fd.get("pasosReloj")), llevaba: !!fd.get("llevaba") });
    else Object.assign(c, { vatios: num(fd.get("vatios")), intensidad: fd.get("intensidad") || "moderada" });
    if (!A.cardioMin(c)) { C.toast(tipo === "cinta" ? "Pon los minutos, o la distancia y la velocidad." : "Pon los minutos."); return true; }
    if (tipo === "cinta" && !c.velocidad) { C.toast("Pon la velocidad."); return true; }
    guardarDia(P.fecha, d => { d.cardio = d.cardio || []; if (idx != null) d.cardio[idx] = c; else d.cardio.push(c); });
    P.cardio = null; C.toast("Cardio guardado."); C.render(); return true;
  }
  if (form.id === "aj-actividad") {
    const fd = new FormData(form), a = C.S.ajustes;
    a.actividad.pasosObjetivo = Math.max(1000, Math.round(num(fd.get("pasosObjetivo")) || 8000));
    a.gasto.digestionPct = Math.min(20, Math.max(0, num(fd.get("digestionPct")) ?? 10));
    a.gasto.ajusteObjetivo = Math.round(num(fd.get("ajusteObjetivo")) || 0);
    a.gasto.usarCalibracion = !!fd.get("usarCalibracion");
    C.DB.guardarAjustes(C.S.user.uid, a).catch(fallo); C.toast("Guardado."); C.render(); return true;
  }
  return false;
}
