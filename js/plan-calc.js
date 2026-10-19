/* V.I.T.A. — planificador de semanas (sin pantalla: se prueba con node).
   Un plan es una semana tipo de lunes a domingo, sin fechas:
   planes/{id} = { id, nombre, dias: [7 × { nombre, ejercicios: [{ ejercicioId, series }] }], creado, actualizado }
   Los ejercicios se guardan por id: nombre, grupos y unilateral se leen del
   catálogo en cada momento. Cada serie cuenta entera en cada grupo del
   ejercicio (igual que en la pestaña Volumen). */

import { toISO } from "./model.js";

export const DIAS_PLAN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const SERIES_POR_DEFECTO = 3;
export const SERIES_MAX = 15;

const completa = s => s.peso != null && s.reps != null;
const sumarDias = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };

export function planVacio(id, nombre, ahora = new Date().toISOString()) {
  return { id, nombre, dias: DIAS_PLAN.map(() => ({ nombre: "", ejercicios: [] })), creado: ahora, actualizado: ahora };
}
/* Un plan leído de la nube siempre con 7 días bien formados */
export function normalizar(p) {
  const dias = DIAS_PLAN.map((_, i) => {
    const d = (p.dias || [])[i] || {};
    return { nombre: d.nombre || "", ejercicios: (d.ejercicios || []).filter(x => x && x.ejercicioId).map(x => ({ ejercicioId: x.ejercicioId, series: Math.min(SERIES_MAX, Math.max(1, Math.round(x.series) || 1)) })) };
  });
  return { ...p, nombre: p.nombre || "Plan sin nombre", dias };
}
export const porId = ejercicios => Object.fromEntries(ejercicios.map(e => [e.id, e]));

/* Series por grupo de un día del plan. Los ejercicios borrados del catálogo no cuentan. */
export function seriesDia(dia, mapa) {
  const row = {};
  (dia.ejercicios || []).forEach(x => {
    const e = mapa[x.ejercicioId]; if (!e) return;
    Object.entries(e.grupos || {}).forEach(([g, w]) => { row[g] = (row[g] || 0) + x.series * (w || 1); });
  });
  return row;
}
export function seriesPlan(plan, mapa) {
  const row = {};
  plan.dias.forEach(d => Object.entries(seriesDia(d, mapa)).forEach(([g, v]) => { row[g] = (row[g] || 0) + v; }));
  return row;
}
export const seriesTotales = (dia) => (dia.ejercicios || []).reduce((a, x) => a + x.series, 0);

/* Copia un día sobre otro (sustituye el destino, nombre incluido) */
export function copiarDia(plan, de, a) {
  const o = plan.dias[de];
  plan.dias[a] = { nombre: o.nombre, ejercicios: o.ejercicios.map(x => ({ ...x })) };
  return plan;
}
export function duplicarPlan(plan, id, nombre, ahora = new Date().toISOString()) {
  return { ...JSON.parse(JSON.stringify(plan)), id, nombre, creado: ahora, actualizado: ahora };
}
/* Quita un ejercicio de todos los planes. Devuelve los planes que cambian. */
export function quitarDePlanes(planes, ejId) {
  const cambiados = [];
  planes.forEach(p => {
    let cambia = false;
    p.dias.forEach(d => { const n = d.ejercicios.length; d.ejercicios = d.ejercicios.filter(x => x.ejercicioId !== ejId); if (d.ejercicios.length !== n) cambia = true; });
    if (cambia) cambiados.push(p);
  });
  return cambiados;
}
export const planesCon = (planes, ejId) => planes.filter(p => p.dias.some(d => d.ejercicios.some(x => x.ejercicioId === ejId)));

