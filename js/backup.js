/* V.I.T.A. — copia de seguridad única (entreno + comida + actividad).
   El archivo es autodescriptivo: lleva su propia documentación de campos,
   unidades y reglas, para restaurar la app o analizarlo con un script
   (por ejemplo, el entrenador IA) sin conocer la app. */

import { APP_VERSION, SCHEMA_VERSION, hoyISO } from "./model.js";

export const FORMATO_COPIA = 1;

export const DOCUMENTACION = {
  lee_esto: [
    "Copia completa de V.I.T.A., la app de Iván que une entreno, comida y actividad. Todo el contenido está en 'datos'.",
    "Fechas en AAAA-MM-DD, hora local de España. La semana empieza en lunes.",
    "Un día o una fecha ausente significa 'sin registrar', nunca cero."
  ],
  unidades: {
    peso: "kilogramos (kg)", altura: "centímetros (cm)", energia: "kilocalorías (kcal)",
    distancia: "km", velocidad: "km/h", inclinacion: "% de pendiente, no grados", potencia: "vatios (W)",
    duracion: "minutos", macros: "gramos", precio: "euros por kg, o por litro si la unidad del alimento es ml"
  },
  reglas_de_registro_entreno: {
    barra: "Con barra, el peso es el TOTAL: barra + discos.",
    mancuernas: "Con mancuernas, el peso es el de UNA mancuerna.",
    unilateral: "En ejercicios unilaterales, peso y series son por lado: 3 series = 3 por cada lado.",
    rir: "Las series se hacen a RIR 1-2.",
    grupos: "Cada ejercicio reparte sus series entre grupos con un peso: {grupo: 1} cuenta la serie entera en ese grupo. El superset lateral-frontal cuenta entero en hombro lateral y en hombro anterior porque cada repetición hace las dos elevaciones.",
    series_vacias: "Una serie con peso o reps a null no se hizo (puede ser una sesión copiada aún sin rellenar). sugPeso y sugReps son la marca a batir que se mostraba en gris, no datos realizados."
  },
  reglas_de_comida: {
    valores_por_100: "Los valores de un alimento van por 100 g o 100 ml según su campo 'unidad'.",
    regla_g: "El campo 'g' de un item está en el mismo estado al que se refieren los valores por 100 de ese alimento: crudo en carne, arroz o pasta; tal cual en conservas y fiambres; plato ya terminado en los de tipo 'plato'. Macro = valor_por_100 * g / 100. No conviertas nada.",
    factor: "factor = peso cocinado / peso crudo. Solo sirve para convertir al apuntar y para estimar el peso de un plato. 0 = sin dato o no aplica.",
    libre: "Items con libre=true son comidas fuera estimadas a ojo: sus valores son TOTALES, no por 100. 'precio' es lo que costó (0 = no apuntado).",
    fritura: "En un plato, un ingrediente con 'frito' (número) se frió: absorbe ese % de su peso crudo en aceite (estimación: 8 % frito, 15 % rebozado). El aceite es el alimento 'aceiteId' del plato (o el AOVE de la base) y ya está sumado en los valores del plato; densidad usada 0,91 g/ml.",
    archivado: "Un alimento con archivado=true se borró del catálogo pero se conserva porque lo usan días, menús o platos antiguos."
  },
  secciones: {
    ajustes: "Perfil (sexo, nacimiento, altura, peso de referencia), objetivo diario de macros, preferencias de entreno, rangos de volumen, preferencias de la app.",
    ejercicios: "Catálogo de ejercicios: id, nombre, grupos {grupo: peso}, unilateral.",
    planes: "Semanas planificadas (sin fechas): id, nombre, dias[7] de lunes a domingo { nombre, ejercicios[] { ejercicioId, series } }. Los grupos de cada ejercicio están en el catálogo. El plan activo es ajustes.entreno.planActivo.",
    sesiones: "Una por fecha. ejercicios[]: ejercicioId, nombre y grupos tal como estaban, unilateral, series[] {peso, reps, sugPeso?, sugReps?}. copiadaDe = fecha de la sesión copiada; plan = {id, nombre, dia (0 = lunes), sesion} si se aplicó un día de un plan (sugPeso/sugReps = lo hecho la última vez).",
    dias: "Por fecha: pasos (+ pasosFuente: 'manual' o 'health-connect'), peso (pesaje de ese día, solo si se pesó), cardio[] (tipo 'cinta' = andar en cinta y 'carrera' = correr en cinta: min, velocidad, inclinacion, km, pasosReloj, llevaba; si falta la velocidad, es km/tiempo; 'bici': min, vatios, intensidad) y sueno { min dormido sin ratos despierto, inicio y fin (ISO, sesión principal), fases { profundo, ligero, rem, despierto } en min si las hay, sesiones, fuente }. sincronizado = última escritura de la app compañera.",
    sueno: "Cada noche va en el día en que te despiertas. Objetivo por defecto 7 h (AASM / Sleep Research Society, adultos). Lo puesto a mano (fuente 'manual') no lo sobrescribe la sincronización con Health Connect.",
    alimentos: "Catálogo de productos y platos. Productos: codigo (si viene de la hoja de Drive), nombre, super, unidad, kcal/prot/hid/gra/fib por 100, precio, factor. Platos: ingredientes [{id, g en crudo, frito?}], aceiteId?, pesoFinal (pesado a mano, 0 = estimado), pesoTotal (el que se usa), raciones; sus kcal/prot/hid/gra/fib son por 100 g del plato terminado.",
    menus: "Plantillas reutilizables (no significan que se hayan comido).",
    diario: "Lo que se comió cada día: comidas {desayuno, almuerzo, comida, merienda, cena} con items {id, g} o items libres.",
    compra: "Lista de la compra en curso."
  },
  formulas: {
    basal: "Mifflin-St Jeor: 10·peso + 6,25·altura − 5·edad + 5 (hombre) o −161 (mujer).",
    actividad: "ACSM: kcal/min = (MET − 1) · 3,5 · peso / 200 (se descuenta el reposo, que ya va en el basal).",
    pasos: "Zancada = altura · 0,415; ritmo 4,5 km/h; 3,5 MET.",
    entrenamiento: "Series a 6 MET durante segundosSerie y descansos a 1,5 MET durante descansoMin; las unilaterales cuentan doble.",
    digestion: "Efecto térmico de los alimentos: aproximadamente un 10 % de las kcal comidas.",
    cardio: "Andar en cinta (ACSM): VO2 = 0,1·v + 1,8·v·pendiente (si pasa de 8 km/h, la de correr); correr en cinta: VO2 = 0,2·v + 0,9·v·pendiente; v en m/min. Pasos de una carrera con reloj sin apuntar: minutos × 160 (cadencia aproximada); bici: VO2 = 1,8·W·6,12/peso + 3,5; kcal = VO2·peso·min/1000·5. Bici sin vatios: 5,5/6,8/8,8 MET. Los pasos de la cinta con reloj se descuentan de los del día.",
    peso_de_calculo: "Media de los últimos 7 pesajes de los 30 días anteriores; con menos de 4, el peso de referencia del perfil.",
    calibracion: "Si en 4 semanas hay 6 pesajes en 21+ días y 14 días con la comida completa (al menos la mitad del objetivo): gasto real = comida media − pendiente del peso (kg/día) · 7.700; factor = real / estimado, limitado a ±25 %.",
    objetivo_sugerido: "Media del gasto (calibrado si se puede) de los últimos 7 días con actividad + ajuste del usuario. Nunca se aplica sin aceptarlo.",
    rm1: "1RM estimado (Epley) = peso · (1 + reps/30), solo hasta 12 repeticiones."
  }
};

export function crearCopia(S) {
  return {
    app: "vita",
    version_app: APP_VERSION,
    esquema: SCHEMA_VERSION,
    formato: FORMATO_COPIA,
    exportado: new Date().toISOString(),
    documentacion: DOCUMENTACION,
    datos: {
      ajustes: S.ajustes,
      ejercicios: S.ejercicios,
      sesiones: S.sesiones.slice().sort((a, b) => a.fecha < b.fecha ? -1 : 1),
      dias: S.dias.slice().sort((a, b) => a.fecha < b.fecha ? -1 : 1),
      alimentos: S.alimentos,
      menus: S.menus,
      diario: S.diario.slice().sort((a, b) => a.fecha < b.fecha ? -1 : 1),
      planes: S.planes || [],
      compra: S.compra
    }
  };
}

export function esCopiaVita(j) { return !!(j && j.app === "vita" && j.datos && j.datos.ajustes); }

export function descargar(json, nombre = `vita-copia-${hoyISO()}.json`) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
