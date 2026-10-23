/* V.I.T.A. — resumen de una semana (lunes a domingo) y exportación para el
   entrenador IA. Sin pantalla: se prueba con node. */

import { GRUPOS, COMIDAS, edadEn, toISO } from "./model.js";
import * as K from "./comida-calc.js";
import * as A from "./actividad-calc.js";

export const PRIORITARIOS = new Set(["Pecho", "Dorsal", "Espalda media", "Hombro lateral", "Hombro posterior", "Bíceps", "Tríceps"]);
export const OPCIONALES = new Set(["Core", "Antebrazo", "Hombro anterior"]);   // solo cuentan si se entrenan
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const sumarDias = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };
export const lunesDe = iso => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); };
const r1 = v => v == null ? null : Math.round(v * 10) / 10;
const r0 = v => v == null ? null : Math.round(v);
const completa = s => s.peso != null && s.reps != null;

/* ---------- volumen ---------- */
/* Nota de un grupo: 100 en rango; por debajo, proporcional; por encima, se resta el exceso (mínimo 50) */
export function notaGrupo(sets, lm) {
  if (!lm) return null;
  if (!sets) return 0;
  if (sets < lm.min) return Math.round(sets / lm.min * 100);
  if (sets <= lm.max) return 100;
  return Math.max(50, Math.round(100 - (sets - lm.max) / lm.max * 100));
}
/* Nota de la semana: media de los grupos con rango; prioritarios ×1,5; opcionales solo si se entrenan */
export function notaVolumen(row, rangos) {
  let pts = 0, pesos = 0;
  GRUPOS.forEach(g => {
    const lm = (rangos || {})[g]; if (!lm) return;
    const sets = row[g] || 0;
    if (OPCIONALES.has(g) && !sets) return;
    const p = PRIORITARIOS.has(g) ? 1.5 : 1;
    pts += notaGrupo(sets, lm) * p; pesos += p;
  });
  return pesos ? Math.round(pts / pesos) : null;
}
export function seriesPorGrupo(sesiones) {
  const row = {};
  sesiones.forEach(s => s.ejercicios.forEach(e => {
    const n = e.series.filter(completa).length; if (!n) return;
    Object.entries(e.grupos || {}).forEach(([g, w]) => { row[g] = (row[g] || 0) + n * w; });
  }));
  return row;
}
export const volumenKg = s => s.ejercicios.reduce((a, e) => a + e.series.reduce((t, x) => t + (completa(x) ? x.peso * x.reps : 0), 0), 0);

/* ---------- contexto ---------- */
export function contexto(datos) {
  const mapa = K.porId(datos.alimentos), ingesta = {};
  datos.diario.forEach(d => { const t = K.totalComidas(d.comidas, mapa); if (t.kcal > 0) ingesta[d.fecha] = t.kcal; });
  return { ...datos, mapa, ingesta, gctx: { dias: datos.dias, sesiones: datos.sesiones, ajustes: datos.ajustes, ingesta } };
}

