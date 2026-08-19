#!/usr/bin/env node
/**
 * Cruza las corridas del estrés denso y publica
 * `docs/cad/evidence/cad-dense-editing-100k.json`.
 *
 * ## Por qué hace falta un cruce y no basta la corrida
 *
 * Porque una corrida de navegador sobre 100.000 entidades dura minutos y esta
 * máquina tiene vecinos. Un número tomado una vez aquí no dice si el producto
 * tarda eso o si el sistema operativo le quitó la CPU a mitad del gesto. La
 * regla del repositorio es mediana de TRES corridas en procesos separados —y en
 * Playwright cada corrida es un proceso, un navegador y un documento nuevos, así
 * que aquí «proceso separado» es literal— más la dispersión publicada al lado.
 *
 * ## Fallo cerrado
 *
 * Si hay menos de tres corridas, si dos corridas no coinciden en el CORPUS, o
 * si alguna trae gestos fallidos, este script NO publica: sale con error y dice
 * qué falta. Publicar la mediana de dos corridas sería publicar el promedio de
 * dos y llamarlo de otra manera.
 *
 * Uso:
 *   node scripts/cad/dense-editing-evidence.mjs
 *   node scripts/cad/dense-editing-evidence.mjs --min-runs 3
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runsDir = path.join(root, "apps/web/e2e/.artifacts/cad-dense-editing-100k");
const output = path.join(root, "docs/cad/evidence/cad-dense-editing-100k.json");

const flagIndex = process.argv.indexOf("--min-runs");
const MIN_RUNS = flagIndex >= 0 ? Number(process.argv[flagIndex + 1]) : 3;

if (!fs.existsSync(runsDir)) {
  console.error(
    `estrés denso: no hay corridas en ${path.relative(root, runsDir).replaceAll(path.sep, "/")}.\n` +
      "Genera al menos tres con:\n" +
      "  CAD_PERF_E2E=1 E2E_PROD=1 npx playwright test e2e/performance/cad-dense-editing-100k.spec.ts --project=chromium",
  );
  process.exit(1);
}

const runs = fs
  .readdirSync(runsDir)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => ({ file, data: JSON.parse(fs.readFileSync(path.join(runsDir, file), "utf8")) }));

const problems = [];
if (runs.length < MIN_RUNS)
  problems.push(`hay ${runs.length} corrida(s) y se exigen ${MIN_RUNS}`);
// Una corrida cortada a la mitad NO cuenta como corrida. Se listan aparte para
// que el artefacto no pueda esconder que la mediana se calculó sobre menos
// material del que parece.
const partial = runs.filter((run) => run.data.complete !== true);
if (partial.length > 0 && !process.argv.includes("--allow-partial"))
  problems.push(
    `${partial.length} corrida(s) quedaron incompletas (${partial
      .map((run) => run.file)
      .join(", ")}); pásale --allow-partial sólo si vas a declarar por qué`,
  );
const corpusSignatures = new Set(runs.map((run) => JSON.stringify(run.data.corpus)));
if (corpusSignatures.size > 1)
  problems.push("las corridas no comparten corpus: la mediana mezclaría dibujos distintos");
for (const run of runs)
  if ((run.data.failures ?? []).length > 0)
    problems.push(`${run.file}: ${run.data.failures.length} gesto(s) no se pudieron ejecutar`);
if (problems.length > 0) {
  console.error("estrés denso: NO se publica evidencia —");
  for (const problem of problems) console.error(`  × ${problem}`);
  process.exit(1);
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (value, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

/**
 * Resume una medida a lo largo de las corridas.
 *
 * De cada corrida se toma su mediana interna, y de esas se publica la mediana Y
 * las muestras. Sin las muestras, una mediana esconde la corrida que tardó el
 * triple, que es justo el dato que dice si la máquina estaba libre.
 */
