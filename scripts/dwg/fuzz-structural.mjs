#!/usr/bin/env node
/**
 * Fuzzing ESTRUCTURAL del lector DWG — campaña 2026-08-21, OLA 5.1.
 *
 * A diferencia del fuzz determinista del paquete (bytes sintéticos desde
 * cero), este harness parte de los DWG REALES del corpus admitido y los
 * MUTA: flips de bits, truncaciones, tamaños mentirosos en el directorio,
 * páginas cegadas y colas recortadas. La pregunta que responde: ¿el lector
 * falla SIEMPRE cerrado y tipado ante un archivo casi-válido hostil?
 *
 * Invariantes duros (fracaso del harness si se rompen):
 * - cero excepciones que no sean DwgParseError con código tipado;
 * - cero DWG_INTERNAL_ERROR;
 * - cero cuelgues (presupuesto de pared del propio lector + medición aquí);
 * - determinista: misma semilla → mismas mutaciones → mismos resultados.
 *
 * Toda mutación queda descrita por su RECETA (archivo, operación, semilla),
 * así que cualquier fallo es reproducible sin almacenar bytes mutados.
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
  REPO_ROOT,
  "packages",
  "dwg-codec",
  "dist",
  "reader",
  "ac1015-database-reader.js",
);
const OUT_FILE = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-structural-fuzz.json",
);

const SEED = "valle-dwg-structural-fuzz-2026-08-21-v1";
const MUTATIONS_PER_FILE = 48;

/** xorshift32 sembrado por cadena — determinista y sin Math.random. */
function createRng(seedText) {
  let state = 0;
  for (const ch of seedText) state = (state * 31 + ch.codePointAt(0)) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/** Aplica la mutación `index` (determinista) y devuelve {bytes, receta}. */
function mutate(original, fileName, index) {
  const rng = createRng(`${SEED}:${fileName}:${index}`);
  const bytes = new Uint8Array(original);
  const pick = Math.floor(rng() * 6);
  const at = (max) => Math.floor(rng() * max);
  switch (pick) {
    case 0: {
      // Flips de bits dispersos.
      const flips = 1 + at(16);
      const positions = [];
      for (let i = 0; i < flips; i += 1) {
        const position = at(bytes.length);
        const bit = at(8);
        bytes[position] ^= 1 << bit;
        positions.push(position);
      }
      return { bytes, recipe: { op: "bit-flips", flips, positions } };
    }
    case 1: {
      // Truncación en un punto arbitrario.
      const cut = at(bytes.length);
      return { bytes: bytes.slice(0, cut), recipe: { op: "truncate", cut } };
    }
    case 2: {
      // Tamaño mentiroso en el directorio de secciones (offset 0x19+9k+5..8).
      const record = at(6);
      const offset = 0x19 + record * 9 + 5 + at(4);
      if (offset < bytes.length) bytes[offset] ^= 0xff;
      return { bytes, recipe: { op: "directory-size-lie", record, offset } };
    }
    case 3: {
      // Página cegada: un tramo de 64-1024 bytes a un valor fijo.
      const start = at(bytes.length);
      const length = Math.min(64 + at(960), bytes.length - start);
      const value = at(256);
      bytes.fill(value, start, start + length);
      return { bytes, recipe: { op: "blank-run", start, length, value } };
    }
    case 4: {
      // Corrupción concentrada en el mapa de objetos (último 1%).
      const zone = Math.max(0, bytes.length - Math.floor(bytes.length / 100));
      const flips = 1 + at(8);
      for (let i = 0; i < flips; i += 1) {
        const position = zone + at(bytes.length - zone);
        bytes[position] ^= 1 << at(8);
      }
      return { bytes, recipe: { op: "map-zone-flips", zone, flips } };
    }
    default: {
      // Cola duplicada: los últimos N bytes repetidos al final.
      const extra = 1 + at(64);
      const grown = new Uint8Array(bytes.length + extra);
      grown.set(bytes);
      grown.set(bytes.slice(bytes.length - extra), bytes.length);
      return { bytes: grown, recipe: { op: "tail-append", extra } };
    }
  }
}

async function main() {
  if (!fs.existsSync(READER_DIST)) {
    process.stderr.write("fuzz-structural: falta dist del codec\n");
    process.exit(1);
  }
  const { readAc1015Database } = await import(pathToFileURL(READER_DIST).href);

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    process.stderr.write("fuzz-structural: sin origen de corpus configurado\n");
    process.exit(1);
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });
  const fixtures = corpus.bundles
    .filter((bundle) => bundle.dwgVersion === "AC1015")
    .flatMap((bundle) =>
      bundle.artifacts
        .filter((a) => a.kind === "fixtures" && a.path.endsWith(".dwg"))
        .map((a) => ({ bundle: bundle.id, path: a.path })),
    );

  const histogram = {};
  const failures = [];
  let executions = 0;
  let openedIntact = 0;
  let maxCaseMs = 0;
  const started = performance.now();

  for (const fixture of fixtures) {
    const original = new Uint8Array(transport.readFile(pin.commit, fixture.path));
    // El archivo intacto DEBE abrir: si no, el harness está midiendo otra cosa.
    try {
      readAc1015Database(original);
      openedIntact += 1;
    } catch (error) {
      failures.push({ fixture: fixture.path, recipe: { op: "none" }, kind: "intact-file-failed", message: String(error).slice(0, 300) });
      continue;
    }
    for (let index = 0; index < MUTATIONS_PER_FILE; index += 1) {
      const { bytes, recipe } = mutate(original, path.basename(fixture.path), index);
      executions += 1;
      const caseStart = performance.now();
      let outcome;
      try {
        readAc1015Database(bytes);
        outcome = "ok";
      } catch (error) {
        const code = error?.detail?.code;
        if (typeof code === "string" && code.startsWith("DWG_") && code !== "DWG_INTERNAL_ERROR") {
          outcome = `error:${code}`;
        } else {
          outcome = "UNTYPED";
          failures.push({
            fixture: fixture.path,
            mutationIndex: index,
            recipe,
            kind: code === "DWG_INTERNAL_ERROR" ? "internal-error" : "untyped-exception",
            message: String(error?.detail?.message ?? error?.message ?? error).slice(0, 300),
          });
        }
      }
      const caseMs = performance.now() - caseStart;
      maxCaseMs = Math.max(maxCaseMs, caseMs);
      if (caseMs > 10_000) {
        failures.push({ fixture: fixture.path, mutationIndex: index, recipe, kind: "slow-case", caseMs });
      }
      histogram[outcome] = (histogram[outcome] ?? 0) + 1;
    }
  }

  const report = {
    $schema: "urn:valle-design:schema:dwg-structural-fuzz:v1",
    schemaVersion: 1,
    generadoPor: "node scripts/dwg/fuzz-structural.mjs",
    generadoEn: new Date().toISOString(),
    seed: SEED,
    corpus: { commit: corpus.commit, archivosAc1015: fixtures.length, abrenIntactos: openedIntact },
    mutacionesPorArchivo: MUTATIONS_PER_FILE,
    ejecuciones: executions,
    histograma: Object.fromEntries(Object.entries(histogram).sort()),
    fallosDelInvariante: failures,
    peorCasoMs: Number(maxCaseMs.toFixed(1)),
    duracionTotalMs: Number((performance.now() - started).toFixed(1)),
    maquina: `${os.cpus()[0]?.model?.trim() ?? "?"} (${os.cpus().length} hilos), ${(os.totalmem() / 1e9).toFixed(1)} GB, ${os.type()} ${os.release()}`,
    veredicto:
      failures.length === 0
        ? `INVARIANTES INTACTOS: ${executions} mutaciones sobre ${fixtures.length} DWG reales — cero excepciones sin tipar, cero DWG_INTERNAL_ERROR, cero cuelgues.`
        : `${failures.length} FALLO(S) DE INVARIANTE — ver fallosDelInvariante; cada receta es reproducible con la semilla.`,
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `fuzz-structural: ${executions} mutaciones · ${Object.entries(report.histograma)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")} · fallos=${failures.length} · peor caso ${report.peorCasoMs}ms\n${report.veredicto}\n`,
  );
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(`fuzz-structural abortado por el gate del corpus: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