/* ---------- resumen de la semana ---------- */
export function resumenSemana(lunes, datos, hoy) {
  const X = datos.mapa ? datos : contexto(datos);
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).filter(f => !hoy || f <= hoy);
  const enSemana = f => fechas.includes(f);
  // Hoy aún no ha terminado: cuenta para entreno y peso, pero no para las medias de comida y actividad
  const completas = fechas.filter(f => !hoy || f < hoy);
  const completo = f => completas.includes(f);
  const aj = X.ajustes;
  // entreno
  const ses = X.sesiones.filter(s => enSemana(s.fecha) && s.ejercicios.some(e => e.series.some(completa)));
  const row = seriesPorGrupo(ses);
  const rangos = aj.entreno.rangos || {};
  const fuera = GRUPOS.filter(g => rangos[g] && !(OPCIONALES.has(g) && !row[g])).map(g => ({ g, sets: row[g] || 0, ...rangos[g] }))
    .filter(x => x.sets < x.min || x.sets > x.max);
  const entreno = { sesiones: ses.length, series: ses.reduce((a, s) => a + s.ejercicios.reduce((b, e) => b + e.series.filter(completa).length, 0), 0),
    volumenKg: ses.reduce((a, s) => a + volumenKg(s), 0), porGrupo: row, nota: notaVolumen(row, rangos), fueraDeRango: fuera };
  // comida
  const diasComida = X.diario.filter(d => completo(d.fecha) && X.ingesta[d.fecha]);
  const tots = diasComida.map(d => K.totalComidas(d.comidas, X.mapa));
  const media = k => tots.length ? tots.reduce((s, t) => s + t[k], 0) / tots.length : null;
  const pesoCalc = A.pesoEn(X.dias, aj.perfil, fechas[fechas.length - 1] || lunes).valor;
  const obj = K.objetivoGramos(aj.objetivo, pesoCalc);
  const coste = diasComida.reduce((s, d) => s + K.costeComidas(d.comidas, X.mapa).coste, 0);
  const comida = { dias: diasComida.length, kcal: media("kcal"), prot: media("prot"), hid: media("hid"), gra: media("gra"), fib: media("fib"),
    protGkg: pesoCalc && media("prot") != null ? media("prot") / pesoCalc : null,
    dentro10: tots.filter(t => Math.abs(t.kcal / obj.kcal * 100 - 100) <= 10).length, objetivo: obj, costeMedio: diasComida.length ? coste / diasComida.length : null };
  // actividad y gasto
  const dias = completas.map(f => X.dias.find(d => d.fecha === f)).filter(Boolean);
  const pasos = dias.filter(d => d.pasos > 0).map(d => d.pasos);
  const cardio = dias.flatMap(d => (d.cardio || []).map(c => ({ ...c, fecha: d.fecha })));
  const cal = A.calibracion(sumarDias(hoy || sumarDias(lunes, 7), -1), X.gctx);
  const fac = aj.gasto.usarCalibracion !== false && cal.listo ? cal.factor : 1;
  const gastos = completas.map(f => A.gastoDia(f, X.gctx)).filter(g => g.total != null && (g.conPasos || g.entreno.series || g.cardio.length || g.ingesta != null));
  const conAmbos = gastos.filter(g => g.ingesta != null);
  const actividad = { pasosMedia: pasos.length ? pasos.reduce((a, b) => a + b, 0) / pasos.length : null, diasPasos: pasos.length,
    diasObjetivo: pasos.filter(p => p >= (aj.actividad.pasosObjetivo || 8000)).length,
    cardio: { sesiones: cardio.length, min: cardio.reduce((s, c) => s + A.cardioMin(c), 0) },
    gastoMedio: gastos.length ? gastos.reduce((s, g) => s + g.total * fac, 0) / gastos.length : null,
    balanceMedio: conAmbos.length ? conAmbos.reduce((s, g) => s + g.ingesta - g.total * fac, 0) / conAmbos.length : null,
    diasBalance: conAmbos.length, calibrado: fac !== 1, factor: fac };
  // peso
  const pes = A.pesajes(X.dias);
  const semana = pes.filter(p => enSemana(p.fecha));
  const antes = pes.filter(p => p.fecha >= sumarDias(lunes, -7) && p.fecha < lunes);
  const m = l => l.length ? l.reduce((s, p) => s + p.peso, 0) / l.length : null;
  const ult28 = pes.filter(p => p.fecha <= (fechas[fechas.length - 1] || lunes) && p.fecha >= sumarDias(fechas[fechas.length - 1] || lunes, -27));
  const pend = ult28.length >= 3 ? A.pendiente(ult28) : null;
  const peso = { pesajes: semana, media: m(semana), mediaAnterior: m(antes), cambio: m(semana) != null && m(antes) != null ? m(semana) - m(antes) : null,
    kgSemana: pend != null ? pend * 7 : null, calculo: pesoCalc };
  // sueño: la noche cuenta el día en que te despiertas (también hoy)
  const sueno = A.resumenSueno(X.dias, fechas, (aj.sueno || {}).objetivoH || A.SUENO_OBJETIVO_H);
  // composición corporal (báscula): medias de las medidas de la semana
  const cs = A.composiciones(X.dias).filter(x => enSemana(x.fecha));
  const mc = k => { const v = cs.map(x => x[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const composicion = { medidas: cs.length, grasaPct: mc("grasaPct"), grasaKg: mc("grasaKg"), magraKg: mc("magraKg"), musculoKg: mc("musculoKg") };
  return { lunes, domingo: sumarDias(lunes, 6), fechas, completas, entreno, comida, actividad, peso, sueno, composicion };
}

/* ---------- exportación para el entrenador IA ----------
   Compacta a propósito: lo justo para analizar la semana sin gastar de más. */
export function exportarSemana(lunes, datos, { version, hoy } = {}) {
  const X = datos.mapa ? datos : contexto(datos);
  const R = resumenSemana(lunes, X, hoy);
  const aj = X.ajustes, p = aj.perfil;
  const nombreDe = it => it.libre ? `${it.nombre || "comida fuera"} (fuera, estimado)` : (X.mapa[it.id] || {}).nombre || "alimento borrado";
  const cantidad = it => { if (it.libre) return `${r0(it.kcal)} kcal`; const a = X.mapa[it.id]; if (!a) return ""; const f = K.factorDe(a), u = K.unidad(a); return f ? `${r0(it.g)} ${u} crudo (≈${r0(it.g * f)} ${u} hecho)` : `${r0(it.g)} ${u}`; };
  const fac = R.actividad.factor;
  const dias = R.fechas.map(f => {
    const d = X.dias.find(x => x.fecha === f) || {};
    const s = X.sesiones.find(x => x.fecha === f);
    const di = X.diario.find(x => x.fecha === f);
    const g = A.gastoDia(f, X.gctx);
    const o = { fecha: f, dia: DIAS[new Date(f + "T00:00:00").getDay()] };
    if (hoy && f === hoy) o.en_curso = true;
    if (d.peso) o.peso_kg = d.peso;
    if (d.grasaPct) o.grasa_pct_bascula = d.grasaPct;
    if (d.musculoKg) o.musculo_kg_bascula = d.musculoKg;
    if (d.medidas && Object.keys(d.medidas).length) o.medidas_cm = { ...d.medidas };
    if (d.pasos) o.pasos = d.pasos;
    if (d.cardio && d.cardio.length) o.cardio = d.cardio.map(c => A.esCinta(c)
      ? `${c.tipo === "carrera" ? "correr en cinta" : "andar en cinta"} ${r1(A.cardioMin(c))} min a ${r1(A.velocidadCinta(c))} km/h y ${c.inclinacion || 0} %${c.km ? ` (${c.km} km)` : ""}`
      : `bici ${r1(A.cardioMin(c))} min${c.vatios ? ` a ${c.vatios} W` : ` intensidad ${c.intensidad || "moderada"}`}`);
    if (s && s.ejercicios.some(e => e.series.some(completa))) o.entreno = {
      volumen_kg: r0(volumenKg(s)),
      ejercicios: s.ejercicios.filter(e => e.series.some(completa)).map(e => `${e.nombre}${e.unilateral ? " (por lado)" : ""}: ${e.series.filter(completa).map(x => `${x.peso}×${x.reps}`).join(", ")}`)
    };
    if (di && X.ingesta[f]) {
      const t = K.totalComidas(di.comidas, X.mapa);
      o.comida = { kcal: r0(t.kcal), prot_g: r1(t.prot), hid_g: r1(t.hid), gra_g: r1(t.gra), fib_g: r1(t.fib) };
      COMIDAS.forEach(m => { const l = (di.comidas[m.k] || []); if (l.length) o.comida[m.k] = l.map(it => `${nombreDe(it)} ${cantidad(it)}`); });
    }
    const su = A.suenoDe(d);
    if (su) o.sueno = { horas: r1(su.min / 60), ...(su.inicio ? { acostarse: su.inicio.slice(11, 16), despertar: (su.fin || "").slice(11, 16) } : {}),
      ...(su.fases ? { fases_min: { profundo: r0(su.fases.profundo), ligero: r0(su.fases.ligero), rem: r0(su.fases.rem), despierto: r0(su.fases.despierto) } } : {}) };
    if (g.total != null) o.gasto_kcal = { basal: r0(g.basal), pasos: r0(g.kPasos), entreno: r0(g.kEntreno), cardio: r0(g.kCardio), digestion: r0(g.kDigestion), total: r0(g.total * fac) };
    return o;
  });
  return {
    app: "vita", tipo: "resumen_semanal", version_app: version || null, semana: { desde: R.lunes, hasta: R.domingo },
    lee_esto: [
      "Semana de entreno, comida y actividad de Iván para que un entrenador/nutricionista la analice.",
      "Pesos de entreno: con barra el TOTAL (barra + discos); con mancuernas el de UNA; los unilaterales son por lado. Series a RIR 1-2.",
      "Comida: los alimentos con factor de cocción van en crudo con su equivalente hecho entre paréntesis; 'fuera' son estimaciones a ojo.",
      "Sueño: cada noche va en el día en que te despiertas; horas dormidas sin contar los ratos despierto.",
      "Medidas corporales en cm con cinta métrica (D = lado derecho, I = izquierdo; brazo contraído; hombros = contorno de pecho + hombros).",
      "Grasa y masa muscular vienen de una báscula de bioimpedancia doméstica: son estimaciones con mucho error en un día suelto; valóralas solo como tendencia de varias semanas.",
      "Un día sin comida, pasos, sueño o peso significa 'sin apuntar', no cero. Un día con en_curso=true es hoy y aún no ha terminado: no cuenta en las medias.",
      `Gasto: estimación (basal Mifflin-St Jeor + actividad ACSM neta + digestión ${aj.gasto.digestionPct ?? 10} % de lo comido)${R.actividad.calibrado ? `, multiplicado por ${R.actividad.factor.toFixed(2)} según la evolución real del peso` : ", sin calibrar con el peso todavía (la fórmula suele quedarse corta)"}.`
    ],
    perfil: { sexo: p.sexo, edad: edadEn(p.nacimiento, R.domingo), altura_cm: p.altura, peso_calculo_kg: r1(R.peso.calculo) },
    objetivo: { kcal: aj.objetivo.kcal, prot_g: r0(R.comida.objetivo.prot), hid_g: r0(R.comida.objetivo.hid), gra_g: r0(R.comida.objetivo.gra), fib_g: r0(R.comida.objetivo.fib), pasos: aj.actividad.pasosObjetivo },
    rangos_series_semana: Object.fromEntries(GRUPOS.filter(g => (aj.entreno.rangos || {})[g]).map(g => [g, `${aj.entreno.rangos[g].min}-${aj.entreno.rangos[g].max}`])),
    resumen: {
      entreno: { sesiones: R.entreno.sesiones, series: R.entreno.series, volumen_kg: r0(R.entreno.volumenKg), nota_volumen: R.entreno.nota,
        series_por_grupo: Object.fromEntries(Object.entries(R.entreno.porGrupo).map(([g, v]) => [g, r1(v)])),
        fuera_de_rango: R.entreno.fueraDeRango.map(x => `${x.g}: ${r1(x.sets)} (rango ${x.min}-${x.max})`) },
      comida: { dias_registrados: R.comida.dias, kcal_media: r0(R.comida.kcal), prot_media_g: r1(R.comida.prot), prot_g_kg: r1(R.comida.protGkg ? Math.round(R.comida.protGkg * 100) / 100 : null),
        hid_media_g: r1(R.comida.hid), gra_media_g: r1(R.comida.gra), fib_media_g: r1(R.comida.fib), dias_dentro_10pct: R.comida.dentro10 },
      actividad: { pasos_media: r0(R.actividad.pasosMedia), dias_con_pasos: R.actividad.diasPasos, dias_objetivo_pasos: R.actividad.diasObjetivo,
        cardio_sesiones: R.actividad.cardio.sesiones, cardio_min: r0(R.actividad.cardio.min), gasto_medio_kcal: r0(R.actividad.gastoMedio), balance_medio_kcal: r0(R.actividad.balanceMedio) },
      sueno: R.sueno.noches ? { noches: R.sueno.noches, media_h: r1(R.sueno.mediaMin / 60), noches_con_objetivo: R.sueno.conObjetivo, objetivo_h: (aj.sueno || {}).objetivoH || A.SUENO_OBJETIVO_H,
        ...(R.sueno.fases ? { fases_media_min: { profundo: r0(R.sueno.fases.profundo), ligero: r0(R.sueno.fases.ligero), rem: r0(R.sueno.fases.rem), despierto: r0(R.sueno.fases.despierto) } } : {}),
        ...(R.sueno.regularidad ? { variacion_hora_acostarse_min: r0(R.sueno.regularidad.acostarse), variacion_hora_despertar_min: r0(R.sueno.regularidad.despertar) } : {}) } : { noches: 0 },
      composicion_bascula: R.composicion.medidas ? { medidas: R.composicion.medidas, grasa_pct_media: r1(R.composicion.grasaPct), masa_grasa_kg_media: r1(R.composicion.grasaKg), masa_magra_kg_media: r1(R.composicion.magraKg), musculo_kg_media: r1(R.composicion.musculoKg) } : { medidas: 0 },
      peso: { media_semana_kg: r1(R.peso.media), media_semana_anterior_kg: r1(R.peso.mediaAnterior), cambio_kg: R.peso.cambio != null ? Math.round(R.peso.cambio * 100) / 100 : null,
        tendencia_kg_semana: R.peso.kgSemana != null ? Math.round(R.peso.kgSemana * 100) / 100 : null }
    },
    dias
  };
}

/* Versión en texto para pegar en un chat (aún más corta) */
export function textoSemana(e) {
  const L = [];
  const r = e.resumen;
  L.push(`# Semana ${e.semana.desde} a ${e.semana.hasta} (V.I.T.A.)`);
  e.lee_esto.forEach(x => L.push(`- ${x}`));
  L.push(`\n## Perfil y objetivo`);
  L.push(`${e.perfil.sexo || "?"}, ${e.perfil.edad ?? "?"} años, ${e.perfil.altura_cm ?? "?"} cm, peso de cálculo ${e.perfil.peso_calculo_kg ?? "?"} kg. Objetivo: ${e.objetivo.kcal} kcal, P ${e.objetivo.prot_g} g, H ${e.objetivo.hid_g} g, G ${e.objetivo.gra_g} g, fibra ${e.objetivo.fib_g} g, ${e.objetivo.pasos} pasos.`);
  L.push(`Rangos de series/semana: ${Object.entries(e.rangos_series_semana).map(([g, v]) => `${g} ${v}`).join("; ")}.`);
  L.push(`\n## Resumen`);
  L.push(`Entreno: ${r.entreno.sesiones} sesiones, ${r.entreno.series} series, ${r.entreno.volumen_kg} kg, nota de volumen ${r.entreno.nota_volumen ?? "—"}/100. Series por grupo: ${Object.entries(r.entreno.series_por_grupo).map(([g, v]) => `${g} ${v}`).join("; ") || "—"}.${r.entreno.fuera_de_rango.length ? ` Fuera de rango: ${r.entreno.fuera_de_rango.join("; ")}.` : ""}`);
  L.push(`Comida (${r.comida.dias_registrados} días): ${r.comida.kcal_media ?? "—"} kcal, P ${r.comida.prot_media_g ?? "—"} g (${r.comida.prot_g_kg ?? "—"} g/kg), H ${r.comida.hid_media_g ?? "—"} g, G ${r.comida.gra_media_g ?? "—"} g, F ${r.comida.fib_media_g ?? "—"} g; ${r.comida.dias_dentro_10pct} días dentro del ±10 %.`);
  L.push(`Actividad: ${r.actividad.pasos_media ?? "—"} pasos de media (${r.actividad.dias_objetivo_pasos}/${r.actividad.dias_con_pasos} días con objetivo), cardio ${r.actividad.cardio_sesiones} sesiones / ${r.actividad.cardio_min} min. Gasto medio ${r.actividad.gasto_medio_kcal ?? "—"} kcal, balance medio ${r.actividad.balance_medio_kcal ?? "—"} kcal.`);
  if (r.sueno.noches) L.push(`Sueño (${r.sueno.noches} noches): ${r.sueno.media_h} h de media, ${r.sueno.noches_con_objetivo} noches con ${r.sueno.objetivo_h} h o más${r.sueno.fases_media_min ? `; fases medias: profundo ${r.sueno.fases_media_min.profundo} min, ligero ${r.sueno.fases_media_min.ligero}, REM ${r.sueno.fases_media_min.rem}, despierto ${r.sueno.fases_media_min.despierto}` : ""}${r.sueno.variacion_hora_acostarse_min != null ? `; la hora de acostarse varía ±${r.sueno.variacion_hora_acostarse_min} min` : ""}.`);
  if (r.composicion_bascula.medidas) { const c = r.composicion_bascula; L.push(`Báscula (${c.medidas} medidas, estimación): grasa ${c.grasa_pct_media ?? "—"} %, masa grasa ${c.masa_grasa_kg_media ?? "—"} kg, masa magra ${c.masa_magra_kg_media ?? "—"} kg, músculo ${c.musculo_kg_media ?? "—"} kg.`); }
  L.push(`Peso: media ${r.peso.media_semana_kg ?? "—"} kg (semana anterior ${r.peso.media_semana_anterior_kg ?? "—"}), cambio ${r.peso.cambio_kg ?? "—"} kg, tendencia ${r.peso.tendencia_kg_semana ?? "—"} kg/semana.`);
  L.push(`\n## Días`);
  e.dias.forEach(d => {
    const p = [`### ${d.dia} ${d.fecha}${d.en_curso ? " (en curso, incompleto)" : ""}`];
    const meta = [d.sueno ? `durmió ${d.sueno.horas} h${d.sueno.acostarse ? ` (${d.sueno.acostarse}–${d.sueno.despertar})` : ""}` : null, d.peso_kg ? `peso ${d.peso_kg} kg${d.grasa_pct_bascula ? ` (grasa ${d.grasa_pct_bascula} %)` : ""}${d.musculo_kg_bascula ? ` (músculo ${d.musculo_kg_bascula} kg)` : ""}` : d.grasa_pct_bascula ? `grasa ${d.grasa_pct_bascula} %` : null, d.pasos ? `${d.pasos} pasos` : null, d.gasto_kcal ? `gasto ${d.gasto_kcal.total} kcal` : null].filter(Boolean);
    if (meta.length) p.push(meta.join(" · "));
    if (d.medidas_cm) p.push(`Medidas (cm): ${Object.entries(d.medidas_cm).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    if (d.cardio) p.push(`Cardio: ${d.cardio.join("; ")}`);
    if (d.entreno) p.push(`Entreno (${d.entreno.volumen_kg} kg): ${d.entreno.ejercicios.join(" | ")}`);
    if (d.comida) {
      p.push(`Comida: ${d.comida.kcal} kcal, P ${d.comida.prot_g}, H ${d.comida.hid_g}, G ${d.comida.gra_g}, F ${d.comida.fib_g}`);
      COMIDAS.forEach(m => { if (d.comida[m.k]) p.push(`- ${m.n}: ${d.comida[m.k].join(", ")}`); });
    }
    if (p.length === 1) p.push("Sin datos apuntados.");
    L.push(p.join("\n"));
  });
  return L.join("\n");
}

/* ---------- sueño y el resto del día ----------
   Agrupa las noches por horas dormidas y compara el día siguiente (el día en
   que te despiertas): comida, proteína, pasos, entreno y balance. Es una
   asociación, no una causa: hace falta que cada grupo tenga varios días. */
export function relacionSueno(datos, desde, hasta, hoy) {
  const X = datos.mapa ? datos : contexto(datos);
  const aj = X.ajustes, obj = ((aj.sueno || {}).objetivoH || A.SUENO_OBJETIVO_H) * 60;
  const minimoComida = (aj.objetivo.kcal || 0) * 0.5;
  const cal = A.calibracion(sumarDias(hoy || hasta, -1), X.gctx);
  const fac = aj.gasto.usarCalibracion !== false && cal.listo ? cal.factor : 1;
  const grupos = [
    { k: "corto", n: `menos de ${f1h(obj - 60)}`, test: m => m < obj - 60 },
    { k: "justo", n: `${f1h(obj - 60)} a ${f1h(obj)}`, test: m => m >= obj - 60 && m < obj },
    { k: "bien", n: `${f1h(obj)} o más`, test: m => m >= obj }
  ].map(g => ({ ...g, dias: [] }));
  X.dias.forEach(d => {
    const s = A.suenoDe(d);
    if (!s || d.fecha < desde || d.fecha > hasta || (hoy && d.fecha >= hoy)) return;
    const g = grupos.find(x => x.test(s.min)); if (g) g.dias.push(d.fecha);
  });
  const media = l => l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
  return grupos.map(g => {
    const comida = g.dias.filter(f => X.ingesta[f] >= minimoComida);
    const tot = comida.map(f => K.totalComidas(X.diario.find(d => d.fecha === f).comidas, X.mapa));
    const pasos = g.dias.map(f => (X.dias.find(d => d.fecha === f) || {}).pasos).filter(v => v > 0);
    const ses = g.dias.map(f => X.sesiones.find(s => s.fecha === f && s.ejercicios.some(e => e.series.some(completa)))).filter(Boolean);
    const bal = comida.map(f => { const gd = A.gastoDia(f, X.gctx); return gd.total != null ? X.ingesta[f] - gd.total * fac : null; }).filter(v => v != null);
    return { k: g.k, nombre: g.n, noches: g.dias.length, mediaSuenoMin: media(g.dias.map(f => A.suenoDe(X.dias.find(d => d.fecha === f)).min)),
      diasComida: comida.length, kcal: media(tot.map(t => t.kcal)), prot: media(tot.map(t => t.prot)),
      diasPasos: pasos.length, pasos: media(pasos),
      pctEntreno: g.dias.length ? ses.length / g.dias.length * 100 : null, volumenSesion: media(ses.map(volumenKg)),
      balance: media(bal), diasBalance: bal.length };
  });
}
function f1h(min) { const h = min / 60; return `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`; }
