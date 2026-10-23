/* V.I.T.A. — Progreso: actividad del día (pasos, sueño, peso, cardio),
   gráficas de pasos, sueño y peso, y gasto con calibración y objetivo sugerido.
   Los pasos y el sueño pueden llegar solos desde Health Connect (app
   compañera): por eso los días se guardan campo a campo, sin pisar el resto.
   Los cálculos están en actividad-calc.js. */

import { hoyISO, toISO } from "./model.js";
import * as A from "./actividad-calc.js";
import * as K from "./comida-calc.js";
import { relacionSueno } from "./semana-calc.js";

let C = null;
export function init(ctx) { C = ctx; }

const P = { sub: "dia", fecha: hoyISO(), rango: { pasos: "1m", sueno: "1m", peso: "3m", gasto: "1m" }, cardio: null, sueno: false, medidasAbiertas: false, medidaGraf: "cintura" };
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
/* Guarda solo los campos que cambian (null = quitar el campo). Si el día se
   queda sin datos, se borra. Así no se pisa lo que escriba la app compañera. */
const DATOS_DIA = ["pasos", "peso", "cardio", "sueno", "grasaPct", "musculoKg", "medidas"];
function guardarDia(f, campos) {
  let d = diaDe(f);
  if (!d) { d = { fecha: f }; C.S.dias.push(d); }
  const limpio = {};
  Object.entries(campos).forEach(([k, v]) => {
    const vacio = v == null || (Array.isArray(v) && !v.length);
    if (vacio) delete d[k]; else d[k] = v;
    limpio[k] = vacio ? null : JSON.parse(JSON.stringify(v));
  });
  if (!DATOS_DIA.some(k => d[k] != null)) {
    C.S.dias = C.S.dias.filter(x => x !== d); C.DB.borrarDoc(C.S.user.uid, "dias", f).catch(fallo);
  } else C.DB.actualizarDoc(C.S.user.uid, "dias", f, { fecha: f, ...limpio }).catch(fallo);
}
const hayHC = () => C.S.dias.some(d => d.sincronizado || d.pasosFuente === "health-connect" || (d.sueno && d.sueno.fuente === "health-connect"));
const fuenteTxt = fu => fu === "health-connect" ? `<span class="chip fuente-hc">Health Connect</span>` : fu === "manual" ? `<span class="chip">a mano</span>` : "";
const objSueno = () => (C.S.ajustes.sueno || {}).objetivoH || A.SUENO_OBJETIVO_H;
const colorSueno = (min, obj) => min >= obj * 60 ? "var(--ok)" : min >= obj * 60 - 60 ? "var(--acc)" : "var(--warn)";
const FASES = [{ k: "profundo", n: "Profundo", c: "var(--gra)" }, { k: "ligero", n: "Ligero", c: "var(--acc)" }, { k: "rem", n: "REM", c: "var(--prot)" }, { k: "despierto", n: "Despierto", c: "var(--hid)" }];
/* Barra apilada de fases (minutos) con leyenda */
export function barraFases(fases) {
  if (!fases) return "";
  const tot = FASES.reduce((s, x) => s + (fases[x.k] || 0), 0); if (!tot) return "";
  return `<div class="fases">${FASES.map(x => fases[x.k] > 0 ? `<i style="width:${fases[x.k] / tot * 100}%;background:${x.c}" title="${x.n}"></i>` : "").join("")}</div>
    <div class="leyenda">${FASES.filter(x => fases[x.k] > 0).map(x => `<span><i style="background:${x.c}"></i>${x.n} ${A.horasTxt(fases[x.k]).replace(/^0 h /, "")} · ${Math.round(fases[x.k] / tot * 100)} %</span>`).join("")}</div>`;
}
export function nuevoDia(antes, hoy) { if (P.fecha === antes) P.fecha = hoy; }
export function irHoy(sub = "dia") { P.sub = sub; P.fecha = hoyISO(); P.cardio = null; P.sueno = false; }
export function pesoHoy() { return A.pesoEn(C.S.dias, C.S.ajustes.perfil, hoyISO()); }

