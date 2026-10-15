/* Configuración del proyecto Firebase de V.I.T.A.
   Estos valores no son secretos: identifican el proyecto. Lo que protege los
   datos son las reglas de Firestore (solo la cuenta de Iván puede leer y escribir). */
export const firebaseConfig = {
  apiKey: "AIzaSyDfKMsFMWTKjI-kxULykVco9paRez4gcFg",
  authDomain: "vita-75aab.firebaseapp.com",
  projectId: "vita-75aab",
  storageBucket: "vita-75aab.firebasestorage.app",
  messagingSenderId: "576134836176",
  appId: "1:576134836176:web:50c1d519299907a54253d5"
};

/* Versión del SDK web de Firebase (la que generó la consola). Si se cambia,
   hay que subir también la versión de la caché en sw.js. */
export const FIREBASE_SDK = "13.0.0";

/* «ID de cliente web» de Google (Firebase → Authentication → Método de acceso →
   Google → Configuración del SDK web). Tampoco es secreto. Con él, la entrada
   usa el botón oficial de Google dentro de la página, sin ventanas ni
   redirecciones, que es lo que mejor funciona en el móvil. Vacío = solo la
   ventana emergente de Firebase. */
export const GOOGLE_CLIENT_ID = "";
