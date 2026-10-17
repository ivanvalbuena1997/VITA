# V.I.T.A.

**Virtual Interface for Training & Alimentación.** App web personal que une el registro de
entreno (antes GYM-TRACKER) y el de comida (antes FitCoock), sincronizada entre el móvil y el
ordenador con Firebase.

## Estructura

| Ruta | Para qué |
|---|---|
| `index.html` | Página de la app |
| `css/vita.css` | Estilos (tema HUD oscuro y claro) |
| `js/app.js` | Arranque, inicio de sesión, pestañas, sincronización, Ajustes generales e importación |
| `js/entreno.js` | Entreno: registrar, progresión, volumen e historial |
| `js/comida.js` · `js/comida-calc.js` · `js/comida-base.js` | Comida: diario, semana, menús, alimentos, compra; cálculos; alimentos base |
| `js/actividad.js` · `js/actividad-calc.js` | Progreso: pasos, peso, cardio y gasto con calibración |
| `js/resumen.js` · `js/semana-calc.js` | Pantalla Hoy, resumen semanal y exportación para el entrenador IA |
| `js/db.js` · `js/db-local.js` | Firebase (Auth + Firestore con caché sin conexión) · sustituto en memoria para probar con `?local` |
| `js/model.js` | Modelo de datos, grupos musculares y ajustes por defecto |
| `js/import.js` | Importador de las copias de GYM-TRACKER y FitCoock |
| `js/backup.js` | Copia de seguridad única y autodescriptiva |
| `js/config.js` | Configuración de Firebase y del botón de Google (no son secretos) |
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

Con las copias reales fuera del repositorio:

```
node tests/test_import.mjs    gym.json fitcoock.json   # importador: volumen y kcal de cada día
node tests/test_comida.mjs    gym.json fitcoock.json   # platos, objetivo, fritura, completar, compra
node tests/test_actividad.mjs gym.json fitcoock.json   # entreno, cardio, gasto y calibración
node tests/test_semana.mjs    gym.json fitcoock.json   # resumen semanal y exportación
```

Para probar la interfaz sin Firebase: servir la carpeta en `localhost` y abrir `/?local`.
