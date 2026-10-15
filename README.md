# V.I.T.A.

**Virtual Interface for Training & Alimentación.** App web personal que une el registro de
entreno (antes GYM-TRACKER) y el de comida (antes FitCoock), sincronizada entre el móvil y el
ordenador con Firebase.

## Estructura

| Ruta | Para qué |
|---|---|
| `index.html` | Página de la app |
| `css/vita.css` | Estilos (tema HUD oscuro y claro) |
| `js/app.js` | Interfaz y arranque |
| `js/db.js` | Firebase: inicio de sesión con Google y Firestore con caché sin conexión |
| `js/model.js` | Modelo de datos, grupos musculares y ajustes por defecto |
| `js/import.js` | Importador de las copias de GYM-TRACKER y FitCoock |
| `js/backup.js` | Copia de seguridad única y autodescriptiva |
| `js/config.js` | Configuración del proyecto Firebase (no es secreta) |
| `sw.js` | Service worker: funcionamiento sin conexión y aviso de versión nueva |
| `fonts/` | Orbitron y Rajdhani (licencia SIL OFL 1.1) |

## Publicar cambios

Cada vez que cambie cualquier archivo, sube `VERSION` en `sw.js` y `APP_VERSION` en
`js/model.js`. Si no, el móvil seguirá usando la versión guardada.

## Datos

Los datos viven en Firestore (`users/{uid}/…`), protegidos por reglas que solo permiten el
acceso a la cuenta del dueño. Los datos personales (nacimiento, altura, peso) no están en el
código: llegan con la importación y se editan en Ajustes.

## Pruebas

`node tests/test_import.mjs copia-gym.json copia-fitcoock.json` comprueba que el importador
conserva el volumen de cada sesión y las kcal de cada día. Las copias reales no se suben al
repositorio.
