/* Sustituto en memoria de drive.js para el modo local de pruebas (?local).
   window.__drive permite a las pruebas añadir filas al buzón y ver las copias. */
const mem = { copias: [], filas: [], conectado: false };
window.__drive = mem;
export function preparar() {}
export const conectado = () => mem.conectado;
export async function permiso() { mem.conectado = true; return "local"; }
export async function asegurar(ids = {}) { return { carpeta: ids.carpeta || "c-local", buzon: ids.buzon || "b-local", ultima: ids.ultima || null }; }
export async function subirCopia(ids, copia, fecha) { mem.copias.push({ fecha, bytes: JSON.stringify(copia).length }); return { ...ids, ultima: "u-local" }; }
export async function leerBuzon() { return mem.filas.map(f => f.slice()); }
export async function marcarFila(ids, fila, estado, detalle) { const f = mem.filas[fila - 2]; if (f) { f[5] = estado; f[6] = detalle; } }
