/* V.I.T.A. — modelo de datos y valores por defecto.
   Todo lo que aquí se define es la "fuente de verdad" de nombres y unidades.
   Unidades: peso en kg, altura en cm, energía en kcal, gramos en g o ml según
   el alimento, fechas AAAA-MM-DD en hora local. La semana empieza en lunes. */

export const APP_VERSION = "0.2.4";
export const SCHEMA_VERSION = 1;

/* Grupos musculares. Cada rango semanal es solo «desde–hasta» (series), fijado
   por Iván según su experiencia. Los valores de partida de los grupos que ya
   existían son los de GYM-TRACKER; los grupos nuevos quedan sin rango (null)
   hasta que los rellene en Ajustes. */
export const GRUPOS = [
  "Pecho", "Dorsal", "Espalda media",
  "Hombro anterior", "Hombro lateral", "Hombro posterior",
  "Bíceps", "Tríceps", "Antebrazo",
  "Cuádriceps", "Femoral/Glúteo", "Gemelos", "Core"
];

export const RANGOS_POR_DEFECTO = {
  "Pecho":          { min: 12, max: 20 },
  "Dorsal":         null,
  "Espalda media":  null,
  "Hombro anterior": null,
  "Hombro lateral": null,
  "Hombro posterior": null,
  "Bíceps":         { min: 14, max: 20 },
  "Tríceps":        { min: 10, max: 14 },
  "Antebrazo":      { min: 8, max: 12 },
  "Cuádriceps":     { min: 12, max: 18 },
  "Femoral/Glúteo": { min: 10, max: 16 },
  "Gemelos":        { min: 12, max: 16 },
  "Core":           { min: 8, max: 16 }
};

/* Reparto de grupos para los ejercicios que cambian con los grupos nuevos.
   El valor es cuánto cuenta cada serie en ese grupo: el superset
   lateral-frontal hace las dos elevaciones en cada repetición, así que cuenta
   entero en los dos. Los ejercicios que no aparecen aquí conservan su grupo. */
export const REPARTO_EJERCICIOS = {
  "Elevaciones laterales con polea":       { "Hombro lateral": 1 },
  "Elevaciones laterales mancuernas":      { "Hombro lateral": 1 },
  "Elevaciones lateral-frontal superset":  { "Hombro lateral": 1, "Hombro anterior": 1 },
  "Press militar en máquina":              { "Hombro anterior": 1 },
  "Rear delt":                             { "Hombro posterior": 1 },
  "Face pull polea":                       { "Hombro posterior": 1 },
  "Jalón al pecho":                        { "Dorsal": 1 },
  "Pull over en polea":                    { "Dorsal": 1 },
  "Remo Dorian unilateral en máquina":     { "Dorsal": 1 },
  "Remo T en máquina":                     { "Espalda media": 1 },
  "Remo gironda":                          { "Espalda media": 1 },
  "Remo divergente agarre neutro":         { "Espalda media": 1 }
};

/* Grupos de un ejercicio a partir de su nombre y su grupo antiguo. */
export function gruposDe(nombre, grupoAntiguo) {
  if (REPARTO_EJERCICIOS[nombre]) return { ...REPARTO_EJERCICIOS[nombre] };
  if (grupoAntiguo === "Hombro") return { "Hombro lateral": 1 };   // por si aparece uno no previsto
  if (grupoAntiguo === "Espalda") return { "Espalda media": 1 };
  return { [grupoAntiguo]: 1 };
}

export const COMIDAS = [
  { k: "desayuno", n: "Desayuno" },
  { k: "almuerzo", n: "Almuerzo" },
  { k: "comida",   n: "Comida" },
  { k: "merienda", n: "Merienda" },
  { k: "cena",     n: "Cena" }
];

export const SUPERS = ["generico", "mercadona", "dia", "lidl", "carrefour", "aldi", "decathlon", "hsn"];

export const CRITERIOS_POR_DEFECTO = [
  "Barra: se apunta el peso TOTAL (barra + discos).",
  "Mancuernas: se apunta el peso de UNA mancuerna.",
  "Unilateral: peso y series por lado (3 series = 3 por cada lado).",
  "Todas las series a RIR 1-2."
];

/* Ajustes iniciales. Los que vienen de las copias se sobrescriben al importar. */
export function ajustesPorDefecto() {
  return {
    schema: SCHEMA_VERSION,
    perfil: {
      // Los datos personales no van en el código (el repositorio es público):
      // llegan con la importación y se completan en Ajustes.
      sexo: null,                  // "hombre" | "mujer": texto explícito, evita el choque de códigos h/m/f
      nacimiento: null,            // AAAA-MM-DD
      altura: null,                // cm
      pesoReferencia: null,        // kg, se usa hasta tener 4 pesajes
      pesajesMinimos: 4,
      pesajesMedia: 7
    },
    objetivo: {
      kcal: 2400,
      prot: { modo: "pct", valor: 22 },   // modo: "pct" (% de kcal) o "gkg" (g por kg)
      hid:  { modo: "pct", valor: 54 },
      gra:  { modo: "pct", valor: 24 },
      fibra: 25,
      reparto: { desayuno: 17, almuerzo: 14, comida: 35, merienda: 9, cena: 25 }
    },
    entreno: {
      segundosSerie: 60,
      descansoMin: 2,
      sonido: true,
      criterios: CRITERIOS_POR_DEFECTO.slice(),
      rangos: JSON.parse(JSON.stringify(RANGOS_POR_DEFECTO))
    },
    actividad: { pasosObjetivo: 8000 },
    gasto: {
      digestionPct: 10,            // efecto térmico de los alimentos, aprox. 10 % de lo comido
      factorCalibracion: 1         // lo ajustará la calibración con el peso real
    },
    app: {
      tema: "oscuro",
      semanaEmpieza: "lunes",
      recordatorioCopiaDias: 15,
      ultimaCopia: null,
      baseVistos: []
    }
  };
}

/* Utilidades de fecha (hora local) */
const pad = n => String(n).padStart(2, "0");
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoyISO = () => toISO(new Date());
export function edadEn(nacimientoISO, fechaISO = hoyISO()) {
  if (!nacimientoISO) return null;
  const [y, m, d] = nacimientoISO.split("-").map(Number);
  const [Y, M, D] = fechaISO.split("-").map(Number);
  return Y - y - ((M < m || (M === m && D < d)) ? 1 : 0);
}
