/* V.I.T.A. — cálculos de comida, sin pantalla (se pueden probar con node).
   Reglas heredadas de FitCoock que no cambian:
   - Los valores de un alimento van por 100 g o 100 ml (campo «unidad»).
   - El campo «g» de un item está en el mismo estado que esos valores: crudo
     en lo que tiene factor de cocción, tal cual en lo demás, y plato ya
     terminado en los platos. Macro = valor_por_100 · g / 100, sin convertir.
   - Los items «libre» llevan valores TOTALES, no por 100. */

import { COMIDAS } from "./model.js";
import { BASE } from "./comida-base.js";

export const MACROS = ["kcal", "prot", "hid", "gra", "fib"];
export const CEROS = () => ({ kcal: 0, prot: 0, hid: 0, gra: 0, fib: 0 });
export const num = v => { if (typeof v === "number") return Number.isFinite(v) ? v : 0; const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const sumar = (a, b) => { const o = {}; MACROS.forEach(k => o[k] = a[k] + b[k]); return o; };
export const escalar = (m, f) => { const o = {}; MACROS.forEach(k => o[k] = m[k] * f); return o; };

/* Densidad del aceite para pasar gramos absorbidos a ml (aprox. 0,91 g/ml) */
export const DENSIDAD_ACEITE = 0.91;
/* Aceite absorbido al freír, en % del peso crudo del alimento (estimación):
   fritura normal 5–10 %, rebozado o empanado 10–20 %. Se usa el punto medio. */
export const FRITURA = {
  frito:    { n: "Frito",              pct: 8,  rango: "5–10 %" },
  rebozado: { n: "Rebozado o empanado", pct: 15, rango: "10–20 %" }
};

export const porId = alimentos => Object.fromEntries(alimentos.map(a => [a.id, a]));
export const esPlato = a => a && a.tipo === "plato";
export const unidad = a => esPlato(a) ? "g" : (a && a.unidad === "ml" ? "ml" : "g");
/* Factor de cocción útil: solo productos, mayor que 0 y distinto de 1 */
export function factorDe(a) {
  const f = num(a && a.factor);
  return a && !esPlato(a) && f > 0 && Math.abs(f - 1) > 0.001 ? f : 0;
}
export const macrosDe = (a, g) => { const f = num(g) / 100; const o = {}; MACROS.forEach(k => o[k] = num(a[k]) * f); return o; };
export function macrosItem(it, mapa) {
  if (!it) return null;
  if (it.libre) { const o = {}; MACROS.forEach(k => o[k] = num(it[k])); return o; }
  const a = mapa[it.id];
  return a ? macrosDe(a, it.g) : null;
}
export const totalItems = (items, mapa) => (items || []).reduce((t, it) => { const m = macrosItem(it, mapa); return m ? sumar(t, m) : t; }, CEROS());
export const totalComidas = (comidas, mapa) => COMIDAS.reduce((t, c) => sumar(t, totalItems((comidas || {})[c.k], mapa)), CEROS());
export const kcalDeMacros = m => m.prot * 4 + m.hid * 4 + m.gra * 9 + m.fib * 2;
export const coste = (a, g) => num(a && a.precio) > 0 ? num(a.precio) * num(g) / 1000 : 0;

export function costeComidas(comidas, mapa) {
  let c = 0, sinPrecio = 0, sinImporte = 0;
  COMIDAS.forEach(m => ((comidas || {})[m.k] || []).forEach(it => {
    if (it.libre) { if (num(it.precio) > 0) c += num(it.precio); else sinImporte++; return; }
    const a = mapa[it.id]; if (!a) return;
    if (num(a.precio) > 0) c += coste(a, it.g); else sinPrecio++;
  }));
  return { coste: c, sinPrecio, sinImporte };
}

/* ---------- platos ---------- */
/* Aceite de freír de un plato: el elegido, o el AOVE de la base, o cualquier aceite */
export function aceiteDe(plato, mapa, alimentos) {
  if (plato.aceiteId && mapa[plato.aceiteId]) return mapa[plato.aceiteId];
  return alimentos.find(a => a.codigo === "013" && !a.archivado)
    || alimentos.find(a => !esPlato(a) && !a.archivado && /aceite/i.test(a.nombre)) || null;
}
/* Desglose de un plato: macros totales, peso crudo y cocinado, aceite absorbido y coste */
export function calcularPlato(plato, mapa, alimentos) {
  let t = CEROS(), crudo = 0, cocinado = 0, cost = 0, faltaPrecio = false, aceiteG = 0;
  const aceite = aceiteDe(plato, mapa, alimentos);
  (plato.ingredientes || []).forEach(ing => {
    const a = mapa[ing.id]; if (!a) return;
    const g = num(ing.g);
    t = sumar(t, macrosDe(a, g));
    crudo += g;
    cocinado += g * (factorDe(a) || 1);
    if (num(a.precio) > 0) cost += coste(a, g); else faltaPrecio = true;
    const pct = num(ing.frito);
    if (pct > 0) aceiteG += g * pct / 100;
  });
  let aceiteCant = 0;
  if (aceiteG > 0 && aceite) {
    aceiteCant = unidad(aceite) === "ml" ? aceiteG / DENSIDAD_ACEITE : aceiteG;
    t = sumar(t, macrosDe(aceite, aceiteCant));
    cocinado += aceiteG;
    if (num(aceite.precio) > 0) cost += coste(aceite, aceiteCant);
  }
  const peso = num(plato.pesoFinal) > 0 ? num(plato.pesoFinal) : cocinado;
  return { total: t, crudo, cocinado, peso, coste: cost, faltaPrecio, aceite, aceiteG, aceiteCant, raciones: num(plato.raciones) > 0 ? num(plato.raciones) : 1 };
}
/* Recalcula los valores por 100 g de todos los platos (también los que llevan
   otros platos). Devuelve los platos que han cambiado, para guardarlos. */
export function recalcPlatos(alimentos) {
  const mapa = porId(alimentos), cambiados = new Set();
  for (let pasada = 0; pasada < 6; pasada++) {
    let hubo = false;
    alimentos.filter(esPlato).forEach(p => {
      const r = calcularPlato(p, mapa, alimentos);
      const f = r.peso > 0 ? 100 / r.peso : 0;
      const nuevo = { ...escalar(r.total, f), pesoTotal: r.peso, pesoCocinado: r.cocinado,
        precio: r.peso > 0 && r.coste > 0 ? r.coste / r.peso * 1000 : 0, precioIncompleto: r.faltaPrecio };
      Object.entries(nuevo).forEach(([k, v]) => {
        const viejo = p[k];
        const igual = typeof v === "number" ? Math.abs(num(viejo) - v) < 1e-4 : viejo === v;
        if (!igual) { p[k] = v; hubo = true; cambiados.add(p); }
      });
    });
    if (!hubo) break;
  }
  return [...cambiados];
}
/* ¿El alimento id acaba dependiendo de objetivo? (evita platos en bucle) */
export function dependeDe(id, objetivo, mapa, visto = new Set()) {
  if (id === objetivo) return true;
  if (visto.has(id)) return false;
  visto.add(id);
  const a = mapa[id];
  return !!(a && esPlato(a) && (a.ingredientes || []).some(i => dependeDe(i.id, objetivo, mapa, visto)));
}
/* Dónde se usa un alimento (para avisar antes de borrarlo) */
export function usosDe(id, alimentos, menus, diario) {
  const usaItems = c => COMIDAS.some(m => ((c || {})[m.k] || []).some(i => !i.libre && i.id === id));
  return {
    platos: alimentos.filter(p => esPlato(p) && (p.ingredientes || []).some(i => i.id === id)),
    menus: menus.filter(m => usaItems(m.comidas)),
    dias: diario.filter(d => usaItems(d.comidas)).length
  };
}

/* ---------- objetivo ---------- */
const KCAL_G = { prot: 4, hid: 4, gra: 9 };
/* Cada macro va en % de las kcal o en g por kg de peso. Los que van en g/kg
   son fijos; las kcal que sobran se reparten entre los que van en %, en
   proporción a sus porcentajes. */
export function objetivoGramos(obj, pesoKg) {
  const kcal = num(obj.kcal), out = { kcal, fib: num(obj.fibra), avisos: [] };
  const fijos = ["prot", "hid", "gra"].filter(k => obj[k] && obj[k].modo === "gkg");
  const pcts = ["prot", "hid", "gra"].filter(k => !fijos.includes(k));
  if (fijos.length && !(pesoKg > 0)) out.avisos.push("Falta tu peso para calcular los g/kg.");
  let kcalFijas = 0;
  fijos.forEach(k => { out[k] = num(obj[k].valor) * (pesoKg || 0); kcalFijas += out[k] * KCAL_G[k]; });
  const sumaPct = pcts.reduce((s, k) => s + num(obj[k].valor), 0);
  const resto = kcal - kcalFijas;
  if (pcts.length) {
    if (resto < 0) out.avisos.push(`Los macros en g/kg ya suman ${Math.round(kcalFijas)} kcal, más que el objetivo.`);
    pcts.forEach(k => { out[k] = sumaPct > 0 ? Math.max(0, resto) * num(obj[k].valor) / sumaPct / KCAL_G[k] : 0; });
    if (!fijos.length && Math.abs(sumaPct - 100) > 0.5) out.avisos.push(`Los porcentajes suman ${Math.round(sumaPct * 10) / 10} %, no 100 %. Se reparten en proporción.`);
  } else if (Math.abs(kcalFijas - kcal) > 20) {
    out.avisos.push(`Con todo en g/kg salen ${Math.round(kcalFijas)} kcal, no las ${Math.round(kcal)} del objetivo.`);
  }
  out.pct = {}; ["prot", "hid", "gra"].forEach(k => out.pct[k] = kcal > 0 ? out[k] * KCAL_G[k] / kcal * 100 : 0);
  out.gkg = {}; ["prot", "hid", "gra"].forEach(k => out.gkg[k] = pesoKg > 0 ? out[k] / pesoKg : null);
  return out;
}

/* ---------- completar el objetivo ---------- */
/* Historial de porciones: cuánto sueles poner de cada alimento y en qué comidas */
export function historialPorciones(diario, desdeISO) {
  const h = {};
  diario.forEach(d => {
    if (desdeISO && d.fecha < desdeISO) return;
    COMIDAS.forEach(m => ((d.comidas || {})[m.k] || []).forEach(it => {
      if (it.libre || !(num(it.g) > 0)) return;
      const x = h[it.id] = h[it.id] || { n: 0, valores: [], comidas: {} };
      x.n++; x.valores.push(num(it.g)); x.comidas[m.k] = (x.comidas[m.k] || 0) + 1;
    }));
  });
  return h;
}
const redondear = (v, paso) => Math.max(paso, Math.round(v / paso) * paso);
/* Cantidades realistas para un alimento, según cómo lo sueles comer */
export function cantidadesPosibles(a, hist) {
  const paso = unidad(a) === "ml" ? 10 : 5;
  const racion = esPlato(a) && num(a.pesoTotal) > 0 ? num(a.pesoTotal) / (num(a.raciones) || 1) : 0;
  if (hist && hist.valores.length) {
    const v = hist.valores.slice().sort((x, y) => x - y);
    const min = v[0], max = v[v.length - 1];
    if (max - min <= 1) return [min, min * 2].map(x => Math.round(x * 10) / 10);   // va por unidades: 1 o 2
    const lo = redondear(min * 0.75, paso), hi = redondear(max * 1.25, paso);
    const salto = Math.max(paso, redondear((hi - lo) / 16, paso));
    const out = []; for (let g = lo; g <= hi + 0.01; g += salto) out.push(g);
    return out;
  }
  if (racion) return [racion * 0.5, racion, racion * 1.5].map(x => Math.round(x));
  return [30, 50, 75, 100, 125, 150, 200];
}
/* Busca cómo cerrar lo que falta del día con 1 o 2 alimentos en cantidades
   que sueles comer. hueco = lo que falta (kcal, prot, hid, gra), obj = objetivo
   en gramos. Devuelve las mejores opciones ordenadas. */
export function completarObjetivo({ hueco, obj, alimentos, hist, comida, foco = null, incluirTodos = false, max = 5 }) {
  const W = { kcal: 1, prot: 1.5, hid: 1, gra: 1 };
  if (foco) W[foco] *= 3;
  const ks = ["kcal", "prot", "hid", "gra"];
  const T = { kcal: Math.max(1, obj.kcal), prot: Math.max(1, obj.prot), hid: Math.max(1, obj.hid), gra: Math.max(1, obj.gra) };
  const costeDe = add => ks.reduce((s, k) => {
    const r = (hueco[k] - add[k]) / T[k];
    return s + W[k] * (r >= 0 ? r * r : 4 * r * r);   // pasarse cuenta 4 veces más que quedarse corto
  }, 0);
  const base = costeDe({ kcal: 0, prot: 0, hid: 0, gra: 0 });
  const habituales = alimentos.filter(a => !a.archivado && hist[a.id]);
  const lista = (incluirTodos || habituales.length < 8 ? alimentos.filter(a => !a.archivado) : habituales)
    // Grasas puras (aceite, mantequilla…) no se proponen: nadie se toma 14 ml de aceite para cenar
    .filter(a => num(a.kcal) > 0 && !(num(a.gra) >= 70 || /^(aceite|margarina|mantequilla)/i.test(a.nombre)));
  // Afinidad con la comida elegida: lo que sueles tomar en esa comida sale antes
  const afinidad = a => { const h = hist[a.id]; return h && comida ? (h.comidas[comida] || 0) / h.n : 0; };
  // Lo que nunca tomas en esa comida (el aceite en la cena, la pasta en el
  // desayuno) penaliza; lo que sueles tomar en ella, puntúa mejor.
  const factorCoste = a => {
    const h = hist[a.id];
    if (!h) return 1.3;
    if (comida && !h.comidas[comida]) return 1.35;
    return 1 - 0.35 * afinidad(a);
  };

  const opciones = lista.map(a => ({ a, cants: cantidadesPosibles(a, hist[a.id]), m100: macrosDe(a, 100) }));
  const singles = [];
  opciones.forEach(o => {
    let mejor = null;
    o.cants.forEach(g => {
      const add = escalar(o.m100, g / 100);
      const c = costeDe(add) * factorCoste(o.a);
      if (!mejor || c < mejor.c) mejor = { c, items: [{ a: o.a, g }], add };
    });
    if (mejor) singles.push(mejor);
  });
  singles.sort((x, y) => x.c - y.c);
  const top = singles.slice(0, 30).map(s => opciones.find(o => o.a === s.items[0].a));
  const pares = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    const A = top[i], B = top[j];
    let mejor = null;
    A.cants.forEach(ga => B.cants.forEach(gb => {
      const add = sumar(escalar(A.m100, ga / 100), escalar(B.m100, gb / 100));
      const c = costeDe(add) * (factorCoste(A.a) + factorCoste(B.a)) / 2 + base * 0.04;   // un poco de preferencia por lo simple
      if (!mejor || c < mejor.c) mejor = { c, items: [{ a: A.a, g: ga }, { a: B.a, g: gb }], add };
    }));
    if (mejor) pares.push(mejor);
  }
  const todas = singles.concat(pares).filter(o => o.c < base * 0.92).sort((x, y) => x.c - y.c);
  const vistos = new Set(), out = [];
  for (const o of todas) {
    const clave = o.items.map(i => i.a.id).sort().join("|");
    if (vistos.has(clave)) continue;
    vistos.add(clave); out.push({ ...o, mejora: 1 - o.c / base, queda: Object.fromEntries(ks.map(k => [k, hueco[k] - o.add[k]])) });
    if (out.length >= max) break;
  }
  return out;
}

