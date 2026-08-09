#!/usr/bin/env node
/**
 * Calibra y ESCRIBE la línea base del pipeline de render.
 *
 * ## Por qué una calibración y no un número a ojo
 *
 * El aviso está escrito en el propio repositorio: los goldens ya son sensibles
 * a la carga de máquina, y un gate de tiempo mal calibrado falla de forma
 * intermitente hasta que alguien lo desactiva. Un gate desactivado es peor que
 * no tenerlo.
 *
 * Así que el presupuesto no sale de UNA corrida: sale de N, y se fija sobre la
 * PEOR observada multiplicada por un margen. La media sería el número
 * equivocado —la mitad de las corridas caerían por encima— y la mediana
 * también. Las muestras completas viajan al manifiesto para que el número se
 * pueda discutir con datos y no con opiniones.
 *
 * La primera corrida se DESCARTA: carga código, infla arenas de V8 y calienta
 * cachés. Incluirla no mide el pipeline, mide el arranque del proceso.
 *
 * ## Y el entorno al lado
 *
 * «Un número sin su máquina no es una línea base, es una anécdota.» El perfil
 * guarda CPU, memoria, Node y V8, más una guarda de hardware: por debajo de
 * ella el gate degrada los TIEMPOS a registrado y mantiene las INVARIANTES,
 * que no dependen de la máquina.
 *
 * Uso:
 *   npm run benchmark:cad:baseline --workspace=web
 *   npm run benchmark:cad:baseline --workspace=web -- --runs 7 --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHeapStatistics } from "node:v8";
import { createCadBenchmarkCorpus } from "../src/lib/cad/benchmark/corpus";
import {
  cadDocumentBounds,
  createCadRenderScenario,
} from "../src/lib/cad/benchmark/scenario";
import {
  measureCadLegacyPipeline,
  measureCadNextPipeline,
  measureCadRenderLeak,
} from "../src/lib/cad/render/render-benchmark";
import type {
  CadRenderBaselineManifest,
  CadRenderBudgetProfile,
} from "../src/lib/cad/benchmark/render-budget";

interface ProfileSpec {
  id: string;
  entities: number;
  panStops: number;
  leakCycles: number;
  enforcementRationale: string;
}

/**
 * Dos perfiles y dos trabajos distintos.
 *
 * `gate-25k` corre DENTRO de `npm test` (vía `render-gate.spec.ts`), que es lo
 * que hace que este presupuesto bloquee de verdad en CI sin tocar el workflow:
 * el paso «Web specs (tsx)» ya existe. 25.000 entidades es el tamaño que cabe
 * en el presupuesto por spec dejando margen de sobra.
 *
 * `reference-100k` es el tamaño de la evidencia publicada y se corre a mano con
 * `npm run benchmark:cad:render`. Comparte evaluador, así que el número de CI y
 * el de la evidencia se juzgan con las mismas reglas.
 */
const PROFILES: ProfileSpec[] = [
  {
    id: "gate-25k",
    entities: 25_000,
    panStops: 6,
    leakCycles: 3,
    enforcementRationale:
      "El benchmark de render ya cumplió su versión en report-only y tiene evidencia publicada; con línea base versionada debajo pasa a BLOQUEANTE. Corre dentro de npm test para bloquear en CI sin tocar el workflow.",
  },
  {
    id: "reference-100k",
    entities: 100_000,
    panStops: 12,
    leakCycles: 3,
    enforcementRationale:
      "Perfil de referencia a 100.000 entidades: el mismo tamaño que la evidencia publicada, para que el número que se enseña y el que bloquea se juzguen con las mismas reglas. El benchmark cumplió su versión en report-only y pasa a BLOQUEANTE con esta línea base debajo.",
  },
];

function parseCli(argv: string[]): { runs: number; write: boolean; only: string | null } {
  const options = { runs: 5, write: false, only: null as string | null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--runs") options.runs = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--write") options.write = true;
    else if (argument === "--profile") options.only = argv[++index] ?? null;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isSafeInteger(options.runs) || options.runs < 3)
    throw new Error("--runs debe ser >= 3: con menos no hay peor caso que valga.");
  return options;
}

const options = parseCli(process.argv.slice(2));
const gcAvailable = typeof (globalThis as { gc?: () => void }).gc === "function";
if (!gcAvailable)
  process.stderr.write(
    "AVISO: sin --expose-gc. El perfil se escribirá con leakHeapGrowthMb en null: una fuga presupuestada sobre basura sin recoger es un rojo aleatorio.\n",
  );

