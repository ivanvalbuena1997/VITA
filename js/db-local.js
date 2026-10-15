/* Sustituto en memoria de db.js, SOLO para probar la interfaz en localhost
   con ?local. Misma API, sin red ni Firebase. No guarda nada. */
import { COLECCIONES, CLAVE } from "./db-claves.js";

const mem = { ajustes: null, compra: null, ...Object.fromEntries(COLECCIONES.map(c => [c, new Map()])) };
let userCb = null, oyente = null;
const usuario = { uid: "local", email: "prueba@localhost" };

const emitir = () => {
  if (!oyente) return;
  oyente("ajustes", mem.ajustes, false, false);
  oyente("compra", mem.compra, false, false);
  COLECCIONES.forEach(c => oyente(c, [...mem[c].values()], false, false));
};

export async function iniciarFirebase() { return {}; }
export const alCambiarUsuario = cb => { userCb = cb; cb(null); };
export async function entrar() { userCb && userCb(usuario); }
export async function entrarConToken() { userCb && userCb(usuario); }
export const resultadoRedireccion = async () => null;
export async function salir() { oyente = null; userCb && userCb(null); }
export function escuchar(uid, onDatos) { oyente = onDatos; setTimeout(emitir, 50); return () => { oyente = null; }; }
export async function guardarAjustes(uid, a) { mem.ajustes = JSON.parse(JSON.stringify(a)); setTimeout(emitir, 0); }
export function sustituirTodo(uid, datos) {
  COLECCIONES.forEach(c => { mem[c] = new Map((datos[c] || []).map(x => [String(x[CLAVE[c]]), x])); });
  mem.ajustes = datos.ajustes; mem.compra = datos.compra;
  setTimeout(emitir, 0);
  return { operaciones: COLECCIONES.reduce((a, c) => a + mem[c].size, 2), confirmado: Promise.resolve() };
}

export async function guardarDoc(uid, col, id, datos) {
  if (col === "ajustes") mem.ajustes = datos; else if (col === "compra") mem.compra = datos; else mem[col].set(String(id), JSON.parse(JSON.stringify(datos)));
  setTimeout(emitir, 0);
}
export async function borrarDoc(uid, col, id) { mem[col].delete(String(id)); setTimeout(emitir, 0); }
export async function borrarVarios(uid, col, ids) { ids.forEach(id => mem[col].delete(String(id))); setTimeout(emitir, 0); }