function across(key) {
  const perRun = runs
    .map((run) => run.data.measurements?.[key])
    .filter((entry) => entry && Number.isFinite(entry.medianMs));
  if (perRun.length === 0) return null;
  const samples = perRun.map((entry) => round(entry.medianMs));
  const middle = median(samples);
  const spread = Math.max(...samples) - Math.min(...samples);
  return {
    label: perRun[0].label,
    medianMs: round(middle),
    perRunMedianMs: samples,
    runs: samples.length,
    spreadMs: round(spread),
    spreadPercentOfMedian: middle > 0 ? round((spread / middle) * 100, 1) : 0,
    // El peor caso de TODAS las repeticiones de TODAS las corridas. Es lo que
    // el arquitecto nota una vez de cada tantas, y una mediana lo esconde.
    worstSampleMs: round(Math.max(...perRun.map((entry) => entry.maxMs))),
    observed: perRun.at(-1).observed,
  };
}

const keys = [...new Set(runs.flatMap((run) => Object.keys(run.data.measurements ?? {})))];
const measurements = Object.fromEntries(
  keys.map((key) => [key, across(key)]).filter(([, value]) => value !== null),
);

const openSamples = runs.map((run) => round(run.data.open.documentReadyMs));
const detailSamples = runs.map((run) => round(run.data.open.firstDetailMs));
const summarize = (samples) => {
  const middle = median(samples);
  const spread = Math.max(...samples) - Math.min(...samples);
  return {
    medianMs: round(middle),
    samplesMs: samples,
    runs: samples.length,
    spreadMs: round(spread),
    spreadPercentOfMedian: middle > 0 ? round((spread / middle) * 100, 1) : 0,
  };
};

const findings = [...new Set(runs.flatMap((run) => run.data.findings ?? []))];
const first = runs[0].data;

/**
 * Coste de UN movimiento de ratón, derivado de lo que costó el mapa.
 *
 * No hace falta instrumentar nada nuevo para tenerlo: construir el mapa
 * mundo→pantalla son cuatro lecturas del HUD y cada lectura son DOS movimientos
 * —al vecino y al destino—, así que ocho movimientos exactos. Dividir el reloj
 * del mapa entre ocho da lo que tarda el editor en atender un movimiento del
 * ratón y repintar la coordenada, que es la latencia que el arquitecto siente
 * ANTES de haber hecho nada. Se publica como DERIVADO y con su divisor a la
 * vista, para que nadie lo confunda con una medida directa.
 */
const mapperRuns = runs.map((run) => run.data.worldMapper).filter(Boolean);
const pointerCost = mapperRuns.length
  ? (() => {
      const samples = mapperRuns.map((mapper) => round(mapper.buildMs / 8));
      const middle = median(samples);
      return {
        derivedMs: round(middle),
        perRunMs: samples,
        divisor: 8,
        derivation:
          "worldMapper.buildMs ÷ 8. El mapa se construye con cuatro lecturas del HUD del cursor y " +
          "cada lectura mueve el ratón dos veces (a un vecino diagonal y al destino), así que son " +
          "ocho movimientos atendidos por el editor.",
        whatItMeans:
          "Es la latencia de MOVER EL RATÓN sobre el dibujo: lo que tarda el editor en decir dónde " +
          "está el cursor. No es un gesto de edición — es lo que pasa antes de cualquier gesto.",
        mapperErrorUnits: mapperRuns.map((mapper) => mapper.errorUnits),
        unitsPerPixel: mapperRuns.map((mapper) => mapper.unitsPerPixel),
      };
    })()
  : null;

