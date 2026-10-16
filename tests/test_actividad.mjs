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

console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
