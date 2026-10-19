/* Colecciones de Firestore y el campo que hace de identificador en cada una. */
export const COLECCIONES = ["ejercicios", "sesiones", "dias", "alimentos", "menus", "diario", "planes"];
export const CLAVE = { ejercicios: "id", sesiones: "fecha", dias: "fecha", alimentos: "id", menus: "id", diario: "fecha", planes: "id" };
/* Colecciones nuevas: si su escucha falla (por ejemplo, reglas antiguas), la app sigue funcionando sin ellas */
export const OPCIONALES = new Set(["planes"]);
