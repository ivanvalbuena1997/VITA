/* V.I.T.A. — capa de datos sobre Firebase (Auth + Firestore).
   Firestore guarda una copia local en el dispositivo (IndexedDB): la app
   funciona sin conexión y sincroniza sola al volver la red.
   Estructura: users/{uid}/
     ajustes/principal   · un documento con perfil, objetivos y preferencias
     compra/actual       · lista de la compra en curso
     ejercicios/{id} · sesiones/{fecha} · dias/{fecha}
     alimentos/{id}  · menus/{id}       · diario/{fecha}                     */

import { firebaseConfig, FIREBASE_SDK } from "./config.js";
import { COLECCIONES, CLAVE } from "./db-claves.js";
export { COLECCIONES, CLAVE };

let F = null;

export async function iniciarFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/`;
  const [a, au, fs] = await Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-auth.js"),
    import(base + "firebase-firestore.js")
  ]);
  const app = a.initializeApp(firebaseConfig);
  const auth = au.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
    });
  } catch (e) {
    // Si el navegador no permite la caché persistente, se trabaja solo en memoria
    console.warn("Caché local no disponible:", e);
    db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  F = { au, fs, auth, db };
  return F;
}

export const alCambiarUsuario = cb => F.au.onAuthStateChanged(F.auth, cb);

/* Entrar con Google. Primero en ventana emergente; si el navegador no la
   permite (algunas apps instaladas), se usa la redirección. */
export async function entrar() {
  const prov = new F.au.GoogleAuthProvider();
  prov.setCustomParameters({ prompt: "select_account" });
  try {
    await F.au.signInWithPopup(F.auth, prov);
  } catch (e) {
    const usarRedireccion = ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e && e.code);
    if (usarRedireccion) await F.au.signInWithRedirect(F.auth, prov);
    else throw e;
  }
}
/* Entrar con el token que da el botón de Google (Google Identity Services) */
export async function entrarConToken(idToken) {
  await F.au.signInWithCredential(F.auth, F.au.GoogleAuthProvider.credential(idToken));
}
export const resultadoRedireccion = () => F.au.getRedirectResult(F.auth);
export const salir = () => F.au.signOut(F.auth);

/* Escucha todo lo del usuario. onDatos(nombre, valor, pendiente, desdeCache) */
export function escuchar(uid, onDatos, onError) {
  const { fs, db } = F;
  const opts = { includeMetadataChanges: true };
  const subs = [
    fs.onSnapshot(fs.doc(db, "users", uid, "ajustes", "principal"), opts,
      s => onDatos("ajustes", s.exists() ? s.data() : null, s.metadata.hasPendingWrites, s.metadata.fromCache), onError),
    fs.onSnapshot(fs.doc(db, "users", uid, "compra", "actual"), opts,
      s => onDatos("compra", s.exists() ? s.data() : null, s.metadata.hasPendingWrites, s.metadata.fromCache), onError),
    ...COLECCIONES.map(c => fs.onSnapshot(fs.collection(db, "users", uid, c), opts,
      s => onDatos(c, s.docs.map(d => d.data()), s.metadata.hasPendingWrites, s.metadata.fromCache), onError))
  ];
  return () => subs.forEach(u => u());
}

export function guardarAjustes(uid, ajustes) {
  const { fs, db } = F;
  return fs.setDoc(fs.doc(db, "users", uid, "ajustes", "principal"), ajustes);
}

/* Sustituye todos los datos por los de una importación o una copia.
   Prepara todas las operaciones antes de enviar nada, y borra solo los
   documentos que no vienen en los datos nuevos. Devuelve una promesa que se
   resuelve cuando el servidor confirma (sin conexión, queda pendiente). */
export function sustituirTodo(uid, datos, existentes) {
  const { fs, db } = F;
  const ops = [];
  COLECCIONES.forEach(c => {
    const nuevos = new Set((datos[c] || []).map(x => String(x[CLAVE[c]])));
    (existentes[c] || []).forEach(k => { if (!nuevos.has(String(k))) ops.push(["del", fs.doc(db, "users", uid, c, String(k))]); });
    (datos[c] || []).forEach(x => ops.push(["set", fs.doc(db, "users", uid, c, String(x[CLAVE[c]])), x]));
  });
  ops.push(["set", fs.doc(db, "users", uid, "ajustes", "principal"), datos.ajustes]);
  ops.push(["set", fs.doc(db, "users", uid, "compra", "actual"), datos.compra || { items: [], marcados: [] }]);

  const commits = [];
  for (let i = 0; i < ops.length; i += 400) {
    const b = fs.writeBatch(db);
    ops.slice(i, i + 400).forEach(([t, ref, d]) => t === "del" ? b.delete(ref) : b.set(ref, d));
    commits.push(b.commit());
  }
  return { operaciones: ops.length, confirmado: Promise.all(commits) };
}

/* ---------- escrituras sueltas ---------- */
const ref = (uid, col, id) => F.fs.doc(F.db, "users", uid, col, String(id));
export const guardarDoc = (uid, col, id, datos) => F.fs.setDoc(ref(uid, col, id), datos);
export const borrarDoc = (uid, col, id) => F.fs.deleteDoc(ref(uid, col, id));
/* Cambia solo los campos indicados (merge); null borra el campo. Así V.I.T.A. no
   pisa lo que escriba la app compañera de Android en el mismo documento.
   Con merge, Firestore mezclaría los mapas por dentro (un sueño a mano
   conservaría las fases de Health Connect): los mapas se borran y se vuelven a
   escribir en el mismo lote, que se aplica entero y en orden. */
export function actualizarDoc(uid, col, id, campos) {
  const r = ref(uid, col, id), b = F.fs.writeBatch(F.db), quitar = {}, datos = {};
  Object.entries(campos).forEach(([k, v]) => {
    if (v === null) { datos[k] = F.fs.deleteField(); return; }
    datos[k] = v;
    if (typeof v === "object" && !Array.isArray(v)) quitar[k] = F.fs.deleteField();
  });
  if (Object.keys(quitar).length) b.set(r, quitar, { merge: true });
  b.set(r, datos, { merge: true });
  return b.commit();
}
export function borrarVarios(uid, col, ids) {
  const commits = [];
  for (let i = 0; i < ids.length; i += 400) {
    const b = F.fs.writeBatch(F.db);
    ids.slice(i, i + 400).forEach(id => b.delete(ref(uid, col, id)));
    commits.push(b.commit());
  }
  return Promise.all(commits);
}
