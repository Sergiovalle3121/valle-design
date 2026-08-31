#!/usr/bin/env node
/**
 * REPARTO POR ETAPA sobre una MEZCLA de `corpus-mixes.ts` (architecture,
 * mechanical, …), no sobre el corpus LINE/CIRCLE/ARC de siempre.
 *
 * ## Por qué existe aparte de `cad-render-benchmark.mts --stages`
 *
 * Ese script SÍ sabe pedir una mezcla (`--mix`), pero además mide el camino
 * ANTERIOR completo (`measureCadLegacyPipeline`) y la fuga de memoria (varios
 * ciclos de abrir/cerrar). Para `architecture@100k` eso es justo lo que
 * `browser-harness.ts` ya documenta como un corte por RELOJ, no por memoria:
 * 34.000 INSERT expandiendo su bloque de uno en uno más 10.000 MTEXT con su
 * propio lienzo pasan de varios MINUTOS por reconstrucción. Medir eso aquí
 * respondería una pregunta que este script no viene a hacer —«¿cuánto tarda
 * el camino que ya se va a borrar?»— y dejaría sin publicar la que sí importa
 * por tardar demasiado en llegar a ella.
 *
 * Este script mide SÓLO el camino nuevo, con la misma instrumentación por
 * etapa que `render-stage-profile.ts` expone, y nada más.
 *
 * Uso:
 *   npx tsx scripts/cad-render-stage-profile-mix.mts --mix architecture --entities 100000 --output ../../docs/cad/evidence/render-stage-architecture-100k.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHeapStatistics } from "node:v8";
import {
  CAD_CORPUS_MIX_IDS,
  createCadCorpusMix,
  type CadCorpusMixId,
} from "../src/lib/cad/benchmark/corpus-mixes";
import { cadDocumentBounds, createCadRenderScenario } from "../src/lib/cad/benchmark/scenario";
import {
  CAD_RENDER_BROWSER_FRAME_MS_SWIFTSHADER,
  profileCadRenderStages,
  type CadRenderStageMeasurement,
} from "../src/lib/cad/render/render-stage-profile";

interface CliOptions {
  mix: CadCorpusMixId;
  entities: number;
  panStops: number;
  output?: string;
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    mix: "architecture",
    entities: 100_000,
    panStops: 12,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mix") {
      const mix = argv[++index] as CadCorpusMixId | undefined;
      if (!mix || !CAD_CORPUS_MIX_IDS.includes(mix))
        throw new Error(`--mix debe ser una de: ${CAD_CORPUS_MIX_IDS.join(", ")}.`);
      options.mix = mix;
    } else if (argument === "--entities") {
      options.entities = Number.parseInt(argv[++index] ?? "", 10);
    } else if (argument === "--pan-stops") {
      options.panStops = Number.parseInt(argv[++index] ?? "", 10);
    } else if (argument === "--output") {
      options.output = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isSafeInteger(options.entities) || options.entities < 1)
    throw new Error("--entities must be a positive integer.");
  return options;
}

const options = parseCli(process.argv.slice(2));
const startedAt = new Date().toISOString();
const corpus = createCadCorpusMix({ mix: options.mix, entities: options.entities });
const bounds = cadDocumentBounds(corpus.nativeEntities, corpus.document);
const scenario = createCadRenderScenario(bounds, options.panStops);

const stageRun = (
  overrides: Partial<Parameters<typeof profileCadRenderStages>[0]> & {
    offThread: "sync" | "offthread";
    reconcile: boolean;
  },
) =>
  profileCadRenderStages({
    entities: corpus.nativeEntities,
    drawOrderIds: corpus.document.modelSpace.entityIds,
    scenario,
    document: corpus.document,
    ...overrides,
  });

// Mismos tres pares que `cad-render-benchmark.mts --stages`: ver su
// comentario para por qué son tres y no uno. Aquí interesa sobre todo el [0]
// —sync sin reconciliar, reloj real— porque es el que aísla el coste de CPU
// del pipeline sin mezclarlo con la cadencia de pantalla inyectada.
const runs: CadRenderStageMeasurement[] = [
  await stageRun({ offThread: "sync", reconcile: false }),
  await stageRun({ offThread: "sync", reconcile: true }),
  await stageRun({ offThread: "offthread", reconcile: true }),
];

const cpus = os.cpus();
const evidence = {
  $schema: "urn:valle-design:schema:cad-render-stage-profile-evidence:v1",
  schemaVersion: 1,
  benchmarkId: "valle-design-cad-render-stage-profile-mix-v1",
  startedAt,
  finishedAt: new Date().toISOString(),
  note:
    "Medido con la instrumentación de render-stage-profile.ts ENCENDIDA: dos relojes por punto de medida. No es comparable con cad-render-benchmark-100k.json ni con ninguna línea base versionada — sirve para REPARTIR el coste entre etapas, no para juzgarlo contra un presupuesto. No mide el camino ANTERIOR (ver la cabecera del script) ni GPU, cuadros de navegador o FPS.",
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: cpus[0]?.model ?? "unknown",
    logicalCpuCount: os.availableParallelism(),
    totalMemoryBytes: os.totalmem(),
    heapLimitBytes: getHeapStatistics().heap_size_limit,
    declaredMachine:
      "Contenedor cloud de esta sesión (Claude Code on the web), NO el portátil Ryzen 5 5500U con GPU real de `docs/cad/evidence/browser-slo-100k.json`. Sin GPU real: esta corrida es CPU de Node, no reemplaza esa evidencia de navegador ni se compara con ella número a número. Ver la regla 4 de la matriz competitiva.",
  },
  corpus: {
    mix: options.mix,
    entities: options.entities,
    entityMix: corpus.entityMix,
    bounds,
  },
  scenario: {
    panStops: scenario.pan.length,
    initialPixelsPerUnit: scenario.initial.pixelsPerUnit,
    zoomPixelsPerUnit: scenario.zoom.pixelsPerUnit,
  },
  browserFrameMsSource:
    "docs/cad/evidence/browser-slo-100k.json · architecture 100k camino nuevo — ver el propio archivo, no recalculado aquí",
  browserFrameMs: CAD_RENDER_BROWSER_FRAME_MS_SWIFTSHADER,
  runs,
};

const json = `${JSON.stringify(evidence, null, 2)}\n`;
if (options.output) {
  const resolved = path.resolve(options.output);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, json, "utf8");
  process.stderr.write(`CAD render stage profile evidence: ${resolved}\n`);
} else {
  process.stdout.write(json);
}

const stageNames = [
  "tessellate",
  "batchPush",
  "textRequest",
  "viewDiff",
  "tileEnqueue",
  "offThreadCollect",
  "offThreadSeed",
  "visibleBatches",
  "spatialIndex",
  "insertExpand",
] as const;

process.stderr.write(
  [
    "",
    `CAD render · reparto por etapa · mezcla ${options.mix} · ${options.entities} entidades`,
    `  etapa             ${runs.map((_, index) => `       [${index}]`).join("")}`,
    ...stageNames.map(
      (stage) =>
        `  ${stage.padEnd(18)}${runs.map((run) => String(run.stages.ms[stage]).padStart(11)).join("")}`,
    ),
    `  ${"TOTAL explicado".padEnd(18)}${runs.map((run) => String(run.stageTotalMs).padStart(11)).join("")}`,
    `  ${"firstDetailMs".padEnd(18)}${runs.map((run) => String(run.firstDetailMs).padStart(11)).join("")}`,
    "",
  ].join("\n"),
);
