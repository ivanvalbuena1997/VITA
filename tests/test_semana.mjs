/* Resumen semanal y exportación: node tests/test_semana.mjs gym.json fitcoock.json */
import fs from "node:fs";
import { importarCopias } from "../js/import.js";
import * as W from "../js/semana-calc.js";
const r = importarCopias({ gym: JSON.parse(fs.readFileSync(process.argv[2])), fit: JSON.parse(fs.readFileSync(process.argv[3])) });
r.ajustes.perfil.nacimiento = "1997-06-13"; r.ajustes.perfil.pesoReferencia = 64;
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };
const R = W.resumenSemana("2026-10-05", r);
console.log(JSON.stringify({ entreno: { ...R.entreno, porGrupo: undefined }, comida: { ...R.comida, objetivo: undefined }, actividad: R.actividad, peso: R.peso }, null, 1).slice(0, 1800));
ok(Math.round(R.comida.kcal) === 2547, "kcal media 5-11 oct: " + R.comida.kcal);
const e = W.exportarSemana("2026-10-05", r, { version: "test" });
const json = JSON.stringify(e), txt = W.textoSemana(e);
console.log("JSON:", json.length, "caracteres · texto:", txt.length, "caracteres");
console.log(txt.slice(0, 2500));
ok(e.dias.length === 7, "7 días");
// Semana en curso: hoy cuenta para entreno pero no para las medias
const R2 = W.resumenSemana("2026-10-12", r, "2026-10-14");
ok(R2.completas.length === 2 && R2.comida.dias === 2, "hoy fuera de las medias: " + R2.comida.dias);
const e2 = W.exportarSemana("2026-10-12", r, { hoy: "2026-10-14" });
ok(e2.dias.length === 3 && e2.dias[2].en_curso === true, "día en curso marcado");
console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
