/* Sueño: node tests/test_sueno.mjs gym.json fitcoock.json */
import fs from "node:fs";
import { importarCopias } from "../js/import.js";
import * as A from "../js/actividad-calc.js";
import * as W from "../js/semana-calc.js";
import { toISO } from "../js/model.js";
const r = importarCopias({ gym: JSON.parse(fs.readFileSync(process.argv[2])), fit: JSON.parse(fs.readFileSync(process.argv[3])) });
r.ajustes.perfil.nacimiento = "1997-06-13"; r.ajustes.perfil.pesoReferencia = 64;
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };
const sumar = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };

// leerHoras
[["7:30", 450], ["7h30", 450], ["7,5", 450], ["7.25", 435], ["8", 480], [" 6 h ", 360], ["", null]].forEach(([t, v]) => ok(A.leerHoras(t) === v, `leerHoras(${t}) = ${A.leerHoras(t)}`));
["25", "7:75", "abc"].forEach(t => ok(Number.isNaN(A.leerHoras(t)), `leerHoras(${t}) inválido`));
ok(A.horasTxt(452) === "7 h 32 min", A.horasTxt(452));
ok(A.horaReloj(23 * 60 + 41) === "23:41" && A.horaReloj(24 * 60 + 30) === "0:30", "horaReloj");

// resumenSueno con noches sintéticas (una pasada la medianoche)
const dias = [
  { fecha: "2026-10-10", sueno: { min: 420, inicio: "2026-10-09T23:30:00+02:00", fin: "2026-10-10T07:00:00+02:00", fases: { profundo: 80, ligero: 250, rem: 90, despierto: 20 }, fuente: "health-connect" } },
  { fecha: "2026-10-11", sueno: { min: 360, inicio: "2026-10-11T00:30:00+02:00", fin: "2026-10-11T07:00:00+02:00", fuente: "manual" } },
  { fecha: "2026-10-12", sueno: { min: 480, inicio: "2026-10-11T23:00:00+02:00", fin: "2026-10-12T07:00:00+02:00", fases: { profundo: 100, ligero: 270, rem: 110, despierto: 30 }, fuente: "health-connect" } },
  { fecha: "2026-10-13", pasos: 9000 }
];
const s = A.resumenSueno(dias, ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"], 7);
ok(s.noches === 3 && s.mediaMin === 420 && s.conObjetivo === 2 && s.minMin === 360 && s.maxMin === 480, "resumen: " + JSON.stringify(s));
ok(s.fases.noches === 2 && s.fases.profundo === 90, "fases medias");
ok(Math.round(s.acostarseMedia) === 23 * 60 + 40, "acostarse media 23:40: " + A.horaReloj(s.acostarseMedia));
ok(s.regularidad && Math.round(s.regularidad.despertar) === 0, "regularidad");
ok(A.resumenSueno(dias, ["2026-10-13"]).noches === 0, "sin noches");

// En los datos reales: noches sintéticas en los 21 días anteriores al 14/10
const hoy = "2026-10-14";
const conDia = new Set(r.dias.map(d => d.fecha));
for (let i = 1; i <= 21; i++) {
  const f = sumar(hoy, -i), min = [330, 400, 470][i % 3];
  if (!conDia.has(f)) r.dias.push({ fecha: f });
  r.dias.find(d => d.fecha === f).sueno = { min, fuente: "manual" };
}
if (!conDia.has(hoy)) r.dias.push({ fecha: hoy });
r.dias.find(d => d.fecha === hoy).sueno = { min: 400, fuente: "manual" };
const rel = W.relacionSueno(r, sumar(hoy, -90), sumar(hoy, -1), hoy);
console.log(JSON.stringify(rel, null, 1));
ok(rel.length === 3 && rel.map(g => g.noches).join() === "7,7,7", "grupos 7/7/7: " + rel.map(g => g.noches));
ok(rel.every(g => g.diasComida <= g.noches), "días con comida ≤ noches");
ok(rel.find(g => g.k === "corto").mediaSuenoMin === 330, "media grupo corto");
// Hoy no entra en el análisis
ok(rel.reduce((a, g) => a + g.noches, 0) === 21, "hoy fuera");

// Resumen semanal y exportación con sueño
const R = W.resumenSemana("2026-10-12", r, hoy);
ok(R.sueno.noches === 3, "semana: 3 noches (12, 13 y hoy): " + R.sueno.noches);
const e = W.exportarSemana("2026-10-12", r, { hoy });
ok(e.resumen.sueno.noches === 3 && e.resumen.sueno.objetivo_h === 7, "export resumen sueño");
ok(e.dias[0].sueno && e.dias[0].sueno.horas > 0, "export día con sueño");
const txt = W.textoSemana(e);
ok(/Sueño \(3 noches\)/.test(txt) && /durmió/.test(txt), "texto con sueño");
console.log(txt.split("\n").filter(l => /Sueño|durmió/.test(l)).join("\n"));
console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
