import fs from "node:fs";
import { importarCopias, volumenSesion, kcalDia } from "../js/import.js";
const gym = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const fit = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const r = importarCopias({ gym, fit });
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };
console.log("ejercicios", r.ejercicios.length, "sesiones", r.sesiones.length, "dias", r.dias.length,
  "alimentos", r.alimentos.length, "menus", r.menus.length, "diario", r.diario.length);
console.log("avisos:", r.avisos);
// 1) volumen de cada sesión = calculado.volumenKg de GYM-TRACKER
const iv = gym.perfiles.find(p => p.nombre === "Iván");
const calc = Object.fromEntries(iv.sesiones.map(s => [s.fecha, s.calculado.volumenKg]));
r.sesiones.forEach(s => ok(Math.round(volumenSesion(s)) === calc[s.fecha], `volumen ${s.fecha}: ${Math.round(volumenSesion(s))} vs ${calc[s.fecha]}`));
// 2) kcal de cada día = derivados de FitCoock
const al = Object.fromEntries(r.alimentos.map(a => [a.id, a]));
const der = Object.fromEntries(fit.derivados.dias_registrados.map(d => [d.fecha, d.kcal]));
r.diario.forEach(d => ok(Math.abs(kcalDia(d, al) - der[d.fecha]) < 0.1, `kcal ${d.fecha}: ${kcalDia(d, al).toFixed(2)} vs ${der[d.fecha]}`));
// 3) ninguna referencia rota
const ids = new Set(r.alimentos.map(a => a.id));
r.diario.concat(r.menus).forEach(d => Object.values(d.comidas).forEach(l => l.forEach(it => ok(it.libre || ids.has(it.id), "ref rota " + it.id))));
r.alimentos.filter(a => a.tipo === "plato").forEach(p => p.ingredientes.forEach(i => ok(ids.has(i.id), "ingrediente roto " + i.id)));
ok(!JSON.stringify(r).includes("g_cocinado"), "queda g_cocinado");
// 4) números, no texto
r.sesiones.forEach(s => s.ejercicios.forEach(e => e.series.forEach(st => ok(st.peso === null || typeof st.peso === "number", "peso texto"))));
// 5) pasos, pesos y cardio completos
ok(r.dias.filter(d => d.pasos).length === Object.keys(iv.pasosDiarios).length, "pasos");
ok(r.dias.filter(d => d.peso).length === Object.keys(iv.pesoCorporal).length, "pesajes");
ok(r.dias.reduce((a, d) => a + (d.cardio || []).length, 0) === Object.values(iv.cardio).flat().length, "cardio");
// 6) grupos nuevos
const sup = r.ejercicios.find(e => e.nombre.includes("superset"));
console.log("superset:", sup.grupos, "| press militar:", r.ejercicios.find(e => e.nombre === "Press militar en máquina").grupos);
console.log("ajustes:", JSON.stringify(r.ajustes.objetivo), JSON.stringify(r.ajustes.entreno.segundosSerie), r.ajustes.actividad);
console.log("tamaño JSON compacto:", JSON.stringify(r).length, "bytes");
console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