/* ---------- lista de la compra ---------- */
/* Descompone un alimento en productos base (en crudo); el aceite de freír incluido */
export function expandir(id, gramos, mapa, alimentos, acc, prof = 0) {
  if (prof > 8) return;
  const a = mapa[id];
  if (!a || !(gramos > 0)) return;
  if (!esPlato(a)) { acc[a.id] = (acc[a.id] || 0) + gramos; return; }
  const r = calcularPlato(a, mapa, alimentos);
  const peso = r.peso > 0 ? r.peso : (a.ingredientes || []).reduce((s, i) => s + num(i.g), 0);
  if (!(peso > 0)) return;
  const f = gramos / peso;
  (a.ingredientes || []).forEach(i => expandir(i.id, num(i.g) * f, mapa, alimentos, acc, prof + 1));
  if (r.aceite && r.aceiteCant > 0) acc[r.aceite.id] = (acc[r.aceite.id] || 0) + r.aceiteCant * f;
}
export function calcularCompra(compra, alimentos, menus) {
  const mapa = porId(alimentos), acc = {};
  (compra.items || []).forEach(it => {
    const cant = num(it.cant); if (!(cant > 0)) return;
    if (it.tipo === "plato") {
      const p = mapa[it.id]; if (!esPlato(p)) return;
      const r = calcularPlato(p, mapa, alimentos);
      expandir(p.id, r.peso * cant / r.raciones, mapa, alimentos, acc);
    } else {
      const m = menus.find(x => x.id === it.id); if (!m) return;
      COMIDAS.forEach(c => ((m.comidas || {})[c.k] || []).forEach(i => { if (!i.libre) expandir(i.id, num(i.g) * cant, mapa, alimentos, acc); }));
    }
  });
  const porSuper = {};
  Object.entries(acc).forEach(([id, g]) => {
    const a = mapa[id]; if (!a) return;
    (porSuper[a.super || "generico"] = porSuper[a.super || "generico"] || []).push({ a, g });
  });
  Object.values(porSuper).forEach(l => l.sort((x, y) => x.a.nombre.localeCompare(y.a.nombre, "es")));
  return porSuper;
}

