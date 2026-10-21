/* V.I.T.A. — cálculos de actividad, peso y gasto (sin pantalla, se prueban con node).
   Es una ESTIMACIÓN: el error típico de estos métodos ronda el 10-20 %. Por
   eso, cuando hay datos suficientes, se calibra con la evolución real del peso.

   Gasto del día = basal + pasos + entreno + cardio + digestión.
   - Basal: Mifflin-St Jeor.
   - Actividad (ACSM, versión NETA, sin el reposo que ya va en el basal):
     kcal/min = (MET − 1) · 3,5 · peso / 200.
   - Pasos: zancada = altura · 0,415; ritmo 4,5 km/h; 3,5 MET.
   - Entreno: cada serie efectiva (las unilaterales cuentan doble) son
     segundosSerie a 6 MET + descansoMin a 1,5 MET.
   - Cardio: andar en cinta VO2 = 0,1·v + 1,8·v·pendiente (si pasa de 8 km/h,
     la de correr); correr en cinta VO2 = 0,2·v + 0,9·v·pendiente siempre
     (v en m/min; ACSM la valida por encima de unos 8 km/h); bici
     VO2 = 1,8·W·6,12/peso + 3,5; kcal = VO2 · peso · min / 1000 · 5.
     Bici sin vatios: 5,5 / 6,8 / 8,8 MET (suave / moderada / intensa).
   - Digestión (efecto térmico de los alimentos): ≈ 10 % de lo comido.
   - Calibración: gasto real medio = ingesta media − cambio de peso · 7.700 kcal/kg. */

import { edadEn, toISO } from "./model.js";

export const MET = { caminar: 3.5, serie: 6, descanso: 1.5, bici: { suave: 5.5, moderada: 6.8, intensa: 8.8 } };
export const ZANCADA = 0.415, KMH_PASEO = 4.5, KCAL_POR_KG = 7700;
/* Cadencia típica aproximada de un corredor aficionado (pasos/min). Solo se usa
   para estimar los pasos de una carrera con reloj si no apuntas los del reloj. */
export const CADENCIA_CARRERA = 160;
export const esCinta = c => c.tipo === "cinta" || c.tipo === "carrera";
/* Velocidad media: la apuntada o, si no, distancia / tiempo */
export function velocidadCinta(c) {
  const v = n0(c.velocidad); if (v) return v;
  const km = n0(c.km), m = n0(c.min);
  return km && m ? km / (m / 60) : 0;
}
export const CALIBRACION = { ventana: 28, diasMin: 21, pesajesMin: 6, diarioMin: 14, limite: 0.25, minimoComida: 0.5 };

const n0 = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
const sumarDias = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };
const entre = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

/* ---------- peso ---------- */
export const pesajes = dias => dias.filter(d => n0(d.peso)).map(d => ({ fecha: d.fecha, peso: n0(d.peso) })).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
/* Peso para los cálculos de una fecha: media de los últimos 7 pesajes de los
   30 días anteriores (incluida la fecha). Con menos de 4, el de referencia. */
export function pesoEn(dias, perfil, fecha) {
  const min = perfil.pesajesMinimos || 4, cuantos = perfil.pesajesMedia || 7;
  const desde = sumarDias(fecha, -30);
  const l = pesajes(dias).filter(p => p.fecha <= fecha && p.fecha > desde).slice(-cuantos);
  if (l.length < min) return { valor: n0(perfil.pesoReferencia) || null, fuente: `referencia · ${l.length} de ${min} pesajes`, n: l.length, media: false };
  return { valor: l.reduce((s, p) => s + p.peso, 0) / l.length, fuente: `media de ${l.length} pesajes`, n: l.length, media: true };
}
/* Media de los últimos n pesajes hasta cada pesaje (para la línea de tendencia) */
export function mediaMovil(lista, n = 7) {
  return lista.map((p, i) => { const v = lista.slice(Math.max(0, i - n + 1), i + 1); return { fecha: p.fecha, peso: p.peso, media: v.reduce((s, x) => s + x.peso, 0) / v.length }; });
}
/* Pendiente de los pesajes (kg por día) por mínimos cuadrados */
export function pendiente(lista) {
  if (lista.length < 2) return null;
  const x0 = lista[0].fecha, xs = lista.map(p => entre(x0, p.fecha)), ys = lista.map(p => p.peso);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (!sxx) return null;
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
}

