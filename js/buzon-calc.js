/* V.I.T.A. — buzón de entrada (sin pantalla: se prueba con node).
   Claude escribe filas en la hoja «V.I.T.A. buzón» de Drive; V.I.T.A. las lee,
   las valida y te las enseña para que aceptes o descartes cada una. Nada se
   guarda sin tu aceptación y nada se sustituye sin decirlo.

   Columnas: A id · B escrito (ISO) · C tipo · D datos (JSON) · E nota · F estado · G detalle
   Tipos y datos:
   - pesaje:  { fecha, peso?, grasaPct?, musculoKg? }
   - medidas: { fecha, medidas: { cintura: 80, brazoD: 34.5, … } }  (cm)
   - comida:  { fecha, comida: desayuno|almuerzo|comida|merienda|cena, modo?: "anadir"|"sustituir",
                items: [ { id, g } | { libre: true, nombre, kcal, prot?, hid?, gra?, fib? } ] }
   - menu:    { nombre, comidas: { desayuno: [items], … } } */

import { COMIDAS } from "./model.js";
import * as A from "./actividad-calc.js";
import * as K from "./comida-calc.js";

export const CABECERA = ["id", "escrito", "tipo", "datos (JSON)", "nota", "estado", "detalle"];
export const TIPOS = { pesaje: "Pesaje", medidas: "Medidas", comida: "Comida del diario", menu: "Menú" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const n = v => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : null; };
const r1 = v => Math.round(v * 10) / 10;
const f1 = v => r1(v).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const nombreComida = k => (COMIDAS.find(m => m.k === k) || {}).n || k;

/* Filas de la hoja (sin la cabecera) → entradas. fila = número de fila en la hoja (2, 3, …) */
export function leerFilas(valores) {
  return (valores || []).map((v, i) => ({ fila: i + 2, id: String(v[0] ?? "").trim(), escrito: String(v[1] ?? ""), tipo: String(v[2] ?? "").trim().toLowerCase(),
    datosTxt: String(v[3] ?? ""), nota: String(v[4] ?? ""), estado: String(v[5] ?? "").trim(), detalle: String(v[6] ?? "") }))
    .filter(e => e.tipo || e.datosTxt);
}
export const pendientes = entradas => entradas.filter(e => !e.estado);

/* Valida una entrada frente a los datos actuales. Devuelve
   { ok, error?, titulo, lineas[], avisos[], cambios } — «cambios» es lo que se guardará. */
