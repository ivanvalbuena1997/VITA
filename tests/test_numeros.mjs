/* Número de cada alimento: node tests/test_numeros.mjs gym.json fitcoock.json */
import fs from "node:fs";
import { importarCopias } from "../js/import.js";
import * as K from "../js/comida-calc.js";
const r = importarCopias({ gym: JSON.parse(fs.readFileSync(process.argv[2])), fit: JSON.parse(fs.readFileSync(process.argv[3])) });
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log("FALLO:", m); } };
const A = r.alimentos;
const res = K.numerar(A, 0);
const conCod = A.filter(a => /^\d+$/.test(a.codigo || ""));
ok(res.cambios.length === A.length && res.ultimo === A.length, `todos numerados (${res.cambios.length}/${A.length})`);
ok(conCod.every(a => a.num === parseInt(a.codigo, 10)) || conCod.map(a => parseInt(a.codigo, 10)).sort((x, y) => x - y).every((v, i) => v === i + 1) === false, "los de la hoja conservan su código como número (si son 1..n seguidos)");
const seguidos = conCod.map(a => parseInt(a.codigo, 10)).sort((x, y) => x - y).every((v, i) => v === i + 1);
if (seguidos) ok(conCod.every(a => a.num === parseInt(a.codigo, 10)), "código 001 → #1");
const resto = A.filter(a => !conCod.includes(a)).sort((a, b) => a.num - b.num);
ok(resto.every((a, i) => i === 0 || resto[i - 1].id < a.id), "el resto, por orden de creación");
ok(new Set(A.map(a => a.num)).size === A.length, "sin repetidos");
ok(K.numerar(A, res.ultimo).cambios.length === 0, "idempotente");
// nuevo: el siguiente
A.push({ id: "zzz-nuevo", tipo: "basico", nombre: "Nuevo" });
let r2 = K.numerar(A, res.ultimo);
ok(r2.cambios.length === 1 && A[A.length - 1].num === A.length && r2.ultimo === A.length, "nuevo = siguiente");
// borrar el último y crear otro: no se reutiliza
const ult = r2.ultimo; A.pop(); A.push({ id: "zzz-otro", tipo: "basico", nombre: "Otro" });
r2 = K.numerar(A, ult);
ok(A[A.length - 1].num === ult + 1, "no reutiliza números borrados");
// repetido (dos dispositivos a la vez): el creado después recibe uno nuevo
A.push({ id: "zzzz-dup", tipo: "basico", nombre: "Dup", num: A[A.length - 1].num });
r2 = K.numerar(A, r2.ultimo);
ok(r2.cambios.length === 1 && r2.cambios[0].id === "zzzz-dup" && new Set(A.map(a => a.num)).size === A.length, "repetido arreglado");
console.log(`numerados ${A.length}, con código de la hoja ${conCod.length} (seguidos: ${seguidos})`);
console.log(fallos ? `${fallos} FALLOS` : "TODO CORRECTO");
process.exit(fallos ? 1 : 0);
