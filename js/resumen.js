/* V.I.T.A. — pantalla Hoy (balance, macros y peso) y resumen semanal con la
   exportación para el entrenador IA. Los cálculos: semana-calc.js. */

import { hoyISO, toISO, APP_VERSION } from "./model.js";
import * as W from "./semana-calc.js";
import * as A from "./actividad-calc.js";
import * as K from "./comida-calc.js";

let C = null;
export function init(ctx) { C = ctx; }
const R = { lunes: null };

const esc = s => C.esc(s);
const f0 = n => Math.round(n || 0).toLocaleString("es-ES");
const f1 = n => (Math.round((n || 0) * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const f2 = n => (Math.round((n || 0) * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });
const sumarDias = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };
const datos = () => W.contexto({ alimentos: C.S.alimentos, diario: C.S.diario, dias: C.S.dias, sesiones: C.S.sesiones, ajustes: C.S.ajustes });
const MAC = [{ k: "prot", n: "Proteína", c: "var(--prot)" }, { k: "hid", n: "Hidratos", c: "var(--hid)" }, { k: "gra", n: "Grasas", c: "var(--gra)" }, { k: "fib", n: "Fibra", c: "var(--fib)" }];
function barra(n, v, meta, col) {
  const pct = meta > 0 ? v / meta * 100 : 0;
  return `<div class="mbar"><div class="mbar-top"><span><i class="dot" style="background:${col}"></i>${n}</span><span><b style="color:${col}">${f1(v)}</b> <span class="muted">/ ${f1(meta)} g</span></span></div>
    <div class="mbar-pista"><i style="width:${Math.min(pct, 100)}%;background:${col}"></i>${pct > 100 ? `<i class="mbar-exceso" style="width:${Math.min(pct - 100, 100)}%"></i>` : ""}</div></div>`;
}

/* ================= Hoy ================= */
export function tarjetasHoy() {
  const X = datos(), hoy = hoyISO(), aj = C.S.ajustes;
  const g = A.gastoDia(hoy, X.gctx);
  const cal = A.calibracion(sumarDias(hoy, -1), X.gctx);
  const fac = aj.gasto.usarCalibracion !== false && cal.listo ? cal.factor : 1;
  const di = C.S.diario.find(d => d.fecha === hoy);
  const t = K.totalComidas(di ? di.comidas : {}, X.mapa);
  const peso = A.pesoEn(C.S.dias, aj.perfil, hoy);
  const o = K.objetivoGramos(aj.objetivo, peso.valor);
  const out = [];

  // Balance
  const gasto = g.total != null ? g.total * fac : null, bal = gasto != null ? t.kcal - gasto : null;
  out.push(`<div class="card" data-sec="h-balance"><p class="card-title">Balance de hoy</p>
    ${gasto == null ? `<p class="err" style="margin:0">Faltan datos del perfil para el gasto: ${esc(g.faltan.join(", "))}.</p>` : `
    <div class="balance">
      <div><span class="muted">Comido</span><b class="mono">${f0(t.kcal)}</b></div>
      <div class="balance-op">−</div>
      <div><span class="muted">Gasto${fac !== 1 ? " calibrado" : ""}</span><b class="mono">${f0(gasto)}</b></div>
      <div class="balance-op">=</div>
      <div><span class="muted">${bal > 0 ? "Superávit" : "Déficit"}</span><b class="mono" style="color:${bal > 0 ? "var(--warn)" : "var(--ok)"}">${bal > 0 ? "+" : "−"}${f0(Math.abs(bal))}</b></div>
    </div>
    <p class="muted" style="margin:0">Gasto hasta ahora: basal ${f0(g.basal * fac)}${g.kPasos ? ` · pasos ${f0(g.kPasos * fac)}` : ""}${g.kEntreno ? ` · entreno ${f0(g.kEntreno * fac)}` : ""}${g.kCardio ? ` · cardio ${f0(g.kCardio * fac)}` : ""}${g.kDigestion ? ` · digestión ${f0(g.kDigestion * fac)}` : ""}. ${g.pasos ? "" : "Los pasos se suman cuando los apuntas."}</p>`}
    <div class="btn-row"><button class="btn sm" data-tab="comida">Diario de comida</button><button class="btn sm" data-r="ir-dia">Pasos, peso y cardio</button></div></div>`);

  // Macros
  const pct = o.kcal > 0 ? t.kcal / o.kcal * 100 : 0, col = pct > 105 ? "var(--bad)" : pct >= 95 ? "var(--ok)" : "var(--acc)";
  out.push(`<div class="card" data-sec="h-macros"><p class="card-title">Macros de hoy</p>
    <div class="kcal-hero"><div><b class="mono" style="color:${col}">${f0(t.kcal)}</b><span class="muted"> de ${f0(o.kcal)} kcal</span></div>
      <div class="kcal-resto"><span class="muted">${o.kcal - t.kcal >= 0 ? "faltan" : "sobran"}</span><b class="mono">${f0(Math.abs(o.kcal - t.kcal))}</b></div></div>
    <div class="mbar-pista grande"><i style="width:${Math.min(pct, 100)}%;background:${col}"></i></div>
    ${MAC.map(m => barra(m.n, t[m.k], o[m.k], m.c)).join("")}
    ${peso.valor ? `<p class="muted" style="margin:0">Proteína: <b>${f1(t.prot / peso.valor)}</b> de ${f1(o.prot / peso.valor)} g/kg.</p>` : ""}
    ${!di ? `<p class="muted" style="margin:0">Aún no has apuntado nada hoy.</p>` : ""}</div>`);

  // Peso
  const pes = A.pesajes(C.S.dias), ult = pes[pes.length - 1];
  const ult28 = pes.filter(p => p.fecha >= sumarDias(hoy, -27));
  const pend = ult28.length >= 3 ? A.pendiente(ult28) : null;
  const serie = A.mediaMovil(pes, aj.perfil.pesajesMedia || 7).filter(p => p.fecha >= sumarDias(hoy, -59));
  out.push(`<div class="card" data-sec="h-peso"><p class="card-title">Peso</p>
    <div class="grid3">
      <div class="stat"><b>${ult ? f1(ult.peso) : "—"}</b><span>último${ult ? ` · ${esc(C.fecha(ult.fecha))}` : ""}</span></div>
      <div class="stat"><b class="acc">${peso.valor ? f1(peso.valor) : "—"}</b><span>para los cálculos</span></div>
      <div class="stat"><b>${pend != null ? `${pend >= 0 ? "+" : "−"}${f2(Math.abs(pend * 7))}` : "—"}</b><span>kg/semana</span></div>
    </div>
    ${serie.length >= 2 ? miniLinea(serie) : ""}
    <p class="muted" style="margin:0">${esc(peso.fuente)}.${pend == null ? " La tendencia aparece con 3 pesajes en las últimas 4 semanas." : " Tendencia de las últimas 4 semanas."}${ult && ult.fecha !== hoy ? " Hoy no te has pesado." : ""}</p></div>`);
  return out.join("");
}
function miniLinea(serie) {
  const W0 = 480, H = 90, P = 6;
  const vals = serie.flatMap(p => [p.peso, p.media]);
  let mn = Math.min(...vals), mx = Math.max(...vals); if (mx - mn < 0.6) { const c = (mx + mn) / 2; mn = c - 0.3; mx = c + 0.3; }
  const x0 = new Date(serie[0].fecha + "T00:00:00"), x1 = new Date(serie[serie.length - 1].fecha + "T00:00:00"), span = Math.max(1, (x1 - x0) / 86400000);
  const X = f => P + ((new Date(f + "T00:00:00") - x0) / 86400000) / span * (W0 - 2 * P), Y = v => H - P - (v - mn) / (mx - mn) * (H - 2 * P);
  const d = serie.map((p, i) => `${i ? "L" : "M"}${X(p.fecha).toFixed(1)},${Y(p.media).toFixed(1)}`).join("");
  return `<svg viewBox="0 0 ${W0} ${H}" class="graf mini" role="img" aria-label="Evolución del peso">
    ${serie.map(p => `<circle cx="${X(p.fecha)}" cy="${Y(p.peso)}" r="3" fill="var(--surf)" stroke="var(--dim)" stroke-width="1.5"/>`).join("")}
    <path d="${d}" fill="none" stroke="var(--acc)" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
}

/* ================= Resumen semanal (Progreso → Semana) ================= */
export function vSemana() {
  const hoy = hoyISO();
  if (!R.lunes) R.lunes = W.lunesDe(hoy);
  const X = datos(), S = W.resumenSemana(R.lunes, X, hoy), aj = C.S.ajustes;
  const actual = R.lunes === W.lunesDe(hoy);
  const fila = (n, v, extra = "") => `<div class="row"><span>${n}</span><span>${v}${extra ? ` <span class="muted">${extra}</span>` : ""}</span></div>`;
  const e = S.entreno, c = S.comida, a = S.actividad, p = S.peso;
  const tier = e.nota == null ? null : e.nota >= 85 ? "var(--acc)" : e.nota >= 70 ? "var(--text)" : e.nota >= 50 ? "var(--warn)" : "var(--bad)";
  return `<div class="card"><div class="fecha-nav">
      <button class="icon-btn sm" data-r="sem" data-n="-1" aria-label="Semana anterior">${C.icon("izq", 18)}</button>
      <div style="flex:1;text-align:center"><b>${esc(C.fecha(S.lunes))} – ${esc(C.fecha(S.domingo))}</b><div class="muted">${actual ? `semana en curso · ${S.fechas.length} de 7 días` : "semana completa"}</div></div>
      <button class="icon-btn sm" data-r="sem" data-n="1" aria-label="Semana siguiente" ${actual ? "disabled" : ""}>${C.icon("der", 18)}</button></div></div>
  <div class="card" data-sec="s-entreno"><p class="card-title">Entreno</p>
    ${fila("Sesiones", `<b>${e.sesiones}</b>`)}${fila("Series", `<b>${e.series}</b>`)}${fila("Volumen", `<b>${f0(e.volumenKg)}</b> kg`)}
    ${e.nota != null ? fila("Nota de volumen", `<b style="color:${tier}">${e.nota}</b>/100`) : ""}
    ${e.fueraDeRango.length ? `<p class="muted" style="margin:0">Fuera de rango: ${e.fueraDeRango.map(x => `${esc(x.g)} ${f1(x.sets)} (${x.min}–${x.max})`).join(" · ")}.</p>` : e.sesiones ? `<p class="muted" style="margin:0">Todos los grupos con rango están dentro.</p>` : ""}</div>
  <div class="card" data-sec="s-comida"><p class="card-title">Comida</p>
    ${c.dias ? `${fila("Días registrados", `<b>${c.dias}</b>`)}${fila("Calorías de media", `<b>${f0(c.kcal)}</b> kcal`, `objetivo ${f0(c.objetivo.kcal)}`)}
    ${MAC.map(m => fila(`<i class="dot" style="background:${m.c}"></i> ${m.n}`, `<b>${f1(c[m.k])}</b> g`, `/ ${f1(c.objetivo[m.k])}`)).join("")}
    ${c.protGkg != null ? fila("Proteína por kilo", `<b>${f2(c.protGkg)}</b> g/kg`) : ""}
    ${fila("Días dentro del ±10 %", `<b>${c.dentro10}</b> de ${c.dias}`)}
    ${c.costeMedio ? fila("Coste medio al día", `${c.costeMedio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`) : ""}` : `<p class="muted" style="margin:0">Sin comida apuntada esta semana.</p>`}</div>
  <div class="card" data-sec="s-actividad"><p class="card-title">Actividad y gasto</p>
    ${fila("Pasos de media", a.pasosMedia != null ? `<b>${f0(a.pasosMedia)}</b>` : "—", a.diasPasos ? `${a.diasObjetivo} de ${a.diasPasos} días con objetivo` : "")}
    ${fila("Cardio", `<b>${a.cardio.sesiones}</b> sesiones`, a.cardio.min ? `${f0(a.cardio.min)} min` : "")}
    ${fila(`Gasto medio${a.calibrado ? " calibrado" : ""}`, a.gastoMedio != null ? `<b>${f0(a.gastoMedio)}</b> kcal` : "—")}
    ${a.balanceMedio != null ? fila("Balance medio", `<b style="color:${a.balanceMedio > 0 ? "var(--warn)" : "var(--ok)"}">${a.balanceMedio > 0 ? "+" : "−"}${f0(Math.abs(a.balanceMedio))}</b> kcal/día`, `${a.diasBalance} días con comida`) : ""}
    ${!a.calibrado ? `<p class="muted" style="margin:0">Gasto sin calibrar con tu peso: la fórmula suele quedarse corta.</p>` : ""}</div>
  <div class="card" data-sec="s-peso"><p class="card-title">Peso</p>
    ${fila("Media de la semana", p.media != null ? `<b>${f1(p.media)}</b> kg` : "—", p.pesajes.length ? `${p.pesajes.length} pesajes` : "sin pesajes")}
    ${fila("Semana anterior", p.mediaAnterior != null ? `${f1(p.mediaAnterior)} kg` : "—")}
    ${p.cambio != null ? fila("Cambio", `<b>${p.cambio >= 0 ? "+" : "−"}${f2(Math.abs(p.cambio))}</b> kg`) : ""}
    ${fila("Tendencia (4 semanas)", p.kgSemana != null ? `<b>${p.kgSemana >= 0 ? "+" : "−"}${f2(Math.abs(p.kgSemana))}</b> kg/semana` : "—")}</div>
  <div class="card accent-suave" data-sec="s-export"><p class="card-title">Para el entrenador IA</p>
    <p class="muted" style="margin:0">Toda la semana en un formato compacto (entreno serie a serie, comida por comidas, pasos, cardio, peso, gasto y resumen), con las reglas para interpretarlo. «Copiar texto» es lo más cómodo para pegarlo en un chat; el JSON sirve para guardarlo o pasarlo a un programa.</p>
    <div class="btn-row"><button class="btn primary" data-r="copiar">${C.icon("copiar", 18)}Copiar texto</button><button class="btn" data-r="descargar">Descargar JSON</button></div></div>`;
}

export function click(e) {
  const b = e.target.closest("[data-r]"); if (!b) return false;
  const hoy = hoyISO();
  switch (b.dataset.r) {
    case "sem": { const n = sumarDias(R.lunes, 7 * +b.dataset.n); if (n <= W.lunesDe(hoy)) R.lunes = n; C.render(); return true; }
    case "ir-dia": C.irA("progreso"); return true;
    case "copiar": case "descargar": {
      const exp = W.exportarSemana(R.lunes, datos(), { version: APP_VERSION, hoy });
      if (b.dataset.r === "copiar") {
        const txt = W.textoSemana(exp);
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => C.toast(`Semana copiada (${f0(txt.length)} caracteres). Pégala en el chat.`), () => C.toast("El navegador no deja copiar."));
        else C.toast("El navegador no deja copiar.");
      } else {
        const blob = new Blob([JSON.stringify(exp, null, 1)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `vita-semana-${R.lunes}.json`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        C.toast("Semana descargada.");
      }
      return true;
    }
  }
  return false;
}
