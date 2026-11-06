/* Sustituto en memoria de db.js, SOLO para probar la interfaz en localhost
   con ?local. Misma API, sin red ni Firebase. No guarda nada. */
import { COLECCIONES, CLAVE } from "./db-claves.js";

const mem = { ajustes: null, compra: null, ...Object.fromEntries(COLECCIONES.map(c => [c, new Map()])) };
let userCb = null;
let cola = Promise.resolve();   // escrituras sueltas en orden, como Firestore
const oyentes = new Set();   // varios a la vez: la app y, en las pruebas, quien quiera mirar
const usuario = { uid: "local", email: "prueba@localhost" };

const emitir = () => {
  oyentes.forEach(oyente => {
    oyente("ajustes", mem.ajustes, false, false);
    oyente("compra", mem.compra, false, false);
    COLECCIONES.forEach(c => oyente(c, [...mem[c].values()], false, false));
  });
};

export async function iniciarFirebase() { return {}; }
export const alCambiarUsuario = cb => { userCb = cb; cb(null); };
export async function entrar() { userCb && userCb(usuario); }
export async function entrarConToken() { userCb && userCb(usuario); }
export const resultadoRedireccion = async () => null;
export async function salir() { oyentes.clear(); userCb && userCb(null); }
export function escuchar(uid, onDatos) { oyentes.add(onDatos); setTimeout(emitir, 50); return () => { oyentes.delete(onDatos); }; }
export async function guardarAjustes(uid, a) { mem.ajustes = JSON.parse(JSON.stringify(a)); setTimeout(emitir, 0); }
export function sustituirTodo(uid, datos) {
  const d = JSON.parse(JSON.stringify(datos));
  cola = cola.then(() => new Promise(res => setTimeout(() => {   // detrás de las escrituras pendientes, como en Firestore
    COLECCIONES.forEach(c => { mem[c] = new Map((d[c] || []).map(x => [String(x[CLAVE[c]]), x])); });
    mem.ajustes = d.ajustes; mem.compra = d.compra;
    emitir(); res();
  }, 0)));
  return { operaciones: COLECCIONES.reduce((a, c) => a + (d[c] || []).length, 2), confirmado: cola };
}

/* Como Firestore: cada escritura suelta se aplica y avisa por separado (si se
   guardan 100 documentos uno a uno, llegan 100 avisos con los datos a medias).
   Un lote (guardarVarios) se aplica y avisa de una vez. */
export function guardarDoc(uid, col, id, datos) {
  const copia = JSON.parse(JSON.stringify(datos));
  cola = cola.then(() => new Promise(res => setTimeout(() => {
    if (col === "ajustes") mem.ajustes = copia; else if (col === "compra") mem.compra = copia; else mem[col].set(String(id), copia);
    emitir(); res();
  }, 0)));
  return cola;
}
export async function actualizarDoc(uid, col, id, campos) {
  const d = { ...(mem[col].get(String(id)) || {}) };
  Object.entries(JSON.parse(JSON.stringify(campos))).forEach(([k, v]) => { if (v === null) delete d[k]; else d[k] = v; });
  mem[col].set(String(id), d); setTimeout(emitir, 0);
}
export async function guardarVarios(uid, col, docs) { docs.forEach(([id, d]) => mem[col].set(String(id), JSON.parse(JSON.stringify(d)))); setTimeout(emitir, 0); }
export async function borrarDoc(uid, col, id) { mem[col].delete(String(id)); setTimeout(emitir, 0); }
export async function borrarVarios(uid, col, ids) { ids.forEach(id => mem[col].delete(String(id))); setTimeout(emitir, 0); }
