#!/usr/bin/env node
/**
 * Publica `docs/cad/evidence/sheet-set-publish.json`.
 *
 * Corre `sheet-set-publish-probe.mts` — que construye un juego de siete
 * láminas, lo publica con `publishCadSheetSet` (el mismo motor que usa el
 * comando `PUBLISH`) y mide el resultado LEYENDO LOS BYTES del PDF con
 * `pdf-measure.ts` — y vuelca lo que midió. Nada de lo que sale aquí se
 * teclea a mano.
 *
 * ## Por qué UNA sola corrida y no una mediana de tres
 *
 * `plot-fidelity-evidence.mjs` corre tres veces en procesos separados porque
 * mide TIEMPO como cifra que se compara entre corridas del producto. Esta
 * sonda declara los milisegundos con el mismo criterio —máquina citada,
 * método declarado— pero con una sola corrida: es la evidencia de CIERRE de
 * esta campaña, no un SLO que otra ola vaya a recalibrar. Si en el futuro
 * PUBLISH necesita un presupuesto de tiempo con gate propio, ésa es la ocasión
 * de pasar a tres corridas; hacerlo hoy sin ese gate sería medir por medir.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(here, "sheet-set-publish-probe.mts");
const output = path.join(root, "docs/cad/evidence/sheet-set-publish.json");

function runProbe() {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const stdout = execFileSync(process.execPath, [tsx, probe], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  return JSON.parse(stdout);
}

function environment() {
  const cpus = os.cpus();
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpus[0]?.model ?? "desconocido",
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    declaredMachine:
      `${cpus[0]?.model?.trim() ?? "CPU desconocida"} (${cpus.length} hilos lógicos), ` +
      `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}`,
  };
}

const startedAt = new Date().toISOString();
const probeResult = runProbe();
const finishedAt = new Date().toISOString();

const evidence = {
  $schema: "urn:valle-design:schema:cad-sheet-set-publish-evidence:v1",
  schemaVersion: 1,
  evidenceId: "valle-design-sheet-set-publish-v1",
  startedAt,
  finishedAt,
  enforcement: "report-only",
  enforcementRationale:
    "El PDF resultante lo verifica sheet-set-cover.spec.ts en cada corrida de npm test (portada, numeración, " +
    "y que la lámina y la portada dicen lo mismo). Este artefacto añade el juego de siete láminas y la " +
    "escala medida en la lámina 7 concretamente, más los milisegundos de una corrida en la máquina " +
    "declarada — no fija un presupuesto de CI.",
  environment: environment(),
  method: {
    runs: 1,
    generator: "scripts/cad/sheet-set-publish-evidence.mjs + scripts/cad/sheet-set-publish-probe.mts",
    everyNumberReadFrom:
      "los bytes del PDF que produjo publishCadSheetSet: /MediaBox y las coordenadas de trazo del flujo " +
      "de contenido de cada página, con measureCadPdf. Ninguna cifra procede de preguntarle al código qué " +
      "creía estar haciendo.",
  },
  sheetSet: {
    sheetCount: probeResult.sheetCount,
    pageCount: probeResult.pageCount,
    hasCover: probeResult.hasCover,
    fileBytes: probeResult.fileBytes,
    wallLengthMm: probeResult.wallLengthMm,
    scale: probeResult.scale,
    expectedPrintedMm: probeResult.expectedPrintedMm,
  },
  timing: {
    publishMs: probeResult.publishMs,
    msPerPage: probeResult.msPerPage,
    note: "publishCadSheetSet completo: construir el plan, resolver los cajetines y emitir el PDF de las ocho páginas.",
  },
  scaleFidelity: {
    sheetSeven: probeResult.sheetSevenMeasurement,
    worstCase: probeResult.worstCase,
    perSheet: probeResult.perSheet,
    unreadable: probeResult.unreadable,
    verdict:
      probeResult.worstCase.errorMm <= 1e-3
        ? "el error de escala peor caso está muy por debajo de la resolución de cualquier trazadora (0,1 mm)"
        : "el error de escala peor caso EXCEDE el criterio de 1e-3 mm — investigar antes de anunciar precisión",
  },
  scope: {
    measured: [
      "páginas emitidas por un juego de siete láminas más portada",
      "escala impresa de un muro de 3,5 m en la lámina 7, y en las siete láminas, leída del PDF",
      "milisegundos de una publicación completa, en la máquina declarada arriba",
    ],
    notMeasured: [
      "el paso de los bytes a papel: visor, controlador de impresión, trazadora y tinta",
      "xrefs, imágenes ni fuentes incrustadas: el documento de la sonda no las usa",
      "publicación con más de un documento de origen: la sonda usa un único documento con siete presentaciones",
    ],
  },
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(`Escrito ${path.relative(root, output)}`);
console.log(
  `  ${evidence.sheetSet.sheetCount} lámina(s), ${evidence.sheetSet.pageCount} página(s), ` +
    `error de escala peor caso ${evidence.scaleFidelity.worstCase.errorMm.toExponential(3)} mm`,
);
console.log(
  `  ${evidence.timing.publishMs.toFixed(1)} ms totales, ${evidence.timing.msPerPage.toFixed(2)} ms/página`,
);
