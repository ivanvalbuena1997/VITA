/* Planificador y catálogo: node tests/test_plan.mjs gym.json fitcoock.json */
import fs from "node:fs";
import { importarCopias } from "../js/import.js";
import * as PL from "../js/plan-calc.js";
import { seriesPorGrupo, lunesDe } from "../js/semana-calc.js";
const r = importarCopias({ gym: JSON.parse(fs.readFileSync(process.argv[2])), fit: JSON.parse(fs.readFileSync(process.argv[3])) });
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };
const mapa = PL.porId(r.ejercicios);

// Plan vacío y normalización
const p = PL.planVacio("p1", "Prueba", "2026-10-19T00:00:00Z");
ok(p.dias.length === 7 && p.dias.every(d => d.nombre === "" && !d.ejercicios.length), "plan vacío con 7 días");
const n = PL.normalizar({ id: "x", dias: [{ nombre: "A", ejercicios: [{ ejercicioId: "e", series: 40 }, { series: 2 }] }] });
ok(n.dias.length === 7 && n.dias[0].ejercicios.length === 1 && n.dias[0].ejercicios[0].series === PL.SERIES_MAX && n.nombre === "Plan sin nombre", "normalizar");

// Desde el historial: una semana con sesiones; el volumen del plan = series hechas por grupo de esa semana
const lunes = PL.semanasConSesiones(r.sesiones)[1];
const { plan, omitidos } = PL.planDesdeSemana(lunes, r.sesiones, mapa, "p2", "Desde historial", "2026-10-19T00:00:00Z");
const fin = new Date(lunes + "T00:00:00"); fin.setDate(fin.getDate() + 7);
const ses = r.sesiones.filter(s => lunesDe(s.fecha) === lunes);
const real = seriesPorGrupo(ses.map(s => ({ ...s, ejercicios: s.ejercicios.map(e => ({ ...e, grupos: mapa[e.ejercicioId] ? mapa[e.ejercicioId].grupos : e.grupos })) })));
const plano = PL.seriesPlan(plan, mapa);
console.log("semana", lunes, "sesiones", ses.length, "omitidos", omitidos);
console.log("real ", JSON.stringify(real)); console.log("plan ", JSON.stringify(plano));
ok(omitidos === 0, "sin omitidos");
ok(Object.keys(real).every(g => Math.abs((plano[g] || 0) - real[g]) < 1e-9), "volumen del plan = volumen hecho esa semana");
ok(plan.dias.filter(d => d.ejercicios.length).length === ses.length, "un día por sesión");

// Copiar día, duplicar y quitar ejercicio de los planes
const conDatos = plan.dias.findIndex(d => d.ejercicios.length), vacio = plan.dias.findIndex(d => !d.ejercicios.length);
plan.dias[conDatos].nombre = "Torso A";
PL.copiarDia(plan, conDatos, vacio);
ok(plan.dias[vacio].nombre === "Torso A" && plan.dias[vacio].ejercicios.length === plan.dias[conDatos].ejercicios.length, "copiar día");
plan.dias[vacio].ejercicios[0].series = 9;
ok(plan.dias[conDatos].ejercicios[0].series !== 9 || plan.dias[conDatos].ejercicios[0] !== plan.dias[vacio].ejercicios[0], "copia independiente");
const dup = PL.duplicarPlan(plan, "p3", "Copia");
dup.dias[0].nombre = "cambiado";
ok(dup.id === "p3" && plan.dias[0].nombre !== "cambiado", "duplicar independiente");
const ejId = plan.dias[conDatos].ejercicios[0].ejercicioId;
ok(PL.planesCon([plan, dup, p], ejId).length === 2, "planesCon");
const cambiados = PL.quitarDePlanes([plan, dup, p], ejId);
ok(cambiados.length === 2 && !PL.planesCon([plan, dup], ejId).length, "quitar de planes");
// ejercicio borrado del catálogo: no cuenta en el volumen
const q = PL.planVacio("p4", "x"); q.dias[0].ejercicios.push({ ejercicioId: "no-existe", series: 3 });
ok(Object.keys(PL.seriesPlan(q, mapa)).length === 0, "borrado no cuenta");

// Uso y aplicar al historial
const usado = r.ejercicios.find(e => PL.usoEjercicio(r.sesiones, e.id).sesiones > 2);
const u = PL.usoEjercicio(r.sesiones, usado.id);
ok(u.sesiones > 2 && u.ultima, "uso");
const cambiadas = PL.aplicarAlHistorial(r.sesiones, usado.id, { nombre: "Nuevo nombre", grupos: { Core: 1 }, unilateral: true });
ok(cambiadas.length === u.sesiones && cambiadas.every(s => s.ejercicios.filter(e => e.ejercicioId === usado.id).every(e => e.nombre === "Nuevo nombre" && e.grupos.Core === 1 && e.unilateral)), "aplicar al historial");
console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