const evidence = {
  $schema: "urn:valle-design:schema:cad-dense-editing-evidence:v1",
  schemaVersion: 1,
  evidenceId: "valle-design-cad-dense-editing-100k-v1",
  generatedAt: new Date().toISOString(),
  // La invocación entera, para que el lector sepa si alguien relajó los
  // requisitos. Un artefacto que no dice con qué banderas se generó no permite
  // distinguir «tres corridas completas» de «una corrida a medias y una excusa».
  generatedWith: ["node", "scripts/cad/dense-editing-evidence.mjs", ...process.argv.slice(2)].join(" "),
  minRunsRequired: MIN_RUNS,
  incompleteRunsAccepted: partial.map((run) => run.file),
  enforcement: "gate funcional en el spec, report-only en tiempos",
  enforcementRationale:
    "Lo que BLOQUEA vive en apps/web/e2e/performance/cad-dense-editing-100k.spec.ts y no depende de " +
    "la máquina: que las 100.000 entren en el pipeline, que la designación masiva no trunque, que " +
    "mover deje EXACTAMENTE un paso de historia, que borrar una capa quite sus trazos y sólo los " +
    "suyos, y que deshacer devuelva el documento a su tamaño. Los TIEMPOS no fijan presupuesto: " +
    "están medidos en un portátil de desarrollo con otros agentes trabajando en paralelo, y " +
    "calibrarlos como umbral produciría un gate que falla por contención de máquina y no por una " +
    "regresión del producto. Los dos specs de e2e/performance que ya existían están calibrados para " +
    "el runner de CI (2 vCPU) y por eso tampoco son concluyentes en local.",
  runs: runs.map((run) => ({
    file: `apps/web/e2e/.artifacts/cad-dense-editing-100k/${run.file}`,
    runId: run.data.runId,
    project: run.data.project,
    recordedAt: run.data.recordedAt,
    repeats: run.data.method.repeats,
    browserErrors: run.data.browserErrors.length,
  })),
  environment: first.environment,
  method: {
    ...first.method,
    processes: runs.length,
    aggregation:
      `mediana de ${runs.length} corridas en PROCESOS SEPARADOS (cada corrida es un navegador y un ` +
      "documento nuevos); dentro de cada corrida, mediana de sus repeticiones.",
    contamination:
      "La máquina tenía vecinos. Se publica `spreadPercentOfMedian` de cada medida y `worstSampleMs` " +
      "para que nadie tenga que fiarse de la mediana a ciegas: una dispersión del 10 % es una " +
      "medida, una del 100 % es una máquina ocupada disfrazada de medida.",
  },
  corpus: first.corpus,
  open: {
    documentReadyMs: summarize(openSamples),
    firstDetailMs: summarize(detailSamples),
    payloadBytes: first.open.payloadBytes,
    note:
      "Una muestra por corrida: abrir 100.000 entidades varias veces dentro de la misma corrida " +
      "multiplicaría un tiempo que ya domina el reloj del proceso.",
  },
  pointerMoveCost: pointerCost,
  measurements,
  findings,
  comparedWith: {
    reference: "docs/cad/evidence/cad-plan-benchmark-20k.json",
    referenceNote:
      "Aquella evidencia mide 20.000 entidades EN NODE, sin navegador: selección por ventana " +
      "0,32 ms p95, mover grupo 11,0 ms, borrar grupo 10,6 ms. No es comparable gesto a gesto con " +
      "lo de aquí —allí se mide una consulta al índice, aquí el gesto completo con navegador, " +
      "React y pipeline de render— y por eso se cita como CONTEXTO y no como línea base. Lo que sí " +
      "es comparable es la conclusión: allí las siete operaciones caben en un cuadro de 60 Hz; aquí " +
      "se publica cuáles caben y cuáles no.",
  },
  scope: first.scope,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Publicado ${path.relative(root, output).replaceAll(path.sep, "/")} · ${runs.length} corridas`);
console.log(
  `  apertura ${evidence.open.documentReadyMs.medianMs} ms (±${evidence.open.documentReadyMs.spreadPercentOfMedian} %) · ` +
    `primer detalle ${evidence.open.firstDetailMs.medianMs} ms (±${evidence.open.firstDetailMs.spreadPercentOfMedian} %)`,
);
if (pointerCost)
  console.log(
    `  mover el ratón (derivado) ${pointerCost.derivedMs} ms · muestras ${pointerCost.perRunMs.join(", ")}`,
  );
for (const [key, value] of Object.entries(measurements))
  console.log(
    `  ${key.padEnd(16)} ${String(value.medianMs).padStart(10)} ms · peor ${value.worstSampleMs} ms · ±${value.spreadPercentOfMedian} %`,
  );
for (const finding of findings) console.log(`  HALLAZGO · ${finding}`);
