/* Pruebas de actividad y gasto: node tests/test_actividad.mjs gym.json fitcoock.json */
import fs from "node:fs";
import { importarCopias } from "../js/import.js";
import * as A from "../js/actividad-calc.js";
import * as K from "../js/comida-calc.js";
const gym = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const fit = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const r = importarCopias({ gym, fit });
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };

// 1) Entreno: mismas kcal que GYM-TRACKER (peso 65 de su ficha)
const iv = gym.perfiles.find(p => p.nombre === "Iván");
let n = 0;
iv.sesiones.forEach(s => {
  const mia = r.sesiones.find(x => x.fecha === s.fecha);
  const e = A.entreno(mia, 65, r.ajustes.entreno);
  ok(Math.abs(Math.round(e.kcal) - s.calculado.kcalEstimadas) <= 1, `entreno ${s.fecha}: ${Math.round(e.kcal)} vs ${s.calculado.kcalEstimadas}`);
  ok(Math.abs(e.min - s.calculado.duracionEstimadaMin) < 1, `duración ${s.fecha}: ${e.min} vs ${s.calculado.duracionEstimadaMin}`);
  n++;
});
console.log("sesiones comparadas:", n);

// 2) Cardio: cinta 20 min a 5,1 km/h y 10,5 % con 65 kg (fórmula ACSM a mano)
const c = { tipo: "cinta", min: 20, velocidad: 5.1, inclinacion: 10.5 };
const S = 5.1 * 1000 / 60, esperado = (0.1 * S + 1.8 * S * 0.105) * 65 * 20 / 1000 * 5;
ok(Math.abs(A.cardioKcal(c, 65) - esperado) < 1e-9, "cinta");
console.log("cinta 20 min:", Math.round(A.cardioKcal(c, 65)), "kcal · bici 15 min 74 W:", Math.round(A.cardioKcal({ tipo: "bici", min: 15, vatios: 74 }, 65)), "kcal");

// 3) Gasto de un día completo
r.ajustes.perfil.nacimiento = "1997-06-13"; r.ajustes.perfil.pesoReferencia = 64;
const mapa = K.porId(r.alimentos);
const ingesta = Object.fromEntries(r.diario.map(d => [d.fecha, K.totalComidas(d.comidas, mapa).kcal]));
const ctx = { dias: r.dias, sesiones: r.sesiones, ajustes: r.ajustes, ingesta };
const g = A.gastoDia("2026-10-13", ctx);
console.log("13/10:", Object.fromEntries(Object.entries({ peso: g.peso, basal: g.basal, pasos: g.pasos, desc: g.descontados, kPasos: g.kPasos, kEntreno: g.kEntreno, kCardio: g.kCardio, kDig: g.kDigestion, total: g.total }).map(([k, v]) => [k, Math.round(v * 10) / 10])));
ok(Math.abs(g.basal - (10 * 64 + 6.25 * 172 - 5 * 29 + 5)) < 1e-9, "basal");
ok(Math.abs(g.kDigestion - ingesta["2026-10-13"] * 0.1) < 1e-9, "digestión");

// 4) Semana 5-11 oct: ingesta frente a gasto
const sem = ["05", "06", "07", "08", "09", "10", "11"].map(d => A.gastoDia("2026-10-" + d, ctx));
const mi = sem.reduce((s, x) => s + x.ingesta, 0) / 7, mg = sem.reduce((s, x) => s + x.total, 0) / 7;
console.log("semana 5-11 oct · ingesta media", Math.round(mi), "· gasto estimado medio", Math.round(mg));

// 5) Calibración con datos sintéticos: peso estable, come 2500, fórmula dice 2000 -> factor limitado a 1,25
const dias = Array.from({ length: 28 }, (_, i) => ({ fecha: `2026-09-${String(i + 1).padStart(2, "0")}`, peso: i % 3 === 0 ? 64 + (i % 2 ? 0.2 : -0.2) : undefined, pasos: 8000 }));
const ing = Object.fromEntries(dias.map(d => [d.fecha, 2500]));
const cal = A.calibracion("2026-09-28", { dias, sesiones: [], ajustes: r.ajustes, ingesta: ing });
console.log("calibración sintética:", cal.listo, cal.falta, cal.listo && { real: Math.round(cal.real), estimado: Math.round(cal.estimado), bruto: cal.bruto.toFixed(2), factor: cal.factor });
ok(cal.listo && cal.factor <= 1.25 && cal.factor >= 0.75, "factor limitado");
// con los datos reales aún no hay pesajes suficientes
const real = A.calibracion("2026-10-14", ctx);
console.log("calibración real:", real.listo ? real.factor : real.falta);

