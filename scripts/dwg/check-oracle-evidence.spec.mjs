#!/usr/bin/env node
/** Casos sintéticos: ninguna conversión ni archivo DWG/DXF se ejecuta aquí. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  casosExigidos,
  comparadorEsperado,
  coberturaDelOraculo,
  coberturaTecnicaDelOraculo,
  leerBooleanoDelProducto,
} from "./check-oracle-evidence.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const comparar = (reporte) => coberturaDelOraculo(reporte);
const esperados = casosExigidos();

const historico = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../docs/cad/evidence/dwg-oda-roundtrip.json"), "utf8"),
);
assert.ok(coberturaTecnicaDelOraculo(historico).cubiertos > 0);
assert.equal(comparar(historico).cubiertos, 0, "el reporte ODA histórico no acredita derechos ni herramientas");
assert.equal(leerBooleanoDelProducto(), false, "la exportación DWG sigue apagada");

const comparador = comparadorEsperado();
const validadorSha256 = sha("binario sintético del validador independiente");
const reporte = {
  generadoEn: "2026-09-23T12:00:00.000Z",
  disponibilidadEnProducto: false,
  conversor: {
    herramienta: "Validador sintético",
    version: "1.2.3",
    binarioSha256: validadorSha256,
    exitCode: 0,
    timeout: false,
  },
  casos: esperados.map((nombre) => {
    const dwgSha256 = sha(`DWG ${nombre}`);
    const dxfSha256 = sha(`DXF ${nombre}`);
    return {
      nombre,
      dwgSha256,
      oraculo: { consultado: true, convertido: true, validadorSha256, dxfSha256 },
      comparacion: {
        coincide: true,
        discrepancias: [],
        dwgSha256,
        dxfSha256,
        comparadorVersion: comparador.version,
        comparadorSha256: comparador.sha256,
      },
    };
  }),
};

assert.equal(coberturaTecnicaDelOraculo(reporte).cubiertos, esperados.length);
assert.equal(comparar(reporte).cubiertos, 0, "booleans técnicos solos no acreditan ningún caso");

reporte.acreditacion = {
  version: 1,
  derechos: {
    titular: "Titular sintético",
    licencia: "Permiso sintético explícito para esta prueba",
    fuente: "https://validator.example.invalid/terms",
    fuenteSha256: sha("términos sintéticos"),
    usoComercialPermitido: true,
    redistribucionDeResultadosPermitida: true,
    revisadoPor: "Revisor humano sintético",
    revisadoEn: "2026-09-23",
  },
};
assert.equal(comparar(reporte).cubiertos, 0, "derechos solos no acreditan el validador");

reporte.acreditacion.validador = {
  herramienta: reporte.conversor.herramienta,
  proveedor: "Proveedor independiente sintético",
  version: reporte.conversor.version,
  origen: "https://validator.example.invalid/download",
  binarioSha256: validadorSha256,
  independienteDeValle: true,
};
assert.equal(comparar(reporte).cubiertos, 0, "falta versión/hash del comparador");

reporte.acreditacion.comparador = comparador;
assert.equal(comparar(reporte).cubiertos, esperados.length, "la atestación completa permite contar los casos");

const mutar = (fn) => {
  const copia = structuredClone(reporte);
  fn(copia);
  return comparar(copia);
};
for (const [nombre, fn] of [
  ["sin permiso comercial", (r) => { r.acreditacion.derechos.usoComercialPermitido = false; }],
  ["sin redistribución", (r) => { r.acreditacion.derechos.redistribucionDeResultadosPermitida = false; }],
  ["licencia ambigua", (r) => { r.acreditacion.derechos.licencia = " "; }],
  ["licencia sin determinar", (r) => { r.acreditacion.derechos.licencia = "NOASSERTION"; }],
  ["sin fuente verificable", (r) => { r.acreditacion.derechos.fuenteSha256 = ""; }],
  ["sin revisión humana", (r) => { r.acreditacion.derechos.revisadoPor = ""; }],
  ["versión de acreditación ausente", (r) => { delete r.acreditacion.version; }],
  ["validador propio", (r) => { r.acreditacion.validador.independienteDeValle = false; }],
  ["procedencia ausente", (r) => { r.acreditacion.validador.origen = ""; }],
  ["versión de validador distinta", (r) => { r.acreditacion.validador.version = "0.0.0"; }],
  ["binario distinto", (r) => { r.acreditacion.validador.binarioSha256 = sha("otro binario"); }],
  ["comparador viejo", (r) => { r.acreditacion.comparador.sha256 = sha("fuente anterior"); }],
  ["versión de comparador vieja", (r) => { r.acreditacion.comparador.version = "v0"; }],
  ["conversor falló", (r) => { r.conversor.exitCode = 1; }],
]) {
  assert.equal(mutar(fn).cubiertos, 0, nombre);
}

for (const [nombre, fn] of [
  ["sin hash de DWG", (r) => { delete r.casos[0].dwgSha256; }],
  ["hash de DXF no cotejado", (r) => { r.casos[0].comparacion.dxfSha256 = sha("otro DXF"); }],
  ["sin vínculo al validador", (r) => { delete r.casos[0].oraculo.validadorSha256; }],
  ["sin vínculo al comparador", (r) => { r.casos[0].comparacion.comparadorSha256 = sha("otro comparador"); }],
  ["sin conversión", (r) => { r.casos[0].oraculo.convertido = false; }],
  ["sin consulta", (r) => { r.casos[0].oraculo.consultado = false; }],
  ["comparación falló", (r) => { r.casos[0].comparacion.coincide = false; }],
  ["discrepancia oculta", (r) => { r.casos[0].comparacion.discrepancias = ["fallo"]; }],
  ["nombre duplicado", (r) => { r.casos.push(structuredClone(r.casos[0])); }],
]) {
  assert.equal(mutar(fn).cubiertos, esperados.length - 1, nombre);
}

console.log(`check-oracle-evidence: sintético rojo→verde; ${esperados.length} casos y atestaciones comprobados`);