/* Semanas (lunes) con alguna sesión, de la más reciente a la más antigua */
export function semanasConSesiones(sesiones) {
  const lunes = new Set();
  sesiones.forEach(s => { if (!s.ejercicios.length) return; const d = new Date(s.fecha + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); lunes.add(toISO(d)); });
  return [...lunes].sort().reverse();
}
/* Plan a partir de lo que hiciste una semana: cada ejercicio con sus series hechas
   (los que no tienen ninguna hecha no se incluyen). Se saltan los que ya no están en el catálogo. */
export function planDesdeSemana(lunes, sesiones, mapa, id, nombre, ahora) {
  const plan = planVacio(id, nombre, ahora);
  let omitidos = 0;
  for (let i = 0; i < 7; i++) {
    const s = sesiones.find(x => x.fecha === sumarDias(lunes, i)); if (!s) continue;
    s.ejercicios.forEach(e => {
      if (!mapa[e.ejercicioId]) { omitidos++; return; }
      const n = e.series.filter(completa).length; if (!n) return;
      plan.dias[i].ejercicios.push({ ejercicioId: e.ejercicioId, series: Math.min(SERIES_MAX, n) });
    });
  }
  return { plan, omitidos };
}

/* Uso de un ejercicio en el historial: nº de sesiones y la última fecha */
export function usoEjercicio(sesiones, ejId) {
  let n = 0, ultima = null;
  sesiones.forEach(s => { if (s.ejercicios.some(e => e.ejercicioId === ejId)) { n++; if (!ultima || s.fecha > ultima) ultima = s.fecha; } });
  return { sesiones: n, ultima };
}
/* Cambia nombre, grupos y unilateral de un ejercicio en las sesiones ya
   registradas. Devuelve las sesiones que cambian. */
export function aplicarAlHistorial(sesiones, ejId, { nombre, grupos, unilateral }) {
  const cambiadas = [];
  sesiones.forEach(s => {
    let cambia = false;
    s.ejercicios.forEach(e => { if (e.ejercicioId === ejId) { Object.assign(e, { nombre, grupos: { ...grupos }, unilateral: !!unilateral }); cambia = true; } });
    if (cambia) cambiadas.push(s);
  });
  return cambiadas;
}

/* ---------- aplicar un día del plan a una fecha ---------- */
/* Series hechas la última vez que hiciste un ejercicio (antes de una fecha) */
export function ultimaVez(sesiones, ejId, antesDe) {
  let mejor = null;
  sesiones.forEach(s => {
    if (antesDe && s.fecha >= antesDe) return;
    if (mejor && s.fecha <= mejor.fecha) return;
    const hechas = s.ejercicios.filter(e => e.ejercicioId === ejId).flatMap(e => e.series.filter(completa));
    if (hechas.length) mejor = { fecha: s.fecha, series: hechas.map(x => ({ peso: x.peso, reps: x.reps })) };
  });
  return mejor;
}
/* Ejercicios de sesión a partir de un día del plan. Cada serie lleva en gris
   (sugPeso/sugReps) la misma serie de la última vez; las que pasen de las que
   hiciste entonces van vacías. Los ejercicios borrados del catálogo se omiten. */
export function ejerciciosDesdePlan(dia, mapa, sesiones, fecha) {
  let omitidos = 0;
  const ejercicios = [];
  (dia.ejercicios || []).forEach(x => {
    const e = mapa[x.ejercicioId]; if (!e) { omitidos++; return; }
    const ref = ultimaVez(sesiones, e.id, fecha);
    ejercicios.push({ ejercicioId: e.id, nombre: e.nombre, grupos: { ...(e.grupos || {}) }, unilateral: !!e.unilateral,
      series: Array.from({ length: x.series }, (_, j) => {
        const r = ref && ref.series[j];
        return { peso: null, reps: null, ...(r ? { sugPeso: r.peso, sugReps: r.reps } : {}) };
      }) });
  });
  return { ejercicios, omitidos };
}
/* Índice del día del plan (0 = lunes) para una fecha */
export const diaDeFecha = iso => (new Date(iso + "T00:00:00").getDay() + 6) % 7;
