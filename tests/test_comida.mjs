/* Pruebas de los cálculos de comida con las copias reales:
   node tests/test_comida.mjs gym.json fitcoock.json */
import fs from "node:fs";
import { importarCopias } from "../js/import.js";
import * as K from "../js/comida-calc.js";
const gym = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const fit = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const r = importarCopias({ gym, fit });
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };

// 1) Recalcular platos no cambia nada respecto a FitCoock
const antes = JSON.parse(JSON.stringify(r.alimentos.filter(K.esPlato)));
const cambiados = K.recalcPlatos(r.alimentos);
r.alimentos.filter(K.esPlato).forEach(p => {
  const a = antes.find(x => x.id === p.id);
  ["kcal", "prot", "hid", "gra", "fib", "pesoTotal", "precio"].forEach(k => ok(Math.abs((a[k] || 0) - (p[k] || 0)) < 0.01, `plato ${p.nombre} ${k}: ${a[k]} vs ${p[k]}`));
});
console.log("platos recalculados sin diferencias:", antes.length, "· marcados como cambiados:", cambiados.length);

// 2) Totales de cada día = derivados de FitCoock
const mapa = K.porId(r.alimentos);
fit.derivados.dias_registrados.forEach(d => {
  const dia = r.diario.find(x => x.fecha === d.fecha);
  const t = K.totalComidas(dia.comidas, mapa);
  ["kcal", "prot", "hid", "gra", "fib"].forEach(k => ok(Math.abs(t[k] - d[k]) < 0.1, `día ${d.fecha} ${k}: ${t[k]} vs ${d[k]}`));
});

// 3) Objetivo en gramos = el de FitCoock
const o = K.objetivoGramos(r.ajustes.objetivo, 64);
const og = fit.derivados.objetivo_en_gramos;
["kcal", "prot", "hid", "gra", "fib"].forEach(k => ok(Math.abs(Math.round(o[k]) - og[k]) < 1, `objetivo ${k}: ${o[k]} vs ${og[k]}`));
// g/kg mezclado
const o2 = K.objetivoGramos({ kcal: 2400, prot: { modo: "gkg", valor: 2 }, hid: { modo: "pct", valor: 54 }, gra: { modo: "gkg", valor: 1 }, fibra: 25 }, 64);
ok(Math.abs(o2.prot - 128) < 0.01 && Math.abs(o2.gra - 64) < 0.01, "g/kg fijos");
ok(Math.abs(o2.hid - (2400 - 128 * 4 - 64 * 9) / 4) < 0.01, "hidratos con el resto");
console.log("objetivo mezclado:", Math.round(o2.prot), Math.round(o2.hid), Math.round(o2.gra), o2.avisos);

// 4) Fritura: 200 g de pollo frito al 8 % -> 16 g de aceite absorbido
const pollo = r.alimentos.find(a => a.codigo === "023");
const plato = { id: "x", tipo: "plato", nombre: "Pollo frito", ingredientes: [{ id: pollo.id, g: 200, frito: 8 }], raciones: 1, pesoFinal: 0 };
const pr = K.calcularPlato(plato, mapa, r.alimentos);
ok(Math.abs(pr.aceiteG - 16) < 1e-9, "aceite absorbido");
ok(Math.abs(pr.total.kcal - (106 * 2 + 819 * 16 / 0.91 / 100)) < 0.01, "kcal con aceite");
console.log("pollo frito 200 g:", Math.round(pr.total.kcal), "kcal ·", Math.round(pr.aceiteCant), "ml de aceite · peso cocinado", Math.round(pr.peso));

// 5) Completar objetivo: el 14/10 sin cena
const hist = K.historialPorciones(r.diario, "2026-06-01");
const dia = r.diario.find(x => x.fecha === "2026-10-14");
const t = K.totalComidas(dia.comidas, mapa);
const hueco = { kcal: o.kcal - t.kcal, prot: o.prot - t.prot, hid: o.hid - t.hid, gra: o.gra - t.gra };
console.log("falta el 14/10:", Object.fromEntries(Object.entries(hueco).map(([k, v]) => [k, Math.round(v)])));
const ini = Date.now();
const ops = K.completarObjetivo({ hueco, obj: o, alimentos: r.alimentos, hist, comida: "cena" });
console.log("opciones en", Date.now() - ini, "ms");
ops.forEach(x => console.log(" ·", x.items.map(i => `${Math.round(i.g)} ${K.unidad(i.a)} ${i.a.nombre}`).join(" + "), "→ queda", Object.values(x.queda).map(v => Math.round(v)).join("/"), `(mejora ${Math.round(x.mejora * 100)} %)`));
ok(ops.length > 0, "hay opciones");
ops.forEach(x => x.items.forEach(i => { const h = hist[i.a.id]; if (h) ok(i.g <= Math.max(...h.valores) * 2 + 1, `porción irreal ${i.a.nombre} ${i.g}`); }));

// 6) Compra
const compra = K.calcularCompra({ items: [{ tipo: "menu", id: r.menus[0].id, cant: 2 }] }, r.alimentos, r.menus);
console.log("compra de 2× «" + r.menus[0].nombre + "»:", Object.values(compra).flat().map(x => `${Math.round(x.g)} ${x.a.nombre.slice(0, 25)}`).join(", "));

// 7) Etiqueta
const et = K.analizarEtiqueta("Valor energético 1.550 kJ / 370 kcal Grasas 12 g, de las cuales saturadas 2 g Hidratos de carbono 60 g Fibra alimentaria 5 g Proteínas 12 g");
ok(et.kcal.v === 370 && et.gra.v === 12 && et.hid.v === 60 && et.fib.v === 5 && et.prot.v === 12, "etiqueta");

// 8) Base: con lo importado no falta nada
const b = K.baseNuevos(r.alimentos, r.ajustes.app.baseVistos, false, () => "id");
ok(b.nuevos.length === 0, "base sin nuevos: " + b.nuevos.length);
const b2 = K.baseNuevos(r.alimentos, [], true, () => "id");
console.log("reponer base desde cero añadiría:", b2.nuevos.length);

console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
