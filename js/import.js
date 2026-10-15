/* V.I.T.A. — importador de las copias de GYM-TRACKER (formato 2) y FitCoock (formato 2).
   Es una función pura: recibe los dos JSON y devuelve los documentos de V.I.T.A.
   sin tocar nada. La escritura en Firestore va aparte (db.js), así se puede
   probar con las copias reales sin conexión. */

import { gruposDe, ajustesPorDefecto, COMIDAS, SUPERS } from "./model.js";

const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const num0 = v => num(v) ?? 0;

/* ---------- GYM-TRACKER ---------- */
export function leerGym(copia, avisos) {
  if (!copia || copia.app !== "gym-tracker" || !(copia.formato >= 2) || !Array.isArray(copia.perfiles))
    throw new Error("El archivo de entreno no es una copia de GYM-TRACKER en formato 2.");

  // Solo el perfil de Iván: el activo o el que se llame así
  const perfil = copia.perfiles.find(p => p.nombre === "Iván")
    || copia.perfiles.find(p => p.id === copia.perfilActivo) || copia.perfiles[0];
  const otros = copia.perfiles.filter(p => p !== perfil);
  if (otros.length) avisos.push(`Perfiles no importados: ${otros.map(p => `${p.nombre} (${(p.sesiones || []).length} sesiones)`).join(", ")}.`);

  const ejercicios = (copia.catalogoEjercicios || []).map(e => ({
    id: e.id,
    nombre: e.nombre,
    grupos: gruposDe(e.nombre, e.grupoMuscular),
    unilateral: !!e.unilateral
  }));
  const porId = Object.fromEntries(ejercicios.map(e => [e.id, e]));

  const sesiones = (perfil.sesiones || []).map(s => ({
    fecha: s.fecha,
    ...(s.copiadaDe ? { copiadaDe: s.copiadaDe } : {}),
    ejercicios: (s.ejercicios || []).map(e => {
      const cat = porId[e.ejercicioId];
      return {
        ejercicioId: e.ejercicioId,
        nombre: e.nombre,
        // Los grupos nuevos se aplican también al historial, para que el
        // volumen semanal sea comparable entre semanas antiguas y nuevas.
        grupos: cat ? { ...cat.grupos } : gruposDe(e.nombre, e.grupoMuscular),
        unilateral: !!e.unilateral,
        series: (e.series || []).map(st => ({
          peso: num(st.peso),
          reps: num(st.repeticiones),
          ...(st.sugerenciaPeso != null ? { sugPeso: num(st.sugerenciaPeso) } : {}),
          ...(st.sugerenciaRepeticiones != null ? { sugReps: num(st.sugerenciaRepeticiones) } : {})
        }))
      };
    })
  }));

  // Días: pasos, pesaje y cardio juntos por fecha
  const dias = {};
  const dia = f => (dias[f] = dias[f] || { fecha: f });
  Object.entries(perfil.pasosDiarios || {}).forEach(([f, v]) => { if (num(v) > 0) dia(f).pasos = num(v); });
  Object.entries(perfil.pesoCorporal || {}).forEach(([f, v]) => { if (num(v) > 0) dia(f).peso = num(v); });
  Object.entries(perfil.cardio || {}).forEach(([f, lista]) => {
    const items = (lista || []).map((c, i) => c.tipo === "cinta" ? {
      id: `${f}-${i}`, tipo: "cinta", min: num(c.minutos), velocidad: num(c.velocidad),
      inclinacion: num(c.inclinacion), km: num(c.distancia), pasosReloj: num(c.pasosDelDispositivo),
      llevaba: c.llevabaDispositivo !== false
    } : {
      id: `${f}-${i}`, tipo: "bici", min: num(c.minutos), vatios: num(c.vatios),
      intensidad: c.intensidad || null
    });
    if (items.length) dia(f).cardio = items;
  });

  const dc = perfil.datosCorporales || {};
  return {
    ejercicios, sesiones, dias: Object.values(dias),
    ajustesParciales: {
      perfil: {
        sexo: dc.sexo === "mujer" ? "mujer" : (dc.sexo === "hombre" ? "hombre" : null),
        altura: num(dc.altura), pesoReferencia: num(dc.peso)
      },
      entreno: { segundosSerie: num(dc.segundosPorSerie) ?? 60, descansoMin: num(dc.minutosDescansoEntreSeries) ?? 2 },
      actividad: { pasosObjetivo: num(perfil.objetivoPasosDiarios) ?? 8000 }
    },
    origen: { app: "gym-tracker", version: copia.versionApp, exportado: copia.exportadoEl }
  };
}

/* ---------- FitCoock ---------- */
const limpiarItems = lista => (lista || []).map(it => {
  const o = { ...it };
  delete o.g_cocinado;                     // solo informativo en la copia
  if (!o.libre) o.g = num0(o.g);
  return o;
});
const limpiarComidas = c => Object.fromEntries(COMIDAS.map(m => [m.k, limpiarItems((c || {})[m.k])]));