/* ---------- etiquetas ---------- */
const numES = s => { s = String(s).trim(); if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, "")); return parseFloat(s.replace(",", ".")); };
function trasClave(t, re) {
  const m = re.exec(t); if (!m) return null;
  const resto = t.slice(m.index + m[0].length, m.index + m[0].length + 90);
  const mn = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)/.exec(resto); if (!mn) return null;
  return { v: numES(mn[1]), dudoso: /cuales|saturad|az[uú]car|polialcohol|mono|poliinsat/.test(resto.slice(0, mn.index)) };
}
/* Lee el texto de una tabla nutricional (por 100 g). Marca lo dudoso. */
export function analizarEtiqueta(txt) {
  const t = String(txt || "").toLowerCase().replace(/\s+/g, " ");
  const r = {};
  const kcal = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*kcal/.exec(t);
  if (kcal) r.kcal = { v: numES(kcal[1]), dudoso: false };
  else { const kj = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*kj/.exec(t); if (kj) r.kcal = { v: Math.round(numES(kj[1]) / 4.184 * 10) / 10, dudoso: true }; }
  r.gra = trasClave(t, /grasas?/);
  r.hid = trasClave(t, /hidratos de carbono|carbohidratos/);
  r.fib = trasClave(t, /fibra/);
  r.prot = trasClave(t, /prote[ií]nas?/);
  return r;
}

