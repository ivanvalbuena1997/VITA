/* V.I.T.A. — service worker.
   IMPORTANTE: sube VERSION cada vez que cambie cualquier archivo de la app;
   así el móvil detecta la versión nueva y muestra el aviso «Actualizar». */
const VERSION = "vita-0.2.5";
const FIREBASE = "vita-firebase-13.0.0";   // cambia si cambia FIREBASE_SDK en js/config.js

const APP = [
  "./", "./index.html", "./manifest.webmanifest", "./css/vita.css",
  "./js/app.js", "./js/db.js", "./js/db-claves.js", "./js/config.js", "./js/model.js",
  "./js/import.js", "./js/backup.js", "./js/icons.js", "./js/entreno.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./fonts/orbitron-latin-500-normal.woff2", "./fonts/orbitron-latin-700-normal.woff2",
  "./fonts/rajdhani-latin-500-normal.woff2", "./fonts/rajdhani-latin-600-normal.woff2",
  "./fonts/rajdhani-latin-700-normal.woff2"
];

self.addEventListener("install", e => {
  // cache: "reload" salta la caché HTTP del navegador: si no, una versión
  // nueva podía guardarse con archivos antiguos (GitHub Pages los cachea 10 min)
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP.map(u => new Request(u, { cache: "reload" })))));
});

// La versión nueva espera a que el usuario pulse «Actualizar»
self.addEventListener("message", e => { if (e.data === "activar") self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith("vita-") && k !== VERSION && k !== FIREBASE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // SDK de Firebase: archivos con versión fija, se guardan para funcionar sin conexión
  if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open(FIREBASE).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) c.put(req, r.clone());
      return r;
    }))));
    return;
  }
  if (url.origin !== self.location.origin) return;   // Firestore, Auth, Google: siempre a la red

  // La página: primero la red (para ver versiones nuevas), si no hay, la copia guardada
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  // El resto de la app: la copia de esta versión
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