// 6) Objetivo sugerido
const sug = A.objetivoSugerido("2026-10-15", ctx);
console.log("objetivo sugerido:", sug.listo ? `${sug.sugerido} kcal (media ${Math.round(sug.media)}, ${sug.dias} días, calibrado ${sug.calibrado})` : sug);

// 7) Cinta corriendo (> 8 km/h) usa la ecuación de carrera del ACSM
const run = { tipo: "cinta", min: 10, velocidad: 10, inclinacion: 1 }, Sr = 10 * 1000 / 60;
ok(Math.abs(A.cardioKcal(run, 65) - (0.2 * Sr + 0.9 * Sr * 0.01) * 65 * 10 / 1000 * 5) < 1e-9, "cinta corriendo");
// 8) La calibración ignora los días con menos de la mitad del objetivo
const ing2 = { ...ing }; Object.keys(ing2).slice(0, 20).forEach(f => ing2[f] = 600);
const cal2 = A.calibracion("2026-09-28", { dias, sesiones: [], ajustes: r.ajustes, ingesta: ing2 });
ok(!cal2.listo && cal2.diasComida === 8, "días incompletos fuera: " + cal2.diasComida);
// Correr en cinta: ecuación de carrera siempre; velocidad = distancia / tiempo si no se apunta
{
  const k1 = A.cardioKcal({ tipo: "carrera", min: 30, km: 5, inclinacion: 1 }, 70);
  const k2 = A.cardioKcal({ tipo: "carrera", min: 30, velocidad: 10, inclinacion: 1 }, 70);
  const S = 10000 / 60, esperado = (0.2 * S + 0.9 * S * 0.01) * 70 * 30 / 1000 * 5;
  ok(Math.abs(k1 - esperado) < 0.01 && Math.abs(k2 - esperado) < 0.01, `carrera 10 km/h 1 %: ${k1.toFixed(1)} / ${esperado.toFixed(1)}`);
  const lento = A.cardioKcal({ tipo: "carrera", min: 30, velocidad: 7 }, 70), andando = A.cardioKcal({ tipo: "cinta", min: 30, velocidad: 7 }, 70);
  ok(lento > andando * 1.9, "a 7 km/h corriendo usa la ecuación de carrera (≈ doble que andando sin pendiente)");
  ok(A.cardioMin({ tipo: "carrera", km: 5, velocidad: 10 }) === 30, "minutos desde distancia y velocidad");
  ok(A.cardioPasos({ tipo: "carrera", min: 30, km: 5 }, 175) === 30 * A.CADENCIA_CARRERA, "pasos estimados por cadencia");
  ok(A.cardioPasos({ tipo: "carrera", min: 30, km: 5, pasosReloj: 4950 }, 175) === 4950, "pasos del reloj");
  ok(A.cardioPasos({ tipo: "carrera", min: 30, km: 5, llevaba: false }, 175) === 0, "sin reloj, no se descuentan");
  ok(A.cardioKcal({ tipo: "cinta", min: 30, velocidad: 9 }, 70) === A.cardioKcal({ tipo: "carrera", min: 30, velocidad: 9 }, 70), "andar a más de 8 km/h sigue usando la de carrera");
}
// Composición corporal (báscula)
{
  const ds = [{ fecha: "2026-10-01", peso: 64, grasaPct: 15 }, { fecha: "2026-10-02", grasaPct: 16 }, { fecha: "2026-10-03", peso: 63, musculoKg: 50 }, { fecha: "2026-10-04", peso: 63.5 }];
  const c = A.composiciones(ds);
  ok(c.length === 3 && Math.abs(c[0].grasaKg - 9.6) < 1e-9 && Math.abs(c[0].magraKg - 54.4) < 1e-9 && c[1].grasaKg === null && c[2].musculoKg === 50, "composiciones");
  const R = A.resumenComposicion([...ds, { fecha: "2026-09-01", peso: 65, grasaPct: 17 }], "2026-10-04", 28);
  ok(R.actual.n === 3 && R.actual.grasaPct === 15.5 && R.anterior.n === 1 && Math.abs(R.cambio.grasaPct + 1.5) < 1e-9, "resumen 4 semanas: " + JSON.stringify(R.cambio));
  ok(A.mediaMovilDe(c, "grasaPct", 7).map(x => x.media).join() === "15,15.5", "media móvil de grasa");
}
console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