/* ---------- piezas del gasto ---------- */
export function basal(perfil, peso, fecha) {
  const edad = edadEn(perfil.nacimiento, fecha);
  if (!(peso > 0) || !n0(perfil.altura) || edad == null || !perfil.sexo) return null;
  const b = 10 * peso + 6.25 * n0(perfil.altura) - 5 * edad;
  return perfil.sexo === "mujer" ? b - 161 : b + 5;
}
export const netKcal = (met, peso, min) => (peso > 0 && min > 0) ? Math.max(0, (met - 1) * 3.5 * peso / 200 * min) : 0;
export const minutosPasos = (pasos, altura) => (pasos > 0 && altura > 0) ? pasos * (altura * ZANCADA / 100) / 1000 / KMH_PASEO * 60 : 0;
export const kmPasos = (pasos, altura) => pasos * (altura * ZANCADA / 100) / 1000;
export function cardioMin(c) {
  const m = n0(c.min); if (m) return m;
  if (esCinta(c) && n0(c.km) && n0(c.velocidad)) return n0(c.km) / n0(c.velocidad) * 60;
  return 0;
}
export function cardioKcal(c, peso) {
  const min = cardioMin(c); if (!(peso > 0) || !min) return 0;
  if (esCinta(c)) {
    const v = velocidadCinta(c); if (!v) return 0;
    const S = v * 1000 / 60, G = n0(c.inclinacion) / 100;
    // ACSM (neta): andando 0,1·v + 1,8·v·pendiente; corriendo 0,2·v + 0,9·v·pendiente
    const corriendo = c.tipo === "carrera" || v > 8;
    const vo2 = corriendo ? 0.2 * S + 0.9 * S * G : 0.1 * S + 1.8 * S * G;
    return vo2 * peso * min / 1000 * 5;
  }
  const w = n0(c.vatios);
  if (w) return (1.8 * w * 6.12 / peso + 3.5) * peso * min / 1000 * 5;
  return netKcal(MET.bici[c.intensidad] || MET.bici.moderada, peso, min);
}
/* Pasos de la cinta que ya están en el recuento del día (si llevabas el reloj) */
export function cardioPasos(c, altura) {
  if (!esCinta(c) || c.llevaba === false) return 0;
  const p = n0(c.pasosReloj); if (p) return Math.round(p);
  if (c.tipo === "carrera") return Math.round(cardioMin(c) * CADENCIA_CARRERA);
  let km = n0(c.km); if (!km && n0(c.velocidad)) km = n0(c.velocidad) * cardioMin(c) / 60;
  return km && altura > 0 ? Math.round(km * 1000 / (altura * ZANCADA / 100)) : 0;
}
export function seriesEfectivas(sesion) {
  if (!sesion) return 0;
  return sesion.ejercicios.reduce((a, e) => a + e.series.filter(s => s.peso != null && s.reps != null).length * (e.unilateral ? 2 : 1), 0);
}
export function entreno(sesion, peso, aj) {
  const series = seriesEfectivas(sesion);
  const trabajo = series * (aj.segundosSerie || 60) / 60, descanso = series * (aj.descansoMin ?? 2);
  return { series, min: trabajo + descanso, kcal: netKcal(MET.serie, peso, trabajo) + netKcal(MET.descanso, peso, descanso) };
}

/* ---------- gasto de un día ----------
   ctx: { dias, sesiones, ajustes, ingesta: fecha -> kcal comidas (o undefined si no hay diario) } */
