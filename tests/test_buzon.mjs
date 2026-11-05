/* Buzón de entrada: node tests/test_buzon.mjs gym.json fitcoock.json */
import fs from "node:fs";
import { importarCopias } from "../js/import.js";
import * as B from "../js/buzon-calc.js";
const r = importarCopias({ gym: JSON.parse(fs.readFileSync(process.argv[2])), fit: JSON.parse(fs.readFileSync(process.argv[3])) });
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };
const S = { dias: r.dias, diario: r.diario, alimentos: r.alimentos, menus: r.menus, hoy: "2026-11-05" };
const fila = (tipo, datos, extra = {}) => ({ fila: 2, id: "x", tipo, datosTxt: typeof datos === "string" ? datos : JSON.stringify(datos), nota: "", estado: "", ...extra });
const prod = r.alimentos.find(a => a.tipo !== "plato" && !a.archivado), plato = r.alimentos.find(a => a.tipo === "plato" && !a.archivado);

// leerFilas / pendientes
const ents = B.leerFilas([["1", "", "pesaje", '{"fecha":"2026-11-05","peso":64}', "", "", ""], ["2", "", "medidas", "{}", "", "aplicado 2026-11-04", ""], ["", "", "", "", "", "", ""]]);
ok(ents.length === 2 && ents[0].fila === 2 && ents[1].fila === 3 && B.pendientes(ents).length === 1, "leerFilas/pendientes");

// pesaje
let v = B.validar(fila("pesaje", { fecha: "2026-11-05", peso: 64.25, grasaPct: 15.4 }), S);
ok(v.ok && v.cambios.col === "dias" && v.cambios.campos.peso === 64.3 && v.cambios.campos.grasaPct === 15.4, "pesaje: " + JSON.stringify(v));
ok(!B.validar(fila("pesaje", { fecha: "2026-11-05", peso: 400 }), S).ok, "peso fuera de rango");
ok(!B.validar(fila("pesaje", { fecha: "2026-12-05", peso: 64 }), S).ok, "fecha futura");
ok(!B.validar(fila("pesaje", { peso: 64 }), S).ok, "sin fecha");
ok(!B.validar(fila("pesaje", "no es json"), S).ok, "JSON malo");
const conPeso = r.dias.find(d => d.peso);
v = B.validar(fila("pesaje", { fecha: conPeso.fecha, peso: conPeso.peso + 1 }), S);
ok(v.ok && v.avisos.length === 1, "aviso al sustituir peso");

// medidas: se mezclan con las existentes
const S2 = { ...S, dias: [...S.dias.filter(d => d.fecha !== "2026-11-01"), { fecha: "2026-11-01", medidas: { cintura: 80 } }] };
v = B.validar(fila("medidas", { fecha: "2026-11-01", medidas: { brazoD: 34.5, brazoI: 34 } }), S2);
ok(v.ok && JSON.stringify(v.cambios.campos.medidas) === JSON.stringify({ cintura: 80, brazoD: 34.5, brazoI: 34 }), "medidas mezcladas: " + JSON.stringify(v.cambios));
ok(!B.validar(fila("medidas", { fecha: "2026-11-01", medidas: { oreja: 5 } }), S).ok, "medida desconocida");
ok(!B.validar(fila("medidas", { fecha: "2026-11-01", medidas: { cintura: 500 } }), S).ok, "medida fuera de rango");

// comida: añadir y sustituir
const di = r.diario.find(d => (d.comidas.comida || []).length);
v = B.validar(fila("comida", { fecha: di.fecha, comida: "comida", items: [{ id: prod.id, g: 150 }, { libre: true, nombre: "Postre", kcal: 200, prot: 3 }] }), S);
ok(v.ok && v.cambios.doc.comidas.comida.length === di.comidas.comida.length + 2 && v.avisos.length === 1, "comida añadir: " + v.error);
ok(v.cambios.doc.comidas.desayuno.length === (di.comidas.desayuno || []).length, "no toca otras comidas");
v = B.validar(fila("comida", { fecha: di.fecha, comida: "comida", modo: "sustituir", items: [{ id: plato.id, g: 300 }] }), S);
ok(v.ok && v.cambios.doc.comidas.comida.length === 1 && /Sustituye/.test(v.avisos[0]), "comida sustituir");
ok(!B.validar(fila("comida", { fecha: di.fecha, comida: "comida", items: [{ id: "no-existe", g: 100 }] }), S).ok, "alimento inexistente");
ok(!B.validar(fila("comida", { fecha: di.fecha, comida: "brunch", items: [{ id: prod.id, g: 100 }] }), S).ok, "comida no válida");
ok(!B.validar(fila("comida", { fecha: di.fecha, comida: "cena", items: [{ id: prod.id, g: 0 }] }), S).ok, "gramos 0");
ok(!B.validar(fila("comida", { fecha: di.fecha, comida: "cena", items: [{ libre: true, nombre: "x" }] }), S).ok, "libre sin kcal");
// el día de hoy aún sin diario
v = B.validar(fila("comida", { fecha: "2026-11-05", comida: "cena", items: [{ id: prod.id, g: 100 }] }), S);
ok(v.ok && v.cambios.doc.comidas.cena.length === 1 && v.cambios.doc.fecha === "2026-11-05", "comida en día nuevo");

// menú
v = B.validar(fila("menu", { nombre: "Menú prueba", comidas: { desayuno: [{ id: prod.id, g: 60 }], cena: [{ id: plato.id, g: 350 }] } }), S);
ok(v.ok && v.cambios.col === "menus" && v.cambios.doc.comidas.desayuno.length === 1 && v.cambios.doc.comidas.comida.length === 0, "menú");
ok(!B.validar(fila("menu", { nombre: "", comidas: {} }), S).ok, "menú sin nombre");
ok(!B.validar(fila("loquesea", {}), S).ok, "tipo desconocido");
console.log(v.lineas.join(" | "));
console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
