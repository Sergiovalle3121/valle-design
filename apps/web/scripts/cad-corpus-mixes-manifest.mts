#!/usr/bin/env node
/**
 * Regenera `corpus-mixes-manifest.json` — el SHA versionado de cada mezcla.
 *
 * El manifiesto NO se escribe a mano. Se regenera con este script y el diff
 * resultante es la revisión: si alguien toca un generador, aquí se ve qué
 * corpus cambió y en cuánto cambió su recuento por tipo. Un manifiesto editado
 * a mano para «que pase el spec» es el fallo que este flujo existe para hacer
 * visible.
 *
 * Uso:
 *   npx tsx scripts/cad-corpus-mixes-manifest.mts            # imprime el diff
 *   npx tsx scripts/cad-corpus-mixes-manifest.mts --write    # lo escribe
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serializeCadDocument } from "../src/lib/cad/cad-document";
import {
  CAD_CORPUS_MIX_IDS,
  CAD_CORPUS_MIX_SIZES,
  CAD_CORPUS_MIXES,
  createCadCorpusMix,
} from "../src/lib/cad/benchmark/corpus-mixes";

const manifestPath = path.resolve(
  import.meta.dirname,
  "../src/lib/cad/benchmark/corpus-mixes-manifest.json",
);
const current = JSON.parse(readFileSync(manifestPath, "utf8"));

const corpora = [];
for (const mix of CAD_CORPUS_MIX_IDS) {
  for (const entities of CAD_CORPUS_MIX_SIZES) {
    const started = Date.now();
    const corpus = createCadCorpusMix({ mix, entities });
    const sha256 = createHash("sha256")
      .update(serializeCadDocument(corpus.document))
      .digest("hex");
    const entityMix = Object.fromEntries(
      Object.entries(corpus.entityMix).filter(([, count]) => count > 0),
    );
    corpora.push({ mix, entities, sha256, entityMix });
    process.stderr.write(
      `${mix.padEnd(14)} ${String(entities).padStart(7)}  ${sha256.slice(0, 12)}…  ${
        Date.now() - started
      } ms  ${JSON.stringify(entityMix)}\n`,
    );
  }
}

const next = {
  ...current,
  generator: {
    ...current.generator,
    mixes: Object.fromEntries(
      CAD_CORPUS_MIX_IDS.map((mix) => [
        mix,
        {
          seed: CAD_CORPUS_MIXES[mix].seed,
          cellSize: CAD_CORPUS_MIXES[mix].cellSize,
          title: CAD_CORPUS_MIXES[mix].title,
          stresses: CAD_CORPUS_MIXES[mix].stresses,
        },
      ]),
    ),
  },
  corpora,
};

const json = `${JSON.stringify(next, null, 2)}\n`;
if (process.argv.includes("--write")) {
  writeFileSync(manifestPath, json, "utf8");
  process.stderr.write(`\nEscrito ${manifestPath}\n`);
} else {
  process.stdout.write(json);
}