export function gastoDia(fecha, ctx) {
  const a = ctx.ajustes, perfil = a.perfil;
  const dia = ctx.dias.find(d => d.fecha === fecha) || { fecha };
  const sesion = ctx.sesiones.find(s => s.fecha === fecha) || null;
  const p = pesoEn(ctx.dias, perfil, fecha), peso = p.valor;
  const b = basal(perfil, peso, fecha);
  const faltan = [];
  if (!(peso > 0)) faltan.push("peso");
  if (!n0(perfil.altura)) faltan.push("altura");
  if (!perfil.nacimiento) faltan.push("fecha de nacimiento");
  if (!perfil.sexo) faltan.push("sexo");
  const altura = n0(perfil.altura);
  const cardio = dia.cardio || [];
  const pasos = n0(dia.pasos);
  const descontados = Math.min(pasos, cardio.reduce((s, c) => s + cardioPasos(c, altura), 0));
  const kPasos = netKcal(MET.caminar, peso, minutosPasos(pasos - descontados, altura));
  const en = entreno(sesion, peso, a.entreno);
  const kCardio = cardio.reduce((s, c) => s + cardioKcal(c, peso), 0);
  const ingesta = ctx.ingesta[fecha];
  const kDigestion = ingesta != null ? ingesta * (a.gasto.digestionPct ?? 10) / 100 : 0;
  const total = b == null ? null : b + kPasos + en.kcal + kCardio + kDigestion;
  return { fecha, peso, pesoFuente: p.fuente, basal: b, pasos, descontados, kPasos, entreno: en, kEntreno: en.kcal, cardio, kCardio,
    ingesta: ingesta ?? null, kDigestion, total, faltan, conPasos: pasos > 0 };
}

/* ---------- calibración con el peso real ----------
   Compara lo que dice el peso con lo que dice la fórmula en las últimas 4
   semanas. Necesita al menos 21 días entre el primer y el último pesaje, 6
   pesajes y 14 días con comida apuntada. */
export function calibracion(hasta, ctx) {
  const C = CALIBRACION, desde = sumarDias(hasta, -(C.ventana - 1));
  const pes = pesajes(ctx.dias).filter(p => p.fecha >= desde && p.fecha <= hasta);
  // Solo días con la comida completa: un día con menos de la mitad del objetivo
  // casi seguro que tiene comidas sin apuntar y falsearía la calibración.
  const minimo = (ctx.ajustes.objetivo.kcal || 0) * C.minimoComida;
  const diasComida = Object.keys(ctx.ingesta).filter(f => f >= desde && f <= hasta && ctx.ingesta[f] >= minimo).sort();
  const span = pes.length >= 2 ? entre(pes[0].fecha, pes[pes.length - 1].fecha) : 0;
  const estado = { desde, hasta, pesajes: pes.length, span, diasComida: diasComida.length, listo: false, falta: [] };
  if (pes.length < C.pesajesMin) estado.falta.push(`${C.pesajesMin - pes.length} pesaje(s) más`);
  if (span < C.diasMin) estado.falta.push(`${C.diasMin - span} día(s) más entre el primer y el último pesaje`);
  if (diasComida.length < C.diarioMin) estado.falta.push(`${C.diarioMin - diasComida.length} día(s) más con la comida completa apuntada`);
  if (estado.falta.length) return estado;
  const est = diasComida.map(f => gastoDia(f, ctx)).filter(g => g.total != null);
  if (est.length < C.diarioMin) { estado.falta.push("datos de perfil completos"); return estado; }
  const ingesta = diasComida.reduce((s, f) => s + ctx.ingesta[f], 0) / diasComida.length;
  const estimado = est.reduce((s, g) => s + g.total, 0) / est.length;
  const kgDia = pendiente(pes);
  const real = ingesta - kgDia * KCAL_POR_KG;
  const bruto = real / estimado;
  const factor = Math.min(1 + C.limite, Math.max(1 - C.limite, bruto));
  return { ...estado, listo: true, ingesta, estimado, kgSemana: kgDia * 7, real, bruto, factor, limitado: factor !== bruto };
}

/* ---------- objetivo sugerido ----------
   Media del gasto (calibrado si se puede) de los últimos 7 días completos,
   más el ajuste que elijas (negativo para definir, positivo para volumen). */
