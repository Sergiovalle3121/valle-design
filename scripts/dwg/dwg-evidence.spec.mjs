#!/usr/bin/env node
/**
 * Spec de los generadores de evidencia DWG.
 *
 * Un generador que siempre escribe cero es tan inútil como uno que siempre
 * escribe diez: el primero no miente hoy, pero tampoco servirá el día del
 * bundle, y nadie se daría cuenta hasta ese día. Por eso aquí se prueban las
 * DOS direcciones:
 *
 * - en vacío dice cero, y lo dice con todas las letras;
 * - con corpus pero sin laboratorio, sigue diciendo cero (el corpus solo no
 *   promueve nada);
 * - con laboratorio pero sin corpus, sigue diciendo cero (el laboratorio solo
 *   tampoco: sería el reader de Valle como único oráculo);
 * - con las dos mitades, promueve de verdad.
 *
 * Ese cuarto caso es el que demuestra que el cero de hoy es un RESULTADO y no
 * una constante escrita a mano.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DECODER_MATRIX_FILE,
  ROUNDTRIP_FILE,
  buildDecoderMatrix,
  buildRoundtripEvidence,
  generateDwgEvidence,
  readLabCapabilities,
  readLabObjectTypes,
  readLabGeometryKinds,
  stable,
} from "./dwg-evidence.mjs";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const objectTypes = readLabObjectTypes();
const geometryKinds = readLabGeometryKinds();

const corpusVacio = {
  estado: "unavailable",
  origen: "https://example.invalid/corpus.git",
  commitFijado: "0".repeat(40),
  indiceSha256: null,
  bundlesAdmitidos: 0,
  validacionesIndependientes: 0,
  oraculosIndependientes: 0,
  fixtures: 0,
  versionesCubiertas: [],
};
const corpusCompleto = {
  ...corpusVacio,
  estado: "verified",
  indiceSha256: "a".repeat(64),
  bundlesAdmitidos: 1,
  validacionesIndependientes: 2,
  oraculosIndependientes: 2,
  fixtures: 1,
  versionesCubiertas: ["AC1015"],
};
const corpusConUnSoloOraculo = { ...corpusCompleto, validacionesIndependientes: 1 };

const laboratorioDeHoy = new Map([
  ["signatureDetection", "supported"],
  ["entityImport", "unsupported"],
  ["dwgExport", "experimental-lab-writer"],
  ["roundTrip", "experimental-lab-own-corpus"],
  ["productionAvailable", "false"],
]);
const laboratorioPromovible = new Map([
  ["signatureDetection", "supported"],
  ["entityImport", "supported"],
  ["dwgExport", "supported"],
  ["roundTrip", "supported"],
  ["productionAvailable", "false"],
]);

const matriz = (capabilities, corpus, corpusValidation = null) =>
  buildDecoderMatrix({
    capabilities,
    objectTypes,
    geometryKinds,
    corpus,
    corpusValidation,
  });

/**
 * Una medición diferencial SINTÉTICA donde todo comparó limpio: cada clave
 * de verificación posible aparece con cero discrepancias. Sirve para probar
 * el mecanismo (medición → verificado) sin depender del árbol.
 */
const filaLimpia = {
  esperado: 1,
  leidoCorrecto: 1,
  geometriaDistinta: 0,
  faltante: 0,
  inesperado: 0,
};
const medicionTodaLimpia = {
  resumen: { noAbiertos: 0 },
  matrizEntidades: Object.fromEntries([
    ...objectTypes.map((t) => [t.tipo.toLowerCase(), filaLimpia]),
    ["dimension", filaLimpia],
    ["face3d", filaLimpia],
    ["lwpolyline", filaLimpia],
    ["polyline3d", filaLimpia],
    ["polymesh", filaLimpia],
    ["polyfaceMesh", filaLimpia],
  ]),
  archivos: [
    {
      abre: true,
      capas: { faltantes: [], coloresDistintos: [] },
      bloques: { porBloque: { X: { encontrado: true } } },
      tablas: {
        ltype: { esperados: ["A"], faltantes: [], trazosDistintos: [] },
        style: { esperados: ["A"], faltantes: [] },
        dimstyle: { esperados: ["A"], faltantes: [] },
        mlinestyle: { esperados: ["A"], faltantes: [] },
      },
    },
  ],
};