export function leerFit(copia, avisos) {
  const d = copia && copia.datos;
  if (!copia || copia.app !== "FitCoock" || !d || !Array.isArray(d.alimentos))
    throw new Error("El archivo de comida no es una copia de FitCoock en formato 2.");

  let alimentos = d.alimentos.map(a => {
    const o = { ...a };
    ["kcal", "prot", "hid", "gra", "fib", "precio", "factor", "pesoFinal", "raciones", "pesoTotal"].forEach(k => {
      if (k in o) o[k] = num0(o[k]);
    });
    if (o.tipo !== "plato") {
      if (!SUPERS.includes(o.super)) o.super = "generico";
      if (o.unidad !== "ml") o.unidad = "g";
    }
    return o;
  });

  // Duplicados: un producto creado a mano idéntico a uno de la base (mismo
  // súper, unidad, precio y valores) se fusiona con el de la base.
  const firma = a => [a.super, a.unidad, a.precio, a.kcal, a.prot, a.hid, a.gra, a.fib].join("|");
  const base = alimentos.filter(a => a.tipo !== "plato" && a.codigo);
  const fusion = {};
  alimentos.forEach(a => {
    if (a.tipo === "plato" || a.codigo) return;
    const igual = base.find(b => firma(b) === firma(a));
    if (igual) { fusion[a.id] = igual.id; avisos.push(`Fusionado «${a.nombre}» con «${igual.nombre}» (eran el mismo producto).`); }
  });
  const rep = id => fusion[id] || id;
  alimentos = alimentos.filter(a => !fusion[a.id]).map(a => a.tipo === "plato"
    ? { ...a, ingredientes: (a.ingredientes || []).map(i => ({ id: rep(i.id), g: num0(i.g) })) }
    : a);
  const repItems = c => Object.fromEntries(Object.entries(c).map(([k, l]) => [k, l.map(it => it.libre ? it : { ...it, id: rep(it.id) })]));

  const menus = (d.menus || []).map(m => ({ id: m.id, nombre: m.nombre, comidas: repItems(limpiarComidas(m.comidas)) }));
  const diario = Object.entries(d.diario || {})
    .filter(([f]) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .map(([f, x]) => ({ fecha: f, origen: x.origen || null, comidas: repItems(limpiarComidas(x.comidas)) }));
  const compra = {
    items: ((d.compra && d.compra.items) || []).map(i => i.tipo === "plato" ? { ...i, id: rep(i.id) } : i),
    marcados: ((d.compra && d.compra.marcados) || []).map(rep)
  };

  const o = d.objetivo || {};
  const objetivo = {
    kcal: num(o.kcal) ?? 2400,
    prot: o.modoProt === "gkg" ? { modo: "gkg", valor: num(o.protGkg) ?? 2 } : { modo: "pct", valor: num(o.pProt) ?? 22 },
    hid: { modo: "pct", valor: num(o.pHid) ?? 54 },
    gra: { modo: "pct", valor: num(o.pGra) ?? 24 },
    fibra: num(o.fibra) ?? 25,
    reparto: Object.fromEntries(COMIDAS.map(m => [m.k, num((o.reparto || {})[m.k]) ?? 0]))
  };

  return {
    alimentos, menus, diario, compra,
    ajustesParciales: { objetivo, app: { baseVistos: ((d.meta || {}).baseVistos) || [] } },
    origen: { app: "FitCoock", version: copia.version_app, exportado: copia.exportado }
  };
}

/* ---------- Las dos juntas ---------- */
export function importarCopias({ gym, fit }) {
  const avisos = [];
  const g = gym ? leerGym(gym, avisos) : null;
  const f = fit ? leerFit(fit, avisos) : null;

  const ajustes = ajustesPorDefecto();
  if (g) {
    Object.assign(ajustes.perfil, g.ajustesParciales.perfil);
    Object.assign(ajustes.entreno, g.ajustesParciales.entreno);
    Object.assign(ajustes.actividad, g.ajustesParciales.actividad);
  }
  if (f) {
    ajustes.objetivo = f.ajustesParciales.objetivo;
    ajustes.app.baseVistos = f.ajustesParciales.app.baseVistos;
  }

  return {
    ajustes,
    ejercicios: g ? g.ejercicios : [],
    sesiones: g ? g.sesiones : [],
    dias: g ? g.dias : [],
    alimentos: f ? f.alimentos : [],
    menus: f ? f.menus : [],
    diario: f ? f.diario : [],
    compra: f ? f.compra : { items: [], marcados: [] },
    origen: [g && g.origen, f && f.origen].filter(Boolean),
    avisos
  };
}

/* ---------- Cálculos de comprobación (los usa también la app) ---------- */
export function volumenSesion(s) {
  return s.ejercicios.reduce((a, e) => a + e.series.reduce((t, st) => t + (st.peso || 0) * (st.reps || 0), 0), 0);
}
export function kcalDia(diaDoc, alimentosPorId) {
  let t = 0;
  Object.values(diaDoc.comidas).forEach(l => l.forEach(it => {
    if (it.libre) t += num0(it.kcal);
    else { const a = alimentosPorId[it.id]; if (a) t += a.kcal * it.g / 100; }
  }));
  return t;
}