export function objetivoSugerido(hoy, ctx) {
  const ayer = sumarDias(hoy, -1);
  const cal = calibracion(ayer, ctx);
  const usar = ctx.ajustes.gasto.usarCalibracion !== false && cal.listo;
  const factor = usar ? cal.factor : 1;
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(ayer, -i)).map(f => gastoDia(f, ctx)).filter(g => g.total != null && (g.conPasos || g.entreno.series || g.cardio.length));
  if (dias.length < 4) return { listo: false, dias: dias.length, cal };
  // Los días sin comida apuntada no llevan digestión: se completa con el objetivo actual para no infravalorar
  const objetivo = ctx.ajustes.objetivo.kcal, pct = (ctx.ajustes.gasto.digestionPct ?? 10) / 100;
  const media = dias.reduce((s, g) => s + (g.ingesta == null ? g.total + objetivo * pct : g.total), 0) / dias.length * factor;
  const ajuste = ctx.ajustes.gasto.ajusteObjetivo || 0;
  return { listo: true, dias: dias.length, media, factor, calibrado: usar, ajuste, sugerido: Math.round((media + ajuste) / 10) * 10, cal };
}

/* ---------- sueño ----------
   dias[].sueno = { min, inicio?, fin?, fases?: {profundo, ligero, rem, despierto}, sesiones?, fuente }
   Una noche pertenece al día en que te despiertas. Referencia: la AASM y la
   Sleep Research Society recomiendan 7 horas o más a los adultos. */
export const SUENO_OBJETIVO_H = 7;
/* "7:30", "7h30", "7,5" o "7.5" → minutos */
export function leerHoras(txt) {
  const s = String(txt ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = /^(\d{1,2})[:h](\d{1,2})m?$/.exec(s);
  if (m) { const h = +m[1], mi = +m[2]; return mi < 60 && h <= 24 ? h * 60 + mi : NaN; }
  m = /^(\d{1,2})(?:[.,](\d+))?h?$/.exec(s);
  if (m) { const v = parseFloat(m[1] + "." + (m[2] || "0")); return v <= 24 ? Math.round(v * 60) : NaN; }
  return NaN;
}
export const horasTxt = min => min == null ? "—" : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;
export const suenoDe = d => d && d.sueno && d.sueno.min > 0 ? d.sueno : null;
/* Minutos desde medianoche de una hora ISO; las horas de acostarse pasada la medianoche cuentan como +24 h */
function minutosReloj(iso, acostarse) {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso); if (!m) return null;
  let v = +m[1] * 60 + +m[2];
  if (acostarse && v < 12 * 60) v += 24 * 60;
  return v;
}
const desviacion = l => { if (l.length < 2) return null; const m = l.reduce((a, b) => a + b, 0) / l.length; return Math.sqrt(l.reduce((s, x) => s + (x - m) ** 2, 0) / l.length); };
/* Resumen de un conjunto de noches: media, días con objetivo, fases medias y regularidad */
export function resumenSueno(dias, fechas, objetivoH = SUENO_OBJETIVO_H) {
  const noches = fechas.map(f => ({ fecha: f, s: suenoDe(dias.find(d => d.fecha === f)) })).filter(x => x.s);
  if (!noches.length) return { noches: 0 };
  const mins = noches.map(x => x.s.min);
  const conFases = noches.filter(x => x.s.fases);
  const fase = k => conFases.length ? conFases.reduce((s, x) => s + (x.s.fases[k] || 0), 0) / conFases.length : null;
  const acost = noches.map(x => minutosReloj(x.s.inicio, true)).filter(v => v != null);
  const desp = noches.map(x => minutosReloj(x.s.fin, false)).filter(v => v != null);
  const med = l => l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
  return {
    noches: noches.length, mediaMin: med(mins), minMin: Math.min(...mins), maxMin: Math.max(...mins),
    conObjetivo: mins.filter(m => m >= objetivoH * 60).length,
    fases: conFases.length ? { noches: conFases.length, profundo: fase("profundo"), ligero: fase("ligero"), rem: fase("rem"), despierto: fase("despierto") } : null,
    acostarseMedia: med(acost), despertarMedia: med(desp),
    regularidad: acost.length >= 3 ? { acostarse: desviacion(acost), despertar: desviacion(desp) } : null
  };
}
export const horaReloj = min => { if (min == null) return "—"; const v = Math.round(min) % (24 * 60); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
