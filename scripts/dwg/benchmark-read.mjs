#!/usr/bin/env node
/**
 * Benchmark de LECTURA del códec DWG — campaña 2026-08-21, OLA 5.3.
 *
 * Mide MB/s y objetos/s de `readAc1015Database` sobre los DWG reales del
 * corpus admitido, con la máquina declarada. REPORT-ONLY: no fija umbral ni
 * establece claim productivo alguno; es evidencia de magnitud para la
 * decisión de promoción (ADR-0009).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  DwgCorpusGateError,
  fetchAdmittedCorpus,
  loadCorpusPin,
  resolveCorpusSource,
} from "./corpus-consumer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const READER_DIST = path.join(
  REPO_ROOT, "packages", "dwg-codec", "dist", "reader", "ac1015-database-reader.js",
);
const OUT_FILE = path.join(REPO_ROOT, "docs", "cad", "evidence", "dwg-read-benchmark.json");
const ROUNDS = 5;

async function main() {
  const { readAc1015Database } = await import(pathToFileURL(READER_DIST).href);
  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    process.stderr.write("benchmark-read: sin origen de corpus configurado\n");
    process.exit(1);
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });
  const files = corpus.bundles
    .filter((b) => b.dwgVersion === "AC1015")
    .flatMap((b) =>
      b.artifacts
        .filter((a) => a.kind === "fixtures" && a.path.endsWith(".dwg"))
        .map((a) => ({ path: a.path, bytes: new Uint8Array(transport.readFile(pin.commit, a.path)) })),
    );

  // Calentamiento: una pasada completa fuera de la medición.
  let totalObjects = 0;
  for (const file of files) {
    const database = readAc1015Database(file.bytes);
    totalObjects +=
      database.modelSpaceEntities.length +
      database.blocks.reduce((sum, b) => sum + b.entities.length, 0) +
      database.layers.length +
      database.unsupported.length;
  }

  const totalBytes = files.reduce((sum, f) => sum + f.bytes.length, 0);
  const roundsMs = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const started = performance.now();
    for (const file of files) readAc1015Database(file.bytes);
    roundsMs.push(performance.now() - started);
  }
  const bestMs = Math.min(...roundsMs);
  const medianMs = [...roundsMs].sort((a, b) => a - b)[Math.floor(ROUNDS / 2)];

  const cpu = os.cpus()[0]?.model?.trim() ?? "desconocida";
  const report = {
    $schema: "urn:valle-design:schema:dwg-read-benchmark:v1",
    schemaVersion: 1,
    generadoPor: "node scripts/dwg/benchmark-read.mjs",
    generadoEn: new Date().toISOString(),
    alcance: "report-only; sin umbral ni claim productivo",
    corpus: { commit: corpus.commit, archivos: files.length, bytesTotales: totalBytes, objetosPorPasada: totalObjects },
    rondas: ROUNDS,
    rondasMs: roundsMs.map((v) => Number(v.toFixed(1))),
    mejorPasadaMs: Number(bestMs.toFixed(1)),
    medianaMs: Number(medianMs.toFixed(1)),
    mbPorSegundo: Number(((totalBytes / 1e6) / (medianMs / 1000)).toFixed(2)),
    objetosPorSegundo: Math.round(totalObjects / (medianMs / 1000)),
    maquinaDeclarada: `${cpu} (${os.cpus().length} hilos lógicos), ${(os.totalmem() / 1e9).toFixed(1)} GB RAM, ${os.type()} ${os.release()}, Node ${process.version}`,
  };
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `benchmark-read: ${files.length} archivos · ${(totalBytes / 1e6).toFixed(2)} MB · mediana ${report.medianaMs}ms · ${report.mbPorSegundo} MB/s · ${report.objetosPorSegundo} objetos/s\n`,
  );
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(`benchmark-read abortado por el gate del corpus: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