export function validar(e, S) {
  const base = { titulo: TIPOS[e.tipo] || `Tipo «${e.tipo}»`, lineas: [], avisos: [] };
  const mal = error => ({ ...base, ok: false, error });
  let d;
  try { d = JSON.parse(e.datosTxt); } catch { return mal("Los datos no son un JSON válido."); }
  if (!d || typeof d !== "object") return mal("Faltan los datos.");
  if (!TIPOS[e.tipo]) return mal("Tipo desconocido (válidos: pesaje, medidas, comida, menu).");

  if (e.tipo === "pesaje" || e.tipo === "medidas" || e.tipo === "comida") {
    if (!FECHA.test(d.fecha || "")) return mal("Falta la fecha (AAAA-MM-DD).");
    if (S.hoy && d.fecha > S.hoy) return mal("La fecha es futura.");
    base.titulo += ` · ${d.fecha}`;
  }
  const dia = S.dias.find(x => x.fecha === d.fecha) || {};

  if (e.tipo === "pesaje") {
    const campos = {};
    const lim = { peso: [30, 250], grasaPct: A.LIMITES_COMPOSICION.grasaPct, musculoKg: A.LIMITES_COMPOSICION.musculoKg };
    const nom = { peso: "Peso", grasaPct: "Grasa", musculoKg: "Masa muscular" }, u = { peso: "kg", grasaPct: "%", musculoKg: "kg" };
    for (const k of ["peso", "grasaPct", "musculoKg"]) {
      if (d[k] == null) continue;
      const v = n(d[k]); if (v == null || v < lim[k][0] || v > lim[k][1]) return mal(`${nom[k]} fuera de rango (${lim[k][0]}–${lim[k][1]} ${u[k]}).`);
      campos[k] = r1(v);
      base.lineas.push(`${nom[k]}: ${f1(v)} ${u[k]}${dia[k] ? ` (ahora ${f1(dia[k])} — se sustituye)` : ""}`);
      if (dia[k] && dia[k] !== campos[k]) base.avisos.push(`Sustituye ${nom[k].toLowerCase()} ${f1(dia[k])} → ${f1(v)}.`);
    }
    if (!Object.keys(campos).length) return mal("No trae peso, grasa ni masa muscular.");
    const peso = campos.peso || dia.peso;
    if (campos.musculoKg && peso && campos.musculoKg >= peso) return mal("La masa muscular no puede ser mayor que el peso.");
    return { ...base, ok: true, cambios: { col: "dias", id: d.fecha, campos: { fecha: d.fecha, ...campos } } };
  }

  if (e.tipo === "medidas") {
    const m = d.medidas; if (!m || typeof m !== "object") return mal("Faltan las medidas.");
    const nuevo = { ...(dia.medidas || {}) };
    for (const [c, val] of Object.entries(m)) {
      const def = A.medidaDe(c); if (!def) return mal(`Medida desconocida «${c}».`);
      const v = n(val); if (v == null || v < def.rango[0] || v > def.rango[1]) return mal(`${def.n}: fuera de rango (${def.rango[0]}–${def.rango[1]} cm).`);
      const lado = def.par ? (c.endsWith("D") ? " derecho" : " izquierdo") : "";
      base.lineas.push(`${def.n}${lado}: ${f1(v)} cm${nuevo[c] ? ` (ahora ${f1(nuevo[c])} — se sustituye)` : ""}`);
      nuevo[c] = r1(v);
    }
    if (!Object.keys(m).length) return mal("No trae ninguna medida.");
    return { ...base, ok: true, cambios: { col: "dias", id: d.fecha, campos: { fecha: d.fecha, medidas: nuevo } } };
  }

  // items de comida (diario o menú)
  const mapa = K.porId(S.alimentos);
  const items = (lista, donde) => {
    if (!Array.isArray(lista) || !lista.length) return { error: `${donde}: sin alimentos.` };
    const out = [];
    for (const it of lista) {
      if (it && it.libre) {
        const kcal = n(it.kcal); if (kcal == null || kcal < 0 || kcal > 5000) return { error: `${donde}: «${it.nombre || "comida fuera"}» necesita kcal (0–5000).` };
        const x = { libre: true, nombre: String(it.nombre || "Comida fuera").slice(0, 60), kcal };
        ["prot", "hid", "gra", "fib"].forEach(k => { const v = n(it[k]); x[k] = v != null && v >= 0 ? v : 0; });
        x.precio = 0; out.push(x); continue;
      }
      const a = it && mapa[it.id];
      if (!a) return { error: `${donde}: el alimento «${it && it.id}» no existe.` };
      if (a.archivado) return { error: `${donde}: «${a.nombre}» está borrado del catálogo.` };
      const g = n(it.g); if (g == null || g <= 0 || g > 5000) return { error: `${donde}: cantidad no válida para «${a.nombre}».` };
      out.push({ id: a.id, g: Math.round(g) });
    }
    return { items: out };
  };
  const desc = l => l.map(it => it.libre ? `${it.nombre} (fuera, ${Math.round(it.kcal)} kcal)` : `${mapa[it.id].nombre} ${it.g} ${K.unidad(mapa[it.id])}${K.factorDe(mapa[it.id]) ? " crudo" : ""}`).join(", ");
  const tot = comidas => K.totalComidas(comidas, mapa);

  if (e.tipo === "comida") {
    if (!COMIDAS.some(m => m.k === d.comida)) return mal(`Comida no válida (${COMIDAS.map(m => m.k).join(", ")}).`);
    const modo = d.modo === "sustituir" ? "sustituir" : "anadir";
    const r = items(d.items, nombreComida(d.comida)); if (r.error) return mal(r.error);
    const di = S.diario.find(x => x.fecha === d.fecha);
    const comidas = Object.fromEntries(COMIDAS.map(m => [m.k, ((di && di.comidas && di.comidas[m.k]) || []).map(x => ({ ...x }))]));
    const antes = comidas[d.comida].length;
    comidas[d.comida] = modo === "sustituir" ? r.items : [...comidas[d.comida], ...r.items];
    const t = tot({ [d.comida]: r.items });
    base.titulo += ` · ${nombreComida(d.comida)}`;
    base.lineas.push(desc(r.items), `${Math.round(t.kcal)} kcal · P ${f1(t.prot)} · H ${f1(t.hid)} · G ${f1(t.gra)} g`);
    if (antes) base.avisos.push(modo === "sustituir" ? `Sustituye los ${antes} alimentos que ya hay en ${nombreComida(d.comida).toLowerCase()}.` : `Se añade a los ${antes} alimentos que ya hay en ${nombreComida(d.comida).toLowerCase()}.`);
    return { ...base, ok: true, cambios: { col: "diario", id: d.fecha, doc: { fecha: d.fecha, origen: (di && di.origen) || null, comidas } } };
  }

  // menu
  const nombre = String(d.nombre || "").trim().slice(0, 60); if (!nombre) return mal("El menú necesita nombre.");
  if (!d.comidas || typeof d.comidas !== "object") return mal("Faltan las comidas del menú.");
  const comidas = Object.fromEntries(COMIDAS.map(m => [m.k, []]));
  let alguno = false;
  for (const [k, lista] of Object.entries(d.comidas)) {
    if (!COMIDAS.some(m => m.k === k)) return mal(`Comida no válida «${k}».`);
    if (!lista || !lista.length) continue;
    const r = items(lista, nombreComida(k)); if (r.error) return mal(r.error);
    comidas[k] = r.items; alguno = true;
    base.lineas.push(`${nombreComida(k)}: ${desc(r.items)}`);
  }
  if (!alguno) return mal("El menú no tiene alimentos.");
  const t = tot(comidas);
  base.titulo += ` · «${nombre}»`;
  base.lineas.push(`Total: ${Math.round(t.kcal)} kcal · P ${f1(t.prot)} · H ${f1(t.hid)} · G ${f1(t.gra)} g`);
  if (S.menus.some(m => m.nombre.trim().toLowerCase() === nombre.toLowerCase())) base.avisos.push("Ya tienes un menú con ese nombre: se creará otro aparte.");
  return { ...base, ok: true, cambios: { col: "menus", nuevo: true, doc: { nombre, comidas } } };
}