// --- 1. el árbol de HOY es COHERENTE con sus mediciones ----------------------
// Desde la campaña 2026-08-21 el árbol lleva mediciones reales commiteadas
// (dwg-corpus-validation.json, dwg-oda-roundtrip.json): las cifras publicadas
// deben SALIR de ellas, nunca de estados de texto ni de constantes a mano.
const hoy = generateDwgEvidence();
const medicionOda = leerJsonSiExiste("docs/cad/evidence/dwg-oda-roundtrip.json");
eq(
  hoy.roundtrip.resumen.roundTripsVerificadosPorLectorExterno,
  medicionOda?.resumen?.roundTripsVerificadosPorLectorExterno ?? 0,
  "los round-trips externos publicados son exactamente los de la medición del oráculo",
);
eq(
  hoy.roundtrip.resumen.lectoresExternosAutorizados,
  medicionOda?.resumen?.lectoresExternosAutorizados?.length ?? 0,
  "los lectores externos publicados son exactamente los medidos",
);
eq(
  hoy.decoderMatrix.resumen.tiposVerificadosIndependientemente,
  hoy.decoderMatrix.entidades.filter((e) => e.verificadoIndependientemente).length,
  "el resumen cuadra con la lista tipo a tipo",
);
ok(
  hoy.decoderMatrix.entidades.every(
    (e) => !e.verificadoIndependientemente || e.claveDeVerificacion !== null,
  ),
  "ningún tipo se declara verificado sin su clave de verificación medida",
);
eq(hoy.decoderMatrix.disponibilidadEnProducto, false, "el producto no ofrece DWG");
eq(hoy.roundtrip.disponibilidadEnProducto, false, "el producto no exporta DWG");
ok(
  hoy.decoderMatrix.resumen.tiposDecodificadosEnLaboratorio > 0,
  "la matriz sí enumera lo que el laboratorio decodifica",
);
ok(
  hoy.decoderMatrix.entidades.every((e) => e.decodificadoEnLaboratorio),
  "cada tipo del laboratorio queda enumerado",
);
ok(
  !hoy.decoderMatrix.capacidades.some((c) => c.id === "productionAvailable"),
  "la disponibilidad en producto no es una casilla más de la lista de capacidades",
);

function leerJsonSiExiste(ruta) {
  try {
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}

// --- 2. el corpus SOLO no promueve nada -------------------------------------
const soloCorpus = matriz(laboratorioDeHoy, corpusCompleto);
eq(
  soloCorpus.resumen.tiposVerificadosIndependientemente,
  0,
  "con el laboratorio declarando entityImport unsupported, ningún tipo se verifica",
);
eq(
  soloCorpus.capacidades.find((c) => c.id === "entityImport").promovida,
  false,
  "un bundle no promueve una capacidad que el laboratorio no sostiene",
);
eq(
  buildRoundtripEvidence({ capabilities: laboratorioDeHoy, corpus: corpusCompleto }).resumen
    .roundTripsVerificadosPorLectorExterno,
  0,
  "un writer experimental no produce round-trips verificados aunque haya corpus",
);

// --- 3. el laboratorio SOLO tampoco -----------------------------------------
const soloLaboratorio = matriz(laboratorioPromovible, corpusVacio);
eq(
  soloLaboratorio.resumen.capacidadesPromovidas,
  0,
  "sin corpus independiente, el laboratorio es su propio oráculo y no promueve",
);
ok(
  soloLaboratorio.capacidades
    .find((c) => c.id === "entityImport")
    .bloqueos.includes("cero bundles admitidos en el corpus independiente"),
  "y el bloqueo dice exactamente qué falta",
);
eq(
  matriz(laboratorioPromovible, corpusConUnSoloOraculo).resumen.capacidadesPromovidas,
  0,
  "una sola validación no son dos validaciones independientes",
);

// --- 4. con las dos mitades, promueve DE VERDAD ------------------------------
const promovido = matriz(laboratorioPromovible, corpusCompleto, medicionTodaLimpia);
ok(
  promovido.resumen.capacidadesPromovidas > 0,
  "el cero de hoy es un resultado: con laboratorio y corpus, la matriz promueve",
);
eq(
  promovido.resumen.tiposVerificadosIndependientemente,
  objectTypes.length,
  "con la medición limpia, TODOS los tipos pasan a contar como verificados",
);
eq(
  matriz(laboratorioPromovible, corpusCompleto).resumen
    .tiposVerificadosIndependientemente,
  0,
  "sin medición diferencial, ni el laboratorio ni el corpus verifican un tipo",
);
const roundtripPromovido = buildRoundtripEvidence({
  capabilities: laboratorioPromovible,
  corpus: corpusCompleto,
});
eq(
  roundtripPromovido.resumen.roundTripsVerificadosPorLectorExterno,
  1,
  "y el round-trip pasa a contar el lector externo",
);
eq(
  roundtripPromovido.resumen.roundTripsDeLaboratorio,
  1,
  "el round-trip propio sigue contándose aparte, nunca sumado al externo",
);

// --- 5. los artefactos del disco son los que el árbol genera hoy -------------
for (const [file, generated] of [
  [DECODER_MATRIX_FILE, hoy.decoderMatrix],
  [ROUNDTRIP_FILE, hoy.roundtrip],
]) {
  ok(fs.existsSync(file), `el artefacto ${file} existe`);
  eq(
    stable(JSON.parse(fs.readFileSync(file, "utf8"))),
    stable(generated),
    "el artefacto del disco coincide con lo que el árbol sostiene hoy",
  );
}

// --- 6. la evidencia no puede convertirse en un claim -----------------------
for (const artifact of [hoy.decoderMatrix, hoy.roundtrip]) {
  assert.doesNotMatch(
    JSON.stringify(artifact),
    /compatible con DWG|soporte DWG|reemplaza(?:r)? a AutoCAD|sustituye a AutoCAD/iu,
    "un artefacto de evidencia no puede colar un claim que el producto no cumple",
  );
  checks += 1;
}

// --- 7. el laboratorio sigue siendo la única fuente de claims ---------------
const capacidades = readLabCapabilities();
ok(capacidades.size >= 8, "la matriz del laboratorio se lee entera");
eq(capacidades.get("productionAvailable"), "false", "y sigue diciendo que el producto no lo ofrece");

console.log(
  `dwg-evidence: ${checks} comprobaciones · cero en vacío · promueve cuando hay laboratorio Y corpus`,
);