const cpus = os.cpus();
const environment = {
  node: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  architecture: process.arch,
  cpuModel: cpus[0]?.model ?? "unknown",
  logicalCpuCount: cpus.length,
  totalMemoryBytes: os.totalmem(),
  heapLimitBytes: getHeapStatistics().heap_size_limit,
  exposedGc: gcAvailable,
};

/**
 * Margen sobre la PEOR corrida. 2,5× parece mucho y no lo es: entre la máquina
 * de calibración y un runner compartido de CI hay factores de 2 en trabajo de
 * CPU puro, y el coste de un falso rojo —que alguien desactive el gate— es
 * mucho mayor que el de dejar pasar una regresión del 40%. Una regresión de
 * verdad en este pipeline no es del 40%: es de un orden de magnitud, porque el
 * modo de fallo es volver a reconstruirlo todo en cada cuadro.
 */
const MARGIN_FACTOR = 2.5;

/**
 * SUELOS absolutos, y sin ellos la calibración se dispara sola en el pie.
 *
 * Una máquina de calibración ociosa asienta el zoom en 3,4 ms. Multiplicado por
 * el margen sale un presupuesto de 11 ms — y un presupuesto de 11 ms en un
 * runner compartido no mide el pipeline: mide si otro job estaba escribiendo en
 * disco en ese instante. Ése es exactamente el gate intermitente que acaba
 * desactivado.
 *
 * Los suelos se eligen contra el MODO DE FALLO, no contra la comodidad. La
 * regresión que este pipeline puede sufrir es volver a reconstruirlo todo en
 * cada cuadro, y eso está medido: el camino anterior da `panFrameP95Ms` 64 en
 * el mismo corpus. Con suelo 40 se caza con holgura de 1,6× y se deja 5× de
 * margen sobre la peor corrida observada (8 ms). Un suelo de 5 ms sería más
 * "sensible" sobre el papel y en la práctica sólo produciría rojos que nadie
 * podría reproducir.
 */
const FLOOR_MS: Record<string, number> = {
  nextFirstDetailMs: 250,
  nextZoomSettleMs: 200,
  nextPanFrameP95Ms: 40,
  nextPanFrameMaxMs: 80,
};
/** Una fuga de verdad crece en centenares de MB, no en ocho. */
const LEAK_FLOOR_MB = 8;

function worst(samples: number[]): number {
  return samples.reduce((max, value) => Math.max(max, value), 0);
}

function budget(samples: number[], floorKey: string): number {
  // Redondeo hacia arriba a 3 cifras significativas: un presupuesto con seis
  // decimales finge una precisión que la medida no tiene.
  const raw = worst(samples) * MARGIN_FACTOR;
  const magnitude = raw > 0 ? 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 2) : 1;
  const rounded = raw > 0 ? Math.ceil(raw / magnitude) * magnitude : 1;
  return Math.max(rounded, FLOOR_MS[floorKey] ?? 0);
}