/* ---------- nombres parecidos ---------- */
export const clave = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function distancia(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
export function parecidos(nombre, alimentos, excluirId) {
  const k = clave(nombre); if (!k) return [];
  return alimentos.filter(a => {
    if (a.id === excluirId || a.archivado) return false;
    const ka = clave(a.nombre);
    return ka === k || distancia(ka, k) <= 2 || (ka.length > 4 && k.length > 4 && (ka.includes(k) || k.includes(ka)));
  });
}

/* ---------- alimentos base ---------- */
/* Productos de BASE que aún no se han visto nunca (o todos si «reponer»).
   No duplica: si ya tienes uno con el mismo código o nombre, se salta. */
export function baseNuevos(alimentos, vistos, reponer, crearId) {
  const visto = new Set(reponer ? [] : (vistos || []));
  const nuevos = [];
  BASE.forEach(([codigo, nombre, sup, uni, kcal, gra, hid, fib, prot, precio, factor]) => {
    if (visto.has(codigo)) return;
    visto.add(codigo);
    if (alimentos.some(a => !esPlato(a) && !a.archivado && (a.codigo === codigo || clave(a.nombre) === clave(nombre)))) return;
    const archivado = alimentos.find(a => !esPlato(a) && a.archivado && a.codigo === codigo);
    if (archivado) { nuevos.push({ ...archivado, archivado: false }); return; }
    // Id fijo por código: si el móvil y el ordenador añaden a la vez el mismo
    // alimento base, escriben el mismo documento en vez de crear dos.
    nuevos.push({ id: alimentos.some(a => a.id === `base-${codigo}`) ? crearId() : `base-${codigo}`, tipo: "basico", codigo, nombre, super: sup, unidad: uni, kcal, gra, hid, fib, prot, precio, factor });
  });
  return { nuevos, vistos: [...new Set([...(vistos || []), ...visto])] };
}
