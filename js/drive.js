/* V.I.T.A. — Google Drive: copia de seguridad y buzón de entrada.
   Permiso «drive.file»: V.I.T.A. solo puede ver y tocar los archivos que ella
   misma crea en tu Drive (la carpeta «V.I.T.A.», las copias y la hoja del
   buzón); el resto de tu Drive no. Google da el permiso para ~1 hora y pedirlo
   necesita un toque tuyo (un botón), por eso no hay subidas en segundo plano.
   Necesita activadas, en el proyecto de Google Cloud del inicio de sesión, la
   API de Google Drive y la API de Google Sheets. */

import { GOOGLE_CLIENT_ID } from "./config.js";
import { CABECERA } from "./buzon-calc.js";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const CARPETA = "V.I.T.A.", BUZON = "V.I.T.A. buzón", ULTIMA = "vita-copia-ultima.json", GUARDAR_FECHADAS = 8;
const DRIVE = "https://www.googleapis.com/drive/v3", SUBIR = "https://www.googleapis.com/upload/drive/v3", SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

let tok = null, cliente = null, espera = null;

/* Carga la librería de Google y prepara el cliente (al arrancar, para que el botón pida permiso al instante) */
export function preparar() {
  if (cliente || !GOOGLE_CLIENT_ID) return;
  const init = () => {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return;
    cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE,
      callback: r => { const p = espera; espera = null; if (!p) return;
        if (r.error) p.rej(new Error(`Google no dio permiso (${r.error}).`));
        else { tok = { v: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 }; p.res(tok.v); } },
      error_callback: e => { const p = espera; espera = null; if (p) p.rej(new Error(e && e.type === "popup_closed" ? "Has cerrado la ventana de Google." : e && e.type === "popup_failed_to_open" ? "El navegador ha bloqueado la ventana de Google." : "Google no dio permiso.")); }
    });
  };
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return init();
  const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = init;
  document.head.appendChild(s);
}
export const conectado = () => !!(tok && tok.exp > Date.now() + 60000);

/* Pide el permiso. Hay que llamarla directamente desde un toque (si no, el navegador bloquea la ventana). */
export function permiso() {
  if (conectado()) return Promise.resolve(tok.v);
  if (!cliente) { preparar(); return Promise.reject(new Error("Google aún se está cargando: prueba otra vez en unos segundos.")); }
  return new Promise((res, rej) => { espera = { res, rej }; cliente.requestAccessToken({ prompt: "" }); });
}

async function api(url, opts = {}) {
  if (!conectado()) throw new Error("El permiso de Drive ha caducado: vuelve a pulsar el botón.");
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok.v}`, ...(opts.headers || {}) } });
  if (r.status === 401) { tok = null; throw new Error("El permiso de Drive ha caducado: vuelve a pulsar el botón."); }
  if (!r.ok) {
    let m = ""; try { const j = await r.json(); m = (j.error && j.error.message) || ""; } catch {}
    if (r.status === 403 && /has not been used|is disabled|not enabled/i.test(m)) throw new Error("Falta activar la API de Google Drive o de Google Sheets en tu proyecto de Google Cloud.");
    const e = new Error(`Drive respondió ${r.status}${m ? `: ${m}` : ""}`); e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}
const q = s => encodeURIComponent(s);
async function buscar(consulta) {
  const j = await api(`${DRIVE}/files?q=${q(consulta)}&fields=${q("files(id,name,modifiedTime)")}&orderBy=${q("name desc")}&pageSize=100&spaces=drive`);
  return j.files || [];
}
async function existe(id) {
  if (!id) return false;
  try { const f = await api(`${DRIVE}/files/${id}?fields=id,trashed`); return !f.trashed; } catch (e) { if (e.status === 404) return false; throw e; }
}

/* Carpeta y buzón (se crean la primera vez). ids = { carpeta, buzon, ultima } guardados en Ajustes */
export async function asegurar(ids = {}) {
  const out = { ...ids };
  if (!(await existe(out.carpeta))) {
    const f = await buscar(`name = '${CARPETA}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    out.carpeta = f.length ? f[0].id : (await api(`${DRIVE}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: CARPETA, mimeType: "application/vnd.google-apps.folder" }) })).id;
    out.buzon = null; out.ultima = null;
  }
  if (!(await existe(out.buzon))) {
    const f = await buscar(`name = '${BUZON}' and '${out.carpeta}' in parents and trashed = false`);
    if (f.length) out.buzon = f[0].id;
    else {
      out.buzon = (await api(`${DRIVE}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: BUZON, mimeType: "application/vnd.google-apps.spreadsheet", parents: [out.carpeta],
          description: "Buzón de entrada de V.I.T.A.: aquí escribe Claude pesajes, medidas, comidas y menús para que los revises en la app (Ajustes → Google Drive)." }) })).id;
      await escribirFila(out.buzon, 1, CABECERA);
    }
  }
  return out;
}

/* Sube un JSON: actualiza el archivo si existe (por id o por nombre en la carpeta) o lo crea */
async function subirJSON(carpeta, nombre, texto, id = null) {
  if (!id) { const f = await buscar(`name = '${nombre}' and '${carpeta}' in parents and trashed = false`); id = f.length ? f[0].id : null; }
  if (id && await existe(id)) {
    await api(`${SUBIR}/files/${id}?uploadType=media&fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: texto });
    return id;
  }
  const limite = "vita" + Math.random().toString(36).slice(2);
  const cuerpo = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpeta], mimeType: "application/json" })}\r\n--${limite}\r\nContent-Type: application/json\r\n\r\n${texto}\r\n--${limite}--`;
  return (await api(`${SUBIR}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${limite}` }, body: cuerpo })).id;
}

/* Copia: «vita-copia-ultima.json» (siempre la última) y «vita-copia-AAAA-MM-DD.json» (se guardan las 8 más recientes) */
export async function subirCopia(ids, copia, fecha) {
  const texto = JSON.stringify(copia);
  const ultima = await subirJSON(ids.carpeta, ULTIMA, texto, ids.ultima);
  await subirJSON(ids.carpeta, `vita-copia-${fecha}.json`, texto);
  const fechadas = (await buscar(`name contains 'vita-copia-20' and '${ids.carpeta}' in parents and trashed = false`)).sort((a, b) => a.name < b.name ? 1 : -1);
  for (const f of fechadas.slice(GUARDAR_FECHADAS)) { try { await api(`${DRIVE}/files/${f.id}`, { method: "DELETE" }); } catch {} }
  return { ...ids, ultima };
}

/* Buzón: filas de la hoja (sin cabecera) y marcar el estado de una fila */
export async function leerBuzon(ids) {
  const j = await api(`${SHEETS}/${ids.buzon}/values/${q("A2:G500")}`);
  return j.values || [];
}
async function escribirFila(hoja, fila, valores, desde = "A") {
  const fin = String.fromCharCode(desde.charCodeAt(0) + valores.length - 1);
  await api(`${SHEETS}/${hoja}/values/${q(`${desde}${fila}:${fin}${fila}`)}?valueInputOption=RAW`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: [valores] }) });
}
export const marcarFila = (ids, fila, estado, detalle) => escribirFila(ids.buzon, fila, [estado, detalle], "F");