const profiles: CadRenderBudgetProfile[] = [];
for (const spec of PROFILES) {
  if (options.only && options.only !== spec.id) continue;
  const observed: Record<string, number[]> = {
    "next.firstDetailMs": [],
    "next.zoomSettleMs": [],
    "next.panFrameP95Ms": [],
    "next.panFrameMaxMs": [],
    "leak.heapGrowthMb": [],
  };
  let minDetailedAtFullView = Infinity;
  let maxLegacyDetailedAtFullView = 0;

  // Una corrida más de las pedidas: la primera se descarta entera.
  for (let run = 0; run <= options.runs; run += 1) {
    const corpus = createCadBenchmarkCorpus({ entities: spec.entities });
    const bounds = cadDocumentBounds(corpus.nativeEntities);
    const scenario = createCadRenderScenario(bounds, spec.panStops);
    const drawOrder = corpus.document.modelSpace.entityIds;
    const next = measureCadNextPipeline(corpus.nativeEntities, drawOrder, scenario);
    const restScenario = { initial: scenario.initial, pan: [], zoom: scenario.initial };
    const nextFull = measureCadNextPipeline(corpus.nativeEntities, drawOrder, restScenario);
    const legacyFull = measureCadLegacyPipeline(corpus.nativeEntities, restScenario);
    const leak = measureCadRenderLeak(
      corpus.nativeEntities,
      drawOrder,
      { initial: scenario.initial, pan: scenario.pan.slice(0, 4), zoom: scenario.zoom },
      spec.leakCycles,
    );
    if (run === 0) {
      process.stderr.write(`${spec.id}: corrida de calentamiento descartada\n`);
      continue;
    }
    observed["next.firstDetailMs"].push(next.firstDetailMs);
    observed["next.zoomSettleMs"].push(next.zoomSettleMs);
    observed["next.panFrameP95Ms"].push(next.panFrameP95Ms);
    observed["next.panFrameMaxMs"].push(next.panFrameMaxMs);
    observed["leak.heapGrowthMb"].push(leak.heapGrowthMb);
    minDetailedAtFullView = Math.min(minDetailedAtFullView, nextFull.detailedAtRest);
    maxLegacyDetailedAtFullView = Math.max(
      maxLegacyDetailedAtFullView,
      legacyFull.detailedAtRest,
    );
    process.stderr.write(
      `${spec.id} #${run}: firstDetail ${next.firstDetailMs} ms · panP95 ${next.panFrameP95Ms} ms · zoomSettle ${next.zoomSettleMs} ms · detalladas ${nextFull.detailedAtRest} (anterior ${legacyFull.detailedAtRest})\n`,
    );
  }

  profiles.push({
    id: spec.id,
    entities: spec.entities,
    panStops: spec.panStops,
    enforcement: "blocking",
    enforcementRationale: spec.enforcementRationale,
    hardware: {
      // Guarda sobre la máquina de calibración, no un número redondo: por
      // debajo de esto los TIEMPOS se degradan a registrados.
      minimumLogicalCpuCount: environment.logicalCpuCount,
      minimumTotalMemoryBytes: Math.floor(environment.totalMemoryBytes * 0.9),
    },
    budgets: {
      nextFirstDetailMs: budget(observed["next.firstDetailMs"], "nextFirstDetailMs"),
      nextZoomSettleMs: budget(observed["next.zoomSettleMs"], "nextZoomSettleMs"),
      nextPanFrameP95Ms: budget(observed["next.panFrameP95Ms"], "nextPanFrameP95Ms"),
      nextPanFrameMaxMs: budget(observed["next.panFrameMaxMs"], "nextPanFrameMaxMs"),
      // Sin `--expose-gc` la cifra no es comparable, así que no se presupuesta.
      leakHeapGrowthMb: gcAvailable
        ? Math.max(LEAK_FLOOR_MB, Math.ceil(worst(observed["leak.heapGrowthMb"]) * MARGIN_FACTOR))
        : null,
    },
    invariants: {
      detailedEqualsVisibleAtRest: true,
      // El mínimo es el número EXACTO observado: son todas las entidades, y si
      // baja es que ha vuelto el muestreo.
      minDetailedAtFullView: Number.isFinite(minDetailedAtFullView)
        ? minDetailedAtFullView
        : spec.entities,
      maxLegacyDetailedAtFullView,
    },
    calibration: {
      runs: options.runs,
      marginFactor: MARGIN_FACTOR,
      recordedAt: new Date().toISOString(),
      environment,
      observed,
    },
  });
}

const baselinePath = path.resolve(
  import.meta.dirname,
  "../src/lib/cad/benchmark/render-baseline.json",
);
let existing: CadRenderBaselineManifest | null = null;
try {
  existing = JSON.parse(readFileSync(baselinePath, "utf8")) as CadRenderBaselineManifest;
} catch {
  existing = null;
}
const merged = [
  ...profiles,
  ...(existing?.profiles ?? []).filter(
    (profile) => !profiles.some((fresh) => fresh.id === profile.id),
  ),
].sort((left, right) => left.id.localeCompare(right.id));

const manifest: CadRenderBaselineManifest = {
  $schema: "./render-baseline.schema.json",
  schemaVersion: 1,
  benchmarkId: "valle-design-cad-render-pipeline-v1",
  profiles: merged,
};
const json = `${JSON.stringify(manifest, null, 2)}\n`;
if (options.write) {
  writeFileSync(baselinePath, json, "utf8");
  process.stderr.write(`\nEscrito ${baselinePath}\n`);
} else process.stdout.write(json);