/* ---------- gráficas SVG ---------- */
function barras(puntos, { linea = null, color = "var(--acc)", alto = 200, unidad = "", fmt = f0, rejilla = null } = {}) {
  const W = 480, H = alto, L = 40, R = 6, T = 10, B = 26;
  let max = Math.max(1, linea || 0, ...puntos.map(p => p.v || 0)) * 1.08;
  if (rejilla) max = Math.ceil(max / rejilla) * rejilla * 1.08;   // líneas en múltiplos de «rejilla» (p. ej. cada 2 h)
  const gap = (W - L - R) / Math.max(1, puntos.length), bw = Math.max(2, Math.min(26, gap * 0.72));
  const y = v => H - B - v / max * (H - T - B);
  const paso = Math.max(1, Math.ceil(puntos.length / 7));
  const marcas = rejilla ? Array.from({ length: Math.round(max / 1.08 / rejilla) + 1 }, (_, i) => i * rejilla) : [0, 1, 2, 3].map(i => max / 1.08 * i / 3);
  const grid = marcas.map(v => { const yy = y(v); return `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" class="g-grid"/><text x="${L - 5}" y="${yy + 4}" text-anchor="end" class="g-txt">${fmt(v)}</text>`; }).join("");
  // p.segs = [{ v, color }] apila tramos de abajo arriba (p. ej. fases del sueño); su suma es p.v
  const bars = puntos.map((p, i) => { const x = L + i * gap + (gap - bw) / 2;
    let base = 0;
    const tramos = p.segs ? p.segs.filter(sg => sg.v > 0).map(sg => { const y0 = y(base + sg.v), h = y(base) - y0; base += sg.v;
      return `<rect x="${x}" y="${y0}" width="${bw}" height="${h}" fill="${sg.color}"/>`; }).join("") : "";
    return (p.v > 0 ? (p.segs ? `<g><title>${esc(p.titulo || p.x)}: ${esc(p.detalle || `${fmt(p.v)} ${unidad}`)}</title>${tramos}</g>`
      : `<rect x="${x}" y="${y(p.v)}" width="${bw}" height="${H - B - y(p.v)}" rx="2" fill="${p.color || color}"><title>${esc(p.titulo || p.x)}: ${fmt(p.v)} ${unidad}</title></rect>`) : "")
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
  const subs = [["dia", "Día"], ["semana", "Semana"], ["pasos", "Pasos"], ["sueno", "Sueño"], ["peso", "Peso"], ["gasto", "Gasto"]];
  const cuerpo = ({ dia: vDia, semana: () => C.vSemana(), pasos: vPasos, sueno: vSueno, peso: vPeso, gasto: vGasto }[P.sub] || vDia)();
  return `<div class="label">Progreso</div>
  <div class="seg seg6" role="tablist">${subs.map(([k, n]) => `<button data-asub="${k}" aria-pressed="${P.sub === k}">${n}</button>`).join("")}</div>
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
    <div class="fila-fuente">${d.pasos ? fuenteTxt(d.pasosFuente) : ""}${d.pasosFuente === "manual" && hayHC() ? `<button class="btn sm" data-a="pasos-hc">Dejar a Health Connect</button>` : ""}</div>
    <p class="muted" style="margin:0">${hayHC() ? "Llegan solos desde Health Connect. Si los cambias aquí, quedan «a mano» y la sincronización no los toca." : "De momento se apuntan a mano (por ejemplo, los de Mi Fitness al final del día). Cuando funcione la app compañera, llegarán solos desde Health Connect."}</p></div>
  ${tarjetaSueno(f, d)}
  <div class="card" data-sec="d-peso"><p class="card-title">Peso</p>
    <div class="fila-dato"><input class="num grande" id="a-peso" inputmode="decimal" value="${d.peso ? String(d.peso).replace(".", ",") : ""}" placeholder="kg" aria-label="Peso del día en kg"><span class="muted">kg · opcional</span></div>
    <p class="muted" style="margin:0">Peso para los cálculos de este día: ${g.peso ? `<b>${f1(g.peso)} kg</b> (${esc(g.pesoFuente)})` : "falta"}.</p>
    <div class="sub-label">Báscula de bioimpedancia · opcional</div>
    <div class="grid2">
      <label class="campo">Grasa (%)<input id="a-grasa" inputmode="decimal" value="${d.grasaPct ? String(d.grasaPct).replace(".", ",") : ""}" placeholder="%"></label>
      <label class="campo">Masa muscular (kg)<input id="a-musculo" inputmode="decimal" value="${d.musculoKg ? String(d.musculoKg).replace(".", ",") : ""}" placeholder="kg"></label>
    </div>
    ${d.grasaPct && d.peso ? `<p class="muted" style="margin:0">Masa grasa <b>${f1(d.peso * d.grasaPct / 100)} kg</b> · masa magra (todo lo que no es grasa) <b>${f1(d.peso * (1 - d.grasaPct / 100))} kg</b>.</p>` : ""}
    ${d.grasaPct && !d.peso ? `<p class="muted" style="margin:0">Apunta también el peso de hoy para calcular la masa grasa y la magra.</p>` : ""}
    <p class="muted" style="margin:0">Estimaciones de la báscula: un día suelto puede fallar varios puntos, sobre todo por el agua del cuerpo. Mide siempre igual (por la mañana, en ayunas, tras orinar, descalzo y con los pies secos) y fíjate en la tendencia de varias semanas (Progreso → Peso).</p>
    ${bloqueMedidas(d)}</div>
  <div class="card" data-sec="d-cardio"><p class="card-title">Cardio</p>
    ${(d.cardio || []).map((c, i) => `<button class="item" data-a="cardio-editar" data-i="${i}"><span class="item-main"><b>${TIPO_CARDIO[c.tipo] || "Cardio"} · ${f1(A.cardioMin(c))} min</b>
      <span class="muted">${A.esCinta(c) ? `${f1(A.velocidadCinta(c))} km/h · ${f1(c.inclinacion)} %${c.km ? ` · ${f2(c.km)} km` : ""}${c.pasosReloj ? ` · ${f0(c.pasosReloj)} pasos` : c.tipo === "carrera" && c.llevaba !== false ? ` · ≈ ${f0(A.cardioPasos(c))} pasos (estimados)` : ""}${c.llevaba === false ? " · sin reloj" : ""}` : (c.vatios ? `${f0(c.vatios)} W` : `intensidad ${c.intensidad || "moderada"}`)}</span></span>
      <span class="item-kcal mono">${f0(A.cardioKcal(c, g.peso))}</span></button>`).join("") || `<p class="muted" style="margin:0">Sin cardio este día.</p>`}
    ${P.cardio ? formCardio(d) : `<div class="btn-row"><button class="btn sm" data-a="cardio-nuevo" data-v="cinta">${C.icon("mas", 16)}Andar en cinta</button><button class="btn sm" data-a="cardio-nuevo" data-v="carrera">${C.icon("mas", 16)}Correr en cinta</button><button class="btn sm" data-a="cardio-nuevo" data-v="bici">${C.icon("mas", 16)}Bici</button></div>`}</div>
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
/* ---------- medidas corporales ----------
   Icono: una figura de frente con la cinta (en color) en la zona que se mide.
   En las medidas de lado se marca un lado de la figura. */
const CINTA = {
  antebrazo: "M4.6 18.4h4.4", brazo: "M6.6 12.6h4.2", pecho: "M10.4 12h11.2", hombros: "M6.8 10.2q9.2-2.6 18.4 0",
  cintura: "M11.4 16.6h9.2", cadera: "M10.8 20.4h10.4", muslo: "M10.9 22.8h4", gemelo: "M10.8 27.6h3.6"
};
export function iconoMedida(k, tam = 38) {
  return `<svg class="ico-medida" width="${tam}" height="${tam}" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="var(--mute)" stroke-width="1.3"><circle cx="16" cy="4.6" r="2.6"/><path d="M10 9h12l-1.5 10h-9z"/>
    <path d="M10 9.4 7.6 15.4 6.6 21M22 9.4l2.4 6 1 5.6M13 19l-.5 6v6M19 19l.5 6v6"/></g>
    <path d="${CINTA[k] || ""}" stroke="var(--acc)" stroke-width="2.4"/></svg>`;
}
const fMed = v => v == null ? "" : String(v).replace(".", ",");
function bloqueMedidas(d) {
  const m = d.medidas || {}, n = A.CAMPOS_MEDIDAS.filter(c => m[c] > 0).length;
  const abierto = P.medidasAbiertas || n > 0;
  return `<div class="sub-label">Medidas corporales (cm) · opcional</div>
    ${abierto ? `<div class="medidas">${A.MEDIDAS.map(x => `<div class="medida">
        ${iconoMedida(x.k)}
        <div class="medida-nom"><b>${x.n}</b><span class="muted">${x.como}</span></div>
        <div class="medida-val">${A.camposMedida(x).map(c => `<label class="medida-campo">${x.par ? `<span>${c.endsWith("D") ? "D" : "I"}</span>` : ""}<input id="a-med-${c}" data-med="${c}" inputmode="decimal" value="${fMed(m[c])}" placeholder="cm" aria-label="${x.n}${x.par ? (c.endsWith("D") ? " derecho" : " izquierdo") : ""} en cm"></label>`).join("")}</div>
      </div>`).join("")}</div>
      <p class="muted" style="margin:0">Apunta solo las que midas. D = lado derecho, I = izquierdo. Mide siempre en el mismo punto, por la mañana, con la cinta ajustada sin apretar la piel. La evolución está en Progreso → Peso.</p>`
    : `<div class="btn-row"><button class="btn sm" data-a="medidas-abrir">${C.icon("mas", 16)}Apuntar medidas</button></div>`}`;
}

/* ---------- sueño del día (la noche anterior) ---------- */
const hm = min => `${Math.floor(min / 60)}<small>h</small> ${String(Math.round(min % 60)).padStart(2, "0")}<small>min</small>`;
const horaDe = iso => iso && /T\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : "";
function tarjetaSueno(f, d) {
  const s = A.suenoDe(d), obj = objSueno();
  const col = s ? colorSueno(s.min, obj) : "var(--acc)";
  return `<div class="card" data-sec="d-sueno"><p class="card-title">Sueño de la noche anterior</p>
    ${s ? `<div class="kcal-hero"><div><b class="mono" style="color:${col}">${hm(s.min)}</b><span class="muted"> de ${f1(obj)} h</span></div>
      ${horaDe(s.inicio) && horaDe(s.fin) ? `<div class="kcal-resto"><span class="muted">acostarse – despertar</span><b class="mono">${horaDe(s.inicio)}–${horaDe(s.fin)}</b></div>` : ""}</div>
      <div class="mbar-pista grande"><i style="width:${Math.min(100, s.min / (obj * 60) * 100)}%;background:${col}"></i></div>
      ${barraFases(s.fases)}
      <div class="fila-fuente">${fuenteTxt(s.fuente)}${s.sesiones > 1 ? `<span class="muted">${s.sesiones} periodos (incluye siestas)</span>` : ""}</div>` : ""}
    ${P.sueno || !s ? formSueno(s) : `<div class="btn-row">${s.fuente === "manual" && hayHC() ? `<button class="btn sm" data-a="sueno-hc">Dejar a Health Connect</button>` : ""}<button class="btn sm" data-a="sueno-editar">${C.icon("lapiz", 16)}Corregir</button></div>`}</div>`;
}
function formSueno(s) {
  const h = s ? `${Math.floor(s.min / 60)}:${String(Math.round(s.min % 60)).padStart(2, "0")}` : "";
  return `<form id="a-sueno" class="pila-form${s ? " sub-form" : ""}">
    <div class="grid3">
      <label class="campo">Horas dormidas<input name="horas" inputmode="decimal" value="${h}" placeholder="7:30"></label>
      <label class="campo">Me acosté<input name="acostarse" type="time" value="${s ? horaDe(s.inicio) : ""}"></label>
      <label class="campo">Me desperté<input name="despertar" type="time" value="${s ? horaDe(s.fin) : ""}"></label></div>
    <p class="muted" style="margin:0">Horas dormidas sin contar los ratos despierto, como las da el reloj («7:30» o «7,5»). Si solo pones las horas de acostarte y despertarte, se usa la diferencia. ${hayHC() ? "Lo que corrijas aquí queda «a mano» y la sincronización no lo toca." : "Cuando funcione la app compañera, llegará solo desde Health Connect, con las fases."}</p>
    <div class="btn-row">${s ? `<button class="btn sm danger" type="button" data-a="sueno-borrar">${C.icon("papelera", 16)}Quitar</button><button class="btn sm" type="button" data-a="sueno-cancelar">Cancelar</button>` : ""}<button class="btn sm primary" type="submit">Guardar</button></div></form>`;
}
const TIPO_CARDIO = { cinta: "Andar en cinta", carrera: "Correr en cinta", bici: "Bici" };
function formCardio(d) {
  const c = P.cardio.idx != null ? (d.cardio || [])[P.cardio.idx] || {} : {};
  const t = P.cardio.tipo, v = k => c[k] != null && c[k] !== "" ? String(c[k]).replace(".", ",") : "";
  return `<form id="a-cardio" class="pila-form sub-form">
    <div class="sub-label">${P.cardio.idx != null ? "Editar" : "Nuevo"}: ${TIPO_CARDIO[t].toLowerCase()}</div>
    ${t === "carrera" ? `<div class="grid2">
      <label class="campo">Minutos<input name="min" inputmode="decimal" value="${v("min")}"></label>
      <label class="campo">Distancia (km)<input name="km" inputmode="decimal" value="${v("km")}"></label>
      <label class="campo">Inclinación (%)<input name="inclinacion" inputmode="decimal" value="${v("inclinacion")}" placeholder="0"></label>
      <label class="campo">Velocidad (km/h)<input name="velocidad" inputmode="decimal" value="${v("velocidad")}" placeholder="opcional"></label>
      <label class="campo">Pasos del reloj<input name="pasosReloj" inputmode="numeric" value="${v("pasosReloj")}" placeholder="opcional"></label></div>
      <label class="check"><input type="checkbox" name="llevaba" ${c.llevaba !== false ? "checked" : ""}><span>Llevaba el reloj (sus pasos ya están en el total del día)</span></label>
      <p class="muted" style="margin:0">Lo más fiable: al terminar, apunta el <b>tiempo</b> y la <b>distancia</b> que marca la cinta; la velocidad media se calcula sola (solo hace falta ponerla si no tienes la distancia). Si has cambiado de ritmo no pasa nada: el gasto depende de la distancia total. Si has cambiado la inclinación, pon la media. Si alternas andar y correr, apúntalo como dos registros (andar y correr). Los pasos de la carrera se descuentan del día; si no los apuntas, se estiman (${A.CADENCIA_CARRERA} por minuto, aproximado).</p>`
    : t === "cinta" ? `<div class="grid2">
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

/* ---------- sueño ---------- */
function vSueno() {
  const r = P.rango.sueno, n = RANGOS[r], hoy = hoyISO(), obj = objSueno();
  const fechas = Array.from({ length: n }, (_, i) => sumarDias(hoy, -(n - 1 - i)));
  const res = A.resumenSueno(C.S.dias, fechas, obj);
  // Cada noche: profundo, ligero y REM apilados; lo dormido sin detalle de fase (noches a mano o sin fases) en gris
  const puntos = fechas.map(f => {
    const s = A.suenoDe(diaDe(f)); if (!s) return { x: corta(f), v: 0 };
    const fa = s.fases || {}, crudo = k => Math.max(0, fa[k] || 0);
    const suma = crudo("profundo") + crudo("ligero") + crudo("rem");
    const k0 = suma > s.min ? s.min / suma : 1, en = k => crudo(k) * k0;   // por si las fases suman más que lo dormido
    const conFase = Math.min(s.min, suma * k0);
    const segs = [...FASES.filter(x => x.k !== "despierto").map(x => ({ v: en(x.k) / 60, color: x.c })), { v: Math.max(0, s.min - conFase) / 60, color: "var(--mute)" }];
    const detalle = `${A.horasTxt(s.min)}${s.fases ? ` (profundo ${A.horasTxt(en("profundo"))}, ligero ${A.horasTxt(en("ligero"))}, REM ${A.horasTxt(en("rem"))})` : " · sin fases"}`;
    return { x: corta(f), titulo: `Noche al ${corta(f)}`, v: s.min / 60, segs, detalle };
  });
  const hayFases = fechas.some(f => { const s = A.suenoDe(diaDe(f)); return s && s.fases; });
  const haySinFases = fechas.some(f => { const s = A.suenoDe(diaDe(f)); return s && !s.fases; });
  const leyendaFases = `<div class="leyenda">${hayFases ? FASES.filter(x => x.k !== "despierto").map(x => `<span><i style="background:${x.c}"></i>${x.n}</span>`).join("") : ""}${haySinFases ? `<span><i style="background:var(--mute)"></i>Sin fases</span>` : ""}</div>`;
  const fasesTxt = res.fases ? barraFases(res.fases) : `<p class="muted" style="margin:0">Las fases llegarán con Health Connect si Mi Fitness las escribe; a mano solo se guardan las horas.</p>`;
  // Análisis: últimos 90 días completos (hoy no, que aún no ha terminado)
  const desde = sumarDias(hoy, -90), hasta = sumarDias(hoy, -1);
  const rel = relacionSueno({ alimentos: C.S.alimentos, diario: C.S.diario, dias: C.S.dias, sesiones: C.S.sesiones, ajustes: C.S.ajustes }, desde, hasta, hoy);
  const MIN = 3, validos = rel.filter(g => g.noches >= MIN);
  const celda = (g, v) => g.noches < MIN ? `<span class="muted">—</span>` : v;
  const filaRel = (nombre, fn) => `<tr><th>${nombre}</th>${rel.map(g => `<td>${celda(g, fn(g))}</td>`).join("")}</tr>`;
  const val = (v, fmt, n) => v == null ? `<span class="muted">—</span>` : `${fmt(v)}${n != null ? `<small class="muted"> (${n})</small>` : ""}`;
  return selector("sueno", r, ["7d", "1m", "3m"]) + `
  <div class="card" data-sec="z-graf"><p class="card-title">Horas dormidas por noche</p>
    ${res.noches ? barras(puntos, { linea: obj, unidad: "h", fmt: f1, rejilla: 2 }) : `<p class="muted" style="margin:0">Sin noches apuntadas en este periodo. Apúntalas en Progreso → Día.</p>`}
    ${res.noches ? leyendaFases : ""}
    <p class="muted" style="margin:0">La raya es tu objetivo (${f1(obj)} h). Cada barra es el tiempo dormido de la noche, sin los ratos despierto, repartido por fases. Las noches sin fases (las apuntadas a mano o sin detalle del reloj) van en gris. Cada noche va en el día en que te despiertas.</p></div>
  ${res.noches ? `<div class="card" data-sec="z-datos"><p class="card-title">Resumen · ${RANGO_TXT[r]}</p>
    <div class="grid3">
      <div class="stat"><b style="color:${colorSueno(res.mediaMin, obj)}">${f1(res.mediaMin / 60)}</b><span>horas de media (${res.noches} noches)</span></div>
      <div class="stat"><b>${Math.round(res.conObjetivo / res.noches * 100)} %</b><span>noches con ${f1(obj)} h o más</span></div>
      <div class="stat"><b>${f1(res.minMin / 60)}–${f1(res.maxMin / 60)}</b><span>la más corta y la más larga</span></div>
    </div>
    ${res.acostarseMedia != null ? `<div class="row"><span>Hora media de acostarse</span><span><b>${A.horaReloj(res.acostarseMedia)}</b>${res.regularidad ? ` <span class="muted">± ${f0(res.regularidad.acostarse)} min</span>` : ""}</span></div>` : ""}
    ${res.despertarMedia != null ? `<div class="row"><span>Hora media de despertar</span><span><b>${A.horaReloj(res.despertarMedia)}</b>${res.regularidad && res.regularidad.despertar != null ? ` <span class="muted">± ${f0(res.regularidad.despertar)} min</span>` : ""}</span></div>` : ""}
    ${res.regularidad ? `<p class="muted" style="margin:0">El «±» es la variación típica (desviación estándar) de la hora: cuanto menor, más regular es tu horario.</p>` : ""}
    <div class="sub-label" style="margin-top:6px">Fases de media${res.fases ? ` · ${res.fases.noches} noches` : ""}</div>${fasesTxt}</div>` : ""}
  <div class="card" data-sec="z-rel"><p class="card-title">Sueño y tus días</p>
    <p class="muted" style="margin:0">Últimos 90 días. Agrupa las noches por lo que dormiste y compara el día siguiente. Entre paréntesis, cuántos días tienen ese dato. Hace falta al menos ${MIN} noches en un grupo para mostrarlo.</p>
    ${validos.length >= 2 ? `<div class="tabla-scroll"><table class="tabla-rel">
      <thead><tr><th></th>${rel.map(g => `<th>${esc(g.nombre)}<small>${g.noches} noches</small></th>`).join("")}</tr></thead>
      <tbody>
        ${filaRel("Comido", g => val(g.kcal, v => `${f0(v)} kcal`, g.diasComida))}
        ${filaRel("Proteína", g => val(g.prot, v => `${f0(v)} g`, g.diasComida))}
        ${filaRel("Balance", g => val(g.balance, v => `${v > 0 ? "+" : "−"}${f0(Math.abs(v))} kcal`, g.diasBalance))}
        ${filaRel("Pasos", g => val(g.pasos, f0, g.diasPasos))}
        ${filaRel("Días con entreno", g => val(g.pctEntreno, v => `${f0(v)} %`, null))}
        ${filaRel("Volumen por sesión", g => val(g.volumenSesion, v => `${f0(v)} kg`, null))}
      </tbody></table></div>
      <p class="muted" style="margin:0">Es una asociación, no una causa: un día malo puede venir de dormir poco o al revés, y con pocos días las diferencias pueden ser casualidad. Fíjate en las que se repiten con el tiempo.</p>`
    : `<p class="muted" style="margin:0">Aún no hay datos suficientes: hacen falta al menos dos grupos con ${MIN} noches o más (ahora: ${rel.map(g => `${esc(g.nombre)} ${g.noches}`).join(" · ")}).</p>`}</div>`;
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
    <p class="muted" style="margin:0">Peso de cálculo: ${esc(pc.fuente)}. ${pend == null ? "La tendencia necesita al menos 3 pesajes en las últimas 4 semanas." : ""}</p></div>
  ${tarjetaComposicion(desde, hoy)}
  ${tarjetaMedidas(desde)}`;
}
/* Medidas corporales: última de cada una con su cambio y la gráfica de la elegida */
function tarjetaMedidas(desde) {
  const R = A.resumenMedidas(C.S.dias, desde);
  const con = A.MEDIDAS.filter(x => A.camposMedida(x).some(c => R[c]));
  if (!con.length) return `<div class="card" data-sec="w-med"><p class="card-title">Medidas corporales</p>
    <p class="muted" style="margin:0">Sin medidas apuntadas. Se apuntan en Progreso → Día, en el apartado Peso.</p></div>`;
  const sel = con.find(x => x.k === P.medidaGraf) || con[0];
  const cambio = v => v == null ? "" : `<span class="dif">${v > 0 ? "+" : v < 0 ? "−" : "±"}${f1(Math.abs(v))}</span>`;
  const celda = c => { const r = R[c]; return r ? `<b>${f1(r.ultima.v)}</b> <small class="muted">${esc(corta(r.ultima.fecha))}</small> ${cambio(r.cambio)}` : `<span class="muted">—</span>`; };
  const ult = k => R[k] && R[k].ultima.v;
  const icc = ult("cintura") && ult("cadera") ? ult("cintura") / ult("cadera") : null;
  const series = A.camposMedida(sel).map((c, i) => ({ nombre: sel.par ? (i === 0 ? "Derecho" : "Izquierdo") : sel.n, color: i === 0 ? "var(--acc)" : "var(--gra)",
    puntos: A.serieMedida(C.S.dias, c).filter(p => p.fecha >= desde).map(p => ({ x: p.fecha, v: p.v })), puntosVisibles: true })).filter(s => s.puntos.length);
  return `<div class="card" data-sec="w-med"><p class="card-title">Medidas corporales</p>
    <div class="medidas">${con.map(x => `<button class="medida medida-btn" data-a="medida-graf" data-v="${x.k}" aria-pressed="${x.k === sel.k}">
      ${iconoMedida(x.k)}<span class="medida-nom"><b>${x.n}</b></span>
      <span class="medida-res">${x.par ? `<span>D ${celda(x.k + "D")}</span><span>I ${celda(x.k + "I")}</span>` : `<span>${celda(x.k)}</span>`}</span></button>`).join("")}</div>
    <p class="muted" style="margin:0">Última medida (cm), su fecha y el cambio frente a la anterior. Toca una para ver su evolución.</p>
    <div class="sub-label">${esc(sel.n)} · ${RANGO_TXT[P.rango.peso].toLowerCase()}</div>
    ${series.some(s => s.puntos.length) ? lineas(series, { decimales: 1, alto: 170 }) : `<p class="muted" style="margin:0">Sin medidas de ${esc(sel.n.toLowerCase())} en este periodo.</p>`}
    ${A.camposMedida(sel).map(c => R[c] && R[c].cambioRango != null ? `<div class="row"><span>${esc(sel.n)}${sel.par ? (c.endsWith("D") ? " derecho" : " izquierdo") : ""} en el periodo</span><span>${cambio(R[c].cambioRango)} cm <span class="muted">desde el ${esc(corta(R[c].primeraRango.fecha))}</span></span></div>` : "").join("")}
    ${icc ? `<div class="row"><span>Cintura / cadera (últimas)</span><span><b>${icc.toFixed(2).replace(".", ",")}</b></span></div>` : ""}</div>`;
}
/* Composición corporal de la báscula: tendencia (media de los últimos 7 registros) y medias de 4 semanas */
function tarjetaComposicion(desde, hoy) {
  const todos = A.composiciones(C.S.dias);
  if (!todos.length) return `<div class="card" data-sec="w-comp"><p class="card-title">Composición corporal</p>
    <p class="muted" style="margin:0">Sin datos de la báscula. Apunta el % de grasa y la masa muscular en Progreso → Día, junto al peso.</p></div>`;
  const N = 7;
  const grasa = A.mediaMovilDe(todos, "grasaPct", N).filter(p => p.fecha >= desde);
  const gk = A.mediaMovilDe(todos, "grasaKg", N).filter(p => p.fecha >= desde), mk = A.mediaMovilDe(todos, "magraKg", N).filter(p => p.fecha >= desde);
  const mu = A.mediaMovilDe(todos, "musculoKg", N).filter(p => p.fecha >= desde);
  const R4 = A.resumenComposicion(C.S.dias, hoy, 28);
  const fila = (n, k, u, dec = 1) => R4.actual[k] == null ? "" : `<div class="row"><span>${n}</span><span><b>${f1(R4.actual[k])}</b> ${u}${R4.cambio[k] != null ? ` <span class="muted">(${R4.cambio[k] >= 0 ? "+" : "−"}${f1(Math.abs(R4.cambio[k]))} frente a las 4 semanas anteriores)</span>` : ""}</span></div>`;
  return `<div class="card" data-sec="w-comp"><p class="card-title">Composición corporal</p>
    ${grasa.length ? `<div class="sub-label">% de grasa</div>${lineas([{ nombre: "Medidas", color: "var(--dim)", puntos: grasa.map(p => ({ x: p.fecha, v: p.peso })), linea: false, puntosVisibles: true },
      { nombre: `Media de ${N} medidas`, color: "var(--gra)", puntos: grasa.map(p => ({ x: p.fecha, v: p.media })), grosor: 2.6 }], { decimales: 1, alto: 180 })}` : ""}
    ${gk.length >= 2 ? `<div class="sub-label">Masa grasa y masa magra (kg, media de ${N})</div>${lineas([{ nombre: "Masa magra", color: "var(--acc)", puntos: mk.map(p => ({ x: p.fecha, v: p.media })), puntosVisibles: mk.length <= 31 }], { decimales: 1, alto: 150 })}
      ${lineas([{ nombre: "Masa grasa", color: "var(--gra)", puntos: gk.map(p => ({ x: p.fecha, v: p.media })), puntosVisibles: gk.length <= 31 }], { decimales: 1, alto: 150 })}` : ""}
    ${mu.length >= 2 ? `<div class="sub-label">Masa muscular (kg, media de ${N})</div>${lineas([{ nombre: "Masa muscular", color: "var(--ok)", puntos: mu.map(p => ({ x: p.fecha, v: p.media })), puntosVisibles: mu.length <= 31 }], { decimales: 1, alto: 150 })}` : ""}
    ${R4.actual.n ? `<div class="sub-label">Media de las últimas 4 semanas · ${R4.actual.n} ${R4.actual.n === 1 ? "medida" : "medidas"}</div>
      ${fila("Grasa", "grasaPct", "%")}${fila("Masa grasa", "grasaKg", "kg")}${fila("Masa magra", "magraKg", "kg")}${fila("Masa muscular", "musculoKg", "kg")}` : ""}
    <p class="muted" style="margin:0">Son estimaciones de la báscula (bioimpedancia): cada medida suelta puede fallar varios puntos, sobre todo por el agua del cuerpo. Lo que informa es la tendencia de varias semanas medida siempre en las mismas condiciones. Masa magra = peso − masa grasa (incluye músculo, agua, órganos y hueso); solo se calcula los días con peso y % de grasa.</p></div>`;
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
      <label class="campo">Objetivo de sueño (horas)<input name="suenoObjetivo" inputmode="decimal" value="${String(objSueno()).replace(".", ",")}"></label>
    </div>
    <p class="muted" style="margin:0">Ajuste: negativo para definir (por ejemplo −300), positivo para volumen, 0 para mantener. Sueño: la AASM y la Sleep Research Society recomiendan 7 horas o más a los adultos.</p>
    <label class="check"><input type="checkbox" name="usarCalibracion" ${g.usarCalibracion !== false ? "checked" : ""}><span>Calibrar el gasto con la evolución de mi peso (cuando haya datos)</span></label>
    <div class="btn-row"><button class="btn primary" type="submit">Guardar</button></div></form>`;
}

/* ================= eventos ================= */
export function click(e) {
  const t = e.target;
  const s = t.closest("[data-asub]"); if (s) { P.sub = s.dataset.asub; P.cardio = null; P.sueno = false; C.render(); return true; }
  const rg = t.closest("[data-arango]"); if (rg) { const [k, v] = rg.dataset.arango.split(":"); P.rango[k] = v; C.render(); return true; }
  const b = t.closest("[data-a]"); if (!b) return false;
  switch (b.dataset.a) {
    case "dia": P.fecha = sumarDias(P.fecha, +b.dataset.n); if (P.fecha > hoyISO()) P.fecha = hoyISO(); P.cardio = null; P.sueno = false; P.medidasAbiertas = false; break;
    case "hoy": P.fecha = hoyISO(); P.cardio = null; P.sueno = false; break;
    case "medidas-abrir": P.medidasAbiertas = true; break;
    case "medida-graf": P.medidaGraf = b.dataset.v; break;
    case "pasos-hc": guardarDia(P.fecha, { pasos: null, pasosFuente: null }); C.toast("Se rellenarán en la próxima sincronización."); break;
    case "sueno-editar": P.sueno = true; break;
    case "sueno-cancelar": P.sueno = false; break;
    case "sueno-borrar": guardarDia(P.fecha, { sueno: null }); P.sueno = false; C.toast("Sueño quitado."); break;
    case "sueno-hc": guardarDia(P.fecha, { sueno: null }); C.toast("Se rellenará en la próxima sincronización."); break;
    case "cardio-nuevo": P.cardio = { tipo: b.dataset.v, idx: null }; break;
    case "cardio-editar": { const c = (diaDe(P.fecha) || {}).cardio[+b.dataset.i]; P.cardio = { tipo: c.tipo, idx: +b.dataset.i }; break; }
    case "cardio-cancelar": P.cardio = null; break;
    case "cardio-borrar": { const l = ((diaDe(P.fecha) || {}).cardio || []).slice(); l.splice(P.cardio.idx, 1); guardarDia(P.fecha, { cardio: l }); P.cardio = null; C.toast("Cardio quitado."); break; }
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
  if (t.id === "a-fecha") { P.fecha = t.value && t.value <= hoyISO() ? t.value : hoyISO(); P.cardio = null; P.sueno = false; C.render(); return true; }
  if (t.id === "a-pasos") {
    const v = Math.round(num(t.value) || 0);
    if (v > 150000) { C.toast("Esos pasos no parecen correctos."); return true; }
    guardarDia(P.fecha, v > 0 ? { pasos: v, pasosFuente: "manual" } : { pasos: null, pasosFuente: null }); C.render(); return true;
  }
  if (t.dataset && t.dataset.med) {
    const c = t.dataset.med, x = A.medidaDe(c), v = num(t.value);
    if (!x) return true;
    if (v != null && v > 0 && (v < x.rango[0] || v > x.rango[1])) { C.toast(`${x.n}: entre ${x.rango[0]} y ${x.rango[1]} cm.`); return true; }
    const med = { ...((diaDe(P.fecha) || {}).medidas || {}) };
    if (v > 0) med[c] = Math.round(v * 10) / 10; else delete med[c];
    guardarDia(P.fecha, { medidas: Object.keys(med).length ? med : null }); C.render(); return true;
  }
  if (t.id === "a-grasa" || t.id === "a-musculo") {
    const k = t.id === "a-grasa" ? "grasaPct" : "musculoKg", v = num(t.value), [lo, hi] = A.LIMITES_COMPOSICION[k];
    if (v != null && v > 0 && (v < lo || v > hi)) { C.toast(k === "grasaPct" ? `El % de grasa debe estar entre ${lo} y ${hi}.` : `La masa muscular debe estar entre ${lo} y ${hi} kg.`); return true; }
    const d = diaDe(P.fecha);
    if (k === "musculoKg" && v && d && d.peso && v >= d.peso) { C.toast("La masa muscular no puede ser mayor que el peso."); return true; }
    guardarDia(P.fecha, { [k]: v ? Math.round(v * 10) / 10 : null }); C.render(); return true;
  }
  if (t.id === "a-peso") {
    const v = num(t.value);
    if (v != null && v > 0 && (v < 30 || v > 250)) { C.toast("Ese peso no parece correcto."); return true; }
    guardarDia(P.fecha, { peso: v ? Math.round(v * 10) / 10 : null }); C.render(); return true;
  }
  return false;
}
export function submit(form) {
  if (form.id === "a-cardio") {
    const fd = new FormData(form), tipo = P.cardio.tipo, idx = P.cardio.idx;
    const c = { id: idx != null ? ((diaDe(P.fecha) || {}).cardio[idx] || {}).id || nId() : nId(), tipo, min: num(fd.get("min")) };
    if (A.esCinta(c)) Object.assign(c, { velocidad: num(fd.get("velocidad")), inclinacion: num(fd.get("inclinacion")) ?? 0, km: num(fd.get("km")), pasosReloj: num(fd.get("pasosReloj")), llevaba: !!fd.get("llevaba") });
    else Object.assign(c, { vatios: num(fd.get("vatios")), intensidad: fd.get("intensidad") || "moderada" });
    if (tipo === "carrera") {
      if (!c.min && !(c.km && c.velocidad)) { C.toast("Pon los minutos y la distancia."); return true; }
      if (!c.km && !c.velocidad) { C.toast("Pon la distancia (o la velocidad media)."); return true; }
      const vel = A.velocidadCinta(c);
      if (vel < 4 || vel > 25) { C.toast(`Sale una velocidad media de ${f1(vel)} km/h: revisa el tiempo y la distancia.`); return true; }
      if (c.inclinacion > 20) { C.toast("Revisa la inclinación (máximo 20 %)."); return true; }
    } else {
      if (!A.cardioMin(c)) { C.toast(tipo === "cinta" ? "Pon los minutos, o la distancia y la velocidad." : "Pon los minutos."); return true; }
      if (tipo === "cinta" && !c.velocidad) { C.toast("Pon la velocidad."); return true; }
    }
    const l = ((diaDe(P.fecha) || {}).cardio || []).slice(); if (idx != null) l[idx] = c; else l.push(c);
    guardarDia(P.fecha, { cardio: l });
    P.cardio = null; C.toast("Cardio guardado."); C.render(); return true;
  }
  if (form.id === "a-sueno") {
    const fd = new FormData(form), f = P.fecha;
    let min = A.leerHoras(fd.get("horas"));
    const ac = String(fd.get("acostarse") || ""), de = String(fd.get("despertar") || "");
    if (Number.isNaN(min)) { C.toast("No entiendo esas horas. Escribe, por ejemplo, 7:30 o 7,5."); return true; }
    const aMin = x => { const [h, m] = x.split(":").map(Number); return h * 60 + m; };
    const enCama = ac && de ? (aMin(de) - aMin(ac) + 1440) % 1440 : null;
    if (min == null) min = enCama;
    if (!min) { C.toast("Pon las horas dormidas (o la hora de acostarte y la de despertarte)."); return true; }
    if (min < 30 || min > 16 * 60) { C.toast("Esas horas no parecen correctas."); return true; }
    if (enCama != null && min > enCama + 5) { C.toast("Has dormido más horas de las que estuviste en la cama: revisa las horas."); return true; }
    const sueno = { min, fuente: "manual" };
    // La hora de acostarse es del día anterior salvo que sea de madrugada y antes de despertar
    if (de) sueno.fin = `${f}T${de}:00`;
    if (ac) sueno.inicio = `${ac >= "12:00" || (de && ac > de) ? sumarDias(f, -1) : f}T${ac}:00`;
    guardarDia(f, { sueno }); P.sueno = false; C.toast("Sueño guardado."); C.render(); return true;
  }
  if (form.id === "aj-actividad") {
    const fd = new FormData(form), a = C.S.ajustes;
    a.actividad.pasosObjetivo = Math.max(1000, Math.round(num(fd.get("pasosObjetivo")) || 8000));
    a.gasto.digestionPct = Math.min(20, Math.max(0, num(fd.get("digestionPct")) ?? 10));
    a.gasto.ajusteObjetivo = Math.round(num(fd.get("ajusteObjetivo")) || 0);
    a.gasto.usarCalibracion = !!fd.get("usarCalibracion");
    a.sueno = { ...(a.sueno || {}), objetivoH: Math.min(12, Math.max(4, Math.round((num(fd.get("suenoObjetivo")) || A.SUENO_OBJETIVO_H) * 4) / 4)) };
    C.DB.guardarAjustes(C.S.user.uid, a).catch(fallo); C.toast("Guardado."); C.render(); return true;
  }
  return false;
}
