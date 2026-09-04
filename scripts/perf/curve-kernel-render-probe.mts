/**
 * Sonda de la GANANCIA del kernel de curvas en la etapa de teselado del render:
 * UNA mezcla, UNA corrida, volcada a stdout como JSON y nada más.
 *
 * `curve-kernel-render-bench.mjs` la ejecuta varias veces en PROCESOS
 * SEPARADOS y publica el reparto. El reparto de responsabilidades es el mismo
 * que en `scripts/wasm/wasm-parity-probe.mts`: aquí vive lo que hay que medir,
 * allí lo que hay que declarar de la máquina.
 *
 * ## Qué se mide, exactamente
 *
 * `tessellateCadEntitiesWithCurveKernel` — el CUERPO de
 * `tessellateCadEntityBatch`, que es lo que el worker de teselado ejecuta al
 * recibir un lote — sobre el corpus entero TROCEADO EN LOTES DEL TAMAÑO QUE EL
 * WORKER RECIBE (≤512 entidades o ≤16.384 segmentos estimados, la regla de
 * `collectCadOffThreadBatch`), dos veces, con los MISMOS presupuestos de
 * segmentos y cambiando entre medias sólo el kernel INYECTADO:
 *
 * 1. el binario `.wasm` del árbol,
 * 2. el motor JavaScript, que es el que el producto ejecuta hoy en el primer
 *    lote de cada sesión y el que sirve para siempre si el binario no baja.
 *
 * Se inyecta por parámetro y no con `setCadRenderCurveKernel` porque ese
 * instalador LIBERA el kernel anterior al cambiarlo (es lo correcto para un
 * hilo, que sólo tiene uno): alternar motores por ahí liberaría el binario en
 * la primera vuelta. El parámetro es la misma puerta que usa el spec de
 * paridad del enrutado.
 *
 * Comparar cualquier otra cosa —el carril del kernel contra el carril de
 * adaptadores, por ejemplo— mediría el enrutado y el empaquetado además del
 * motor, y entonces la cifra publicada no sería la ganancia del kernel.
 *
 * ## Por qué se alternan las repeticiones
 *
 * Medir «tres veces JavaScript y luego tres veces wasm» le regala al segundo
 * motor un montón ya crecido y unas cachés de CPU ya calientes con este corpus.
 * Aquí cada repetición hace las dos mitades, y la mediana se toma por motor
 * sobre repeticiones que vieron el mismo estado de la máquina.
 *
 * ## La paridad se comprueba aquí, no se supone
 *
 * De cada motor sale el número de puntos POR ENTIDAD. Si un solo índice
 * difiere, la sonda sale con error y no publica ninguna ganancia: una etapa que
 * va más rápido porque dibuja menos puntos no es una optimización, es un plano
 * mal dibujado. Esa es la condición que el spec del artefacto vuelve a exigir
 * al leerlo.
 *
 * Uso (con el cwd en `apps/web`; lo lanza el generador):
 *   npx tsx ../../scripts/perf/curve-kernel-render-probe.mts --mix mechanical --entities 100000
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import nodePath from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { serializeCadDocument } from "../../apps/web/src/lib/cad/cad-document";
import {
  CAD_CORPUS_MIX_IDS,
  createCadCorpusMix,
  findCadCorpusMixManifestEntry,
  type CadCorpusMixId,
} from "../../apps/web/src/lib/cad/benchmark/corpus-mixes";
import {
  CAD_ENTITY_REGISTRY,
  type CadNativeEntity,
} from "../../apps/web/src/lib/cad/entity-runtime";
import {
  cadCurveKernelRouteFor,
  tessellateCadEntitiesWithCurveKernel,
} from "../../apps/web/src/lib/cad/render/curve-kernel-tessellation";
import {
  CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES,
  CAD_RENDER_OFFTHREAD_BATCH_SEGMENT_BUDGET,
} from "../../apps/web/src/lib/cad/render/pipeline-offthread";
import { CAD_RENDER_LOD_SEGMENTS } from "../../apps/web/src/lib/cad/render/tessellation-cache";
import { tessellateCadEntityBatch } from "../../apps/web/src/lib/cad/render/tessellate.worker";
import {
  createCadCurveKernel,
  createCadCurveKernelJs,
  type CadCurveKernel,
} from "../../apps/web/src/lib/cad/wasm/curve-kernel";

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const root = nodePath.resolve(here, "../..");
const wasmPath = nodePath.join(root, "apps/web/public/wasm/valle-cad-kernel.wasm");
const kernelManifestPath = nodePath.join(
  root,
  "crates/valle-cad-kernel/kernel-manifest.json",
);

interface ProbeOptions {
  mix: CadCorpusMixId;
  entities: number;
  repeats: number;
  /**
   * Repeticiones del SUBLOTE de curvas.
   *
   * Va por separado de `repeats` porque el sublote cuesta órdenes de magnitud
   * menos que la etapa entera —en `plano-real@100k`, 40 ms contra 23 s— y una
   * medida de 40 ms con UNA repetición la decide una pausa del recolector: se
   * midió aquí un sublote que saltó de 38 ms a 197 ms entre procesos y publicó
   * un ×0,46 que no era del kernel sino del montón. Repetir donde es barato es
   * lo que convierte esa cifra en un dato.
   */
  curveRepeats: number;
  /**
   * Vueltas de calentamiento que NO entran en la mediana.
   *
   * Se puede poner a CERO, y hay un caso en que se hace: una mezcla sin curvas
   * publica un cero por construcción, no un tiempo, y calentar V8 para un
   * número que nadie va a citar cuesta minutos de reloj sin comprar nada.
   */
  warmup: number;
}

function parseCli(argv: string[]): ProbeOptions {
  const options: ProbeOptions = {
    mix: "mechanical",
    entities: 100_000,
    repeats: 3,
    curveRepeats: 9,
    warmup: 1,
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
    } else if (argument === "--repeats") {
      options.repeats = Number.parseInt(argv[++index] ?? "", 10);
    } else if (argument === "--curve-repeats") {
      options.curveRepeats = Number.parseInt(argv[++index] ?? "", 10);
    } else if (argument === "--warmup") {
      options.warmup = Number.parseInt(argv[++index] ?? "", 10);
    } else {
      throw new Error(`Argumento desconocido: ${argument}`);
    }
  }
  if (!Number.isSafeInteger(options.entities) || options.entities < 1)
    throw new Error("--entities debe ser un entero positivo.");
  if (!Number.isSafeInteger(options.repeats) || options.repeats < 1)
    throw new Error("--repeats debe ser un entero positivo.");
  if (!Number.isSafeInteger(options.curveRepeats) || options.curveRepeats < 1)
    throw new Error("--curve-repeats debe ser un entero positivo.");
  if (!Number.isSafeInteger(options.warmup) || options.warmup < 0)
    throw new Error("--warmup debe ser un entero no negativo.");
  return options;
}

const options = parseCli(process.argv.slice(2));

const round = (value: number, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

const corpus = createCadCorpusMix({ mix: options.mix, entities: options.entities });
const documentSha256 = createHash("sha256")
  .update(serializeCadDocument(corpus.document))
  .digest("hex");
const manifestEntry = findCadCorpusMixManifestEntry(options.mix, options.entities);

/**
 * Presupuesto de segmentos por entidad: los TRES escalones de LOD, rotando.
 *
 * Es la misma política que usa el spec de paridad del enrutado, y por el mismo
 * motivo: en una vista de verdad las entidades no comparten escalón —unas caen
 * lejos y otras cerca—, así que cada tipo de curva cruza la frontera en varios
 * grupos. Un presupuesto único mediría un lote artificialmente perfecto para el
 * agrupado por (tipo × pasos) y publicaría una ganancia que ninguna vista real
 * consigue.
 */
const segments = new Array<number>(corpus.nativeEntities.length);
for (let index = 0; index < segments.length; index += 1)
  segments[index] = CAD_RENDER_LOD_SEGMENTS[index % CAD_RENDER_LOD_SEGMENTS.length];

/**
 * Curvas que el enrutado desvía al kernel, y el SUBLOTE que forman.
 *
 * El sublote existe para poder contestar la pregunta que el total de la etapa
 * deja abierta: si la etapa entera mejora poco, ¿es porque el motor no gana o
 * porque las curvas son una fracción de lo que la etapa hace? Se mide lo mismo
 * —la misma función, el mismo empaquetado— restringido a las entidades que el
 * kernel toca, y así el numerador de Amdahl queda medido y no supuesto.
 */
const curveSubsetEntities: CadNativeEntity[] = [];
const curveSubsetSegments: number[] = [];
let acceptedEntities = 0;
for (let index = 0; index < corpus.nativeEntities.length; index += 1) {
  const entity = corpus.nativeEntities[index];
  if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
  acceptedEntities += 1;
  if (!cadCurveKernelRouteFor(entity)) continue;
  curveSubsetEntities.push(entity);
  curveSubsetSegments.push(segments[index]);
}
const curveEntities = curveSubsetEntities.length;

// ---------------------------------------------------------------------------
// Motores
// ---------------------------------------------------------------------------

const wasmBytes = fs.existsSync(wasmPath) ? fs.readFileSync(wasmPath) : null;
const wasmKernel = await createCadCurveKernel(
  wasmBytes ? new Uint8Array(wasmBytes) : null,
  `no existe ${nodePath.relative(root, wasmPath)}`,
);
if (wasmKernel.backend !== "wasm") {
  // Fallo cerrado: sin binario no hay ganancia que medir, y publicar el motor
  // JavaScript comparado consigo mismo sería fabricar un ×1,0 con aspecto de
  // medida. Se sale con error y se dice por qué.
  process.stderr.write(
    `sonda de render: el kernel cayó al motor JavaScript (${wasmKernel.fallbackReason}). ` +
      "No hay ganancia que medir.\n",
  );
  process.exit(2);
}
const jsKernel = createCadCurveKernelJs(null);

/**
 * Trocea una lista de entidades como el carril fuera de hilo trocea lo que
 * manda al worker.
 *
 * El producto NUNCA tesela 100.000 entidades en una llamada: `collectCadOffThreadBatch`
 * corta por 512 entidades o por 16.384 segmentos estimados, lo que llegue
 * antes, y ese lote es el que un worker recibe por `postMessage`. Medir la
 * llamada monolítica mediría dos cosas que el producto no hace —un agrupado
 * por (tipo × pasos) sobre el documento entero, que le regala al kernel un lote
 * ideal, y una reserva de memoria que aquí ni siquiera cabe: `architecture@100k`
 * de una sola vez mata el proceso por falta de memoria (SIGKILL)—.
 *
 * No se aplica el FILTRO de tipos del carril (rótulos puros, entidades que
 * necesitan el documento) porque aquí se mide la etapa entera, no el reparto
 * entre carriles: la regla que se toma prestada es la del TAMAÑO del lote.
 */
interface WorkerBatch {
  entities: CadNativeEntity[];
  segments: number[];
}

function sliceIntoWorkerBatches(
  entities: readonly CadNativeEntity[],
  budget: readonly number[],
): WorkerBatch[] {
  const batches: WorkerBatch[] = [];
  let current: WorkerBatch | null = null;
  let estimatedSegments = 0;
  for (let index = 0; index < entities.length; index += 1) {
    if (
      current &&
      (current.entities.length >= CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES ||
        estimatedSegments >= CAD_RENDER_OFFTHREAD_BATCH_SEGMENT_BUDGET)
    )
      current = null;
    if (!current) {
      current = { entities: [], segments: [] };
      estimatedSegments = 0;
      batches.push(current);
    }
    current.entities.push(entities[index]);
    current.segments.push(budget[index]);
    estimatedSegments += budget[index];
  }
  return batches;
}

interface PassResult {
  ms: number;
  /** Puntos por entidad, en el orden de entrada. La paridad se mide sobre esto. */
  pointCounts: Uint32Array;
  pathCount: number;
  pointCount: number;
  kernelEntities: number;
  adapterEntities: number;
  kernelCalls: number;
  batches: number;
}

/**
 * Una pasada de la etapa con el kernel indicado, lote a lote.
 *
 * El reloj sólo corre DENTRO de cada llamada a la etapa: el recuento de puntos
 * y el descarte del lote quedan fuera. Recorrer los resultados cuesta lo mismo
 * para los dos motores, pero sumarlo al tiempo diluiría la diferencia que se
 * viene a medir; y soltar cada lote antes del siguiente es lo que mantiene la
 * memoria acotada, igual que en el producto.
 */
function pass(
  kernel: CadCurveKernel,
  batches: readonly WorkerBatch[],
  total: number,
): PassResult {
  const pointCounts = new Uint32Array(total);
  let ms = 0;
  let pathCount = 0;
  let pointCount = 0;
  let kernelEntities = 0;
  let adapterEntities = 0;
  let kernelCalls = 0;
  let cursor = 0;
  for (const chunk of batches) {
    const started = performance.now();
    const batch = tessellateCadEntitiesWithCurveKernel(
      chunk.entities,
      chunk.segments,
      corpus.document,
      undefined,
      kernel,
    );
    ms += performance.now() - started;
    for (const result of batch.results) {
      let points = 0;
      for (const trace of result.paths) points += trace.length / 2;
      pointCounts[cursor] = points;
      cursor += 1;
      pathCount += result.paths.length;
      pointCount += points;
    }
    kernelEntities += batch.stats.kernelEntities;
    adapterEntities += batch.stats.adapterEntities;
    kernelCalls += batch.stats.kernelCalls;
  }
  return {
    ms: round(ms),
    pointCounts: pointCounts.subarray(0, cursor),
    pathCount,
    pointCount,
    kernelEntities,
    adapterEntities,
    kernelCalls,
    batches: batches.length,
  };
}

const stageBatches = sliceIntoWorkerBatches(corpus.nativeEntities, segments);
const curveBatches = sliceIntoWorkerBatches(curveSubsetEntities, curveSubsetSegments);

// Calentamiento: pasadas que NO entran en la mediana. Sin ellas, la primera
// repetición mide la compilación del intérprete de V8 sobre este corpus y no
// la etapa. El sublote de curvas se calienta también: si no, su primera
// repetición pagaría la especialización sobre un lote de otra forma.
for (let warm = 0; warm < options.warmup; warm += 1) {
  pass(jsKernel, stageBatches, acceptedEntities);
  pass(wasmKernel, stageBatches, acceptedEntities);
  pass(jsKernel, curveBatches, curveEntities);
  pass(wasmKernel, curveBatches, curveEntities);
}

const samples: Record<"wasm" | "javascript", number[]> = { wasm: [], javascript: [] };
const curveSamples: Record<"wasm" | "javascript", number[]> = { wasm: [], javascript: [] };
let jsLast: PassResult | null = null;
let wasmLast: PassResult | null = null;
for (let repeat = 0; repeat < options.repeats; repeat += 1) {
  jsLast = pass(jsKernel, stageBatches, acceptedEntities);
  wasmLast = pass(wasmKernel, stageBatches, acceptedEntities);
  samples.javascript.push(jsLast.ms);
  samples.wasm.push(wasmLast.ms);
}
// El sublote va en su propio bucle y con su propio recuento de repeticiones:
// es barato, así que se repite más, que es exactamente donde una pausa del
// recolector deja de decidir la cifra.
for (let repeat = 0; repeat < options.curveRepeats; repeat += 1) {
  curveSamples.javascript.push(pass(jsKernel, curveBatches, curveEntities).ms);
  curveSamples.wasm.push(pass(wasmKernel, curveBatches, curveEntities).ms);
}

/**
 * Control de que lo cronometrado ES el camino del worker.
 *
 * `tessellateCadEntityBatch` es la puerta que importa el worker de teselado y
 * su cuerpo es la función que este benchmark cronometra. Aquí se ejecuta esa
 * puerta con el kernel por defecto —el motor JavaScript, que es lo que hay
 * antes de que el binario se caliente— y se exige que devuelva EXACTAMENTE los
 * mismos recuentos. Sin esto, el artefacto mediría una función que se parece a
 * la del producto, y el parecido no es evidencia.
 */
const workerGate = (() => {
  let cursor = 0;
  for (const chunk of stageBatches) {
    const batch = tessellateCadEntityBatch(chunk.entities, chunk.segments, corpus.document);
    for (const result of batch.results) {
      let points = 0;
      for (const trace of result.paths) points += trace.length / 2;
      if (points !== jsLast!.pointCounts[cursor]) return false;
      cursor += 1;
    }
  }
  return cursor === jsLast!.pointCounts.length;
})();
if (!workerGate) {
  process.stderr.write(
    "sonda de render: tessellateCadEntityBatch (la puerta del worker) no devolvió los mismos " +
      "recuentos que la función cronometrada. El benchmark mediría otra cosa.\n",
  );
  process.exit(5);
}

// ---------------------------------------------------------------------------
// Paridad de puntos: la condición sin la cual la ganancia no vale nada
// ---------------------------------------------------------------------------

const left = jsLast!.pointCounts;
const right = wasmLast!.pointCounts;
if (left.length !== right.length) {
  process.stderr.write(
    "sonda de render: los dos motores devolvieron distinto número de entidades " +
      `(${left.length} ≠ ${right.length}).\n`,
  );
  process.exit(3);
}
let mismatchedEntities = 0;
let firstMismatch: { index: number; javascript: number; wasm: number } | null = null;
for (let index = 0; index < left.length; index += 1) {
  if (left[index] === right[index]) continue;
  mismatchedEntities += 1;
  firstMismatch ??= { index, javascript: left[index], wasm: right[index] };
}
if (mismatchedEntities > 0) {
  process.stderr.write(
    `sonda de render: ${mismatchedEntities} entidad(es) con distinto número de puntos entre ` +
      `motores; la primera es la ${firstMismatch!.index} (js ${firstMismatch!.javascript} ≠ ` +
      `wasm ${firstMismatch!.wasm}). No se publica ganancia sin paridad.\n`,
  );
  process.exit(4);
}

/**
 * Huella de la SECUENCIA de recuentos, no sólo de su suma.
 *
 * Dos motores pueden coincidir en el total de puntos repartiéndolos distinto
 * entre entidades; el total solo no lo vería. La huella viaja al artefacto para
 * que el spec pueda exigir que los dos motores traigan la misma sin volver a
 * teselar 100.000 entidades.
 */
function fnv1a32(counts: Uint32Array): string {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < counts.length; index += 1) {
    let value = counts[index];
    for (let byte = 0; byte < 4; byte += 1) {
      hash = Math.imul(hash ^ (value & 0xff), 0x01_00_01_93) >>> 0;
      value >>>= 8;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

wasmKernel.dispose();
jsKernel.dispose();

const emit = (
  engine: "wasm" | "javascript",
  last: PassResult,
  kernel: CadCurveKernel,
) => ({
  engine,
  backend: kernel.backend,
  fallbackReason: kernel.fallbackReason,
  samplesMs: samples[engine],
  medianMs: round(median(samples[engine])),
  bestMs: round(Math.min(...samples[engine])),
  worstMs: round(Math.max(...samples[engine])),
  pointCount: last.pointCount,
  pathCount: last.pathCount,
  pointCountsDigest: fnv1a32(last.pointCounts),
  kernelEntities: last.kernelEntities,
  adapterEntities: last.adapterEntities,
  kernelCalls: last.kernelCalls,
  workerBatches: last.batches,
  // El mismo lote restringido a las curvas: el numerador de Amdahl, medido.
  curveOnlySamplesMs: curveSamples[engine],
  curveOnlyMedianMs: round(median(curveSamples[engine])),
});

const jsMedian = median(samples.javascript);
const wasmMedian = median(samples.wasm);
const jsCurveMedian = median(curveSamples.javascript);
const wasmCurveMedian = median(curveSamples.wasm);

process.stdout.write(
  `${JSON.stringify({
    mix: options.mix,
    entities: options.entities,
    repeats: options.repeats,
    curveRepeats: options.curveRepeats,
    warmup: options.warmup,
    corpus: {
      mix: options.mix,
      entities: options.entities,
      documentSha256,
      manifestSha256: manifestEntry?.sha256 ?? null,
      matchesManifest: manifestEntry ? manifestEntry.sha256 === documentSha256 : false,
      entityMix: manifestEntry?.entityMix ?? corpus.entityMix,
      acceptedEntities,
      curveEntities,
      curveShare: acceptedEntities > 0 ? round(curveEntities / acceptedEntities, 4) : 0,
    },
    segmentPolicy: {
      levels: [...CAD_RENDER_LOD_SEGMENTS],
      assignment: "rotación de los tres escalones de LOD por índice de entidad",
    },
    batchPolicy: {
      maxEntities: CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES,
      segmentBudget: CAD_RENDER_OFFTHREAD_BATCH_SEGMENT_BUDGET,
      stageBatches: stageBatches.length,
      curveBatches: curveBatches.length,
      source:
        "apps/web/src/lib/cad/render/pipeline-offthread.ts · " +
        "CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES y CAD_RENDER_OFFTHREAD_BATCH_SEGMENT_BUDGET",
      rationale:
        "el producto nunca tesela el documento entero de una vez: el carril fuera de hilo corta " +
        "el lote por 512 entidades o 16.384 segmentos estimados y ése es el mensaje que recibe " +
        "un worker. Medir la llamada monolítica le regalaría al kernel un agrupado por " +
        "(tipo × pasos) sobre 100.000 entidades que ninguna vista real produce.",
    },
    kernelManifest: fs.existsSync(kernelManifestPath)
      ? (() => {
          const manifest = JSON.parse(fs.readFileSync(kernelManifestPath, "utf8"));
          return {
            abi: manifest.abi,
            binarySha256: manifest.binary?.sha256 ?? null,
            binaryBytes: manifest.binary?.bytes ?? null,
            rustc: manifest.toolchain?.rustc ?? null,
            target: manifest.toolchain?.target ?? null,
          };
        })()
      : null,
    workerGate: {
      entryPoint:
        "apps/web/src/lib/cad/render/tessellate.worker.ts · tessellateCadEntityBatch",
      sameCountsAsTimedFunction: workerGate,
    },
    runs: [emit("wasm", wasmLast!, wasmKernel), emit("javascript", jsLast!, jsKernel)],
    pointParity: {
      entitiesCompared: left.length,
      mismatchedEntities,
      totalPointsJavascript: jsLast!.pointCount,
      totalPointsWasm: wasmLast!.pointCount,
    },
    speedup: {
      /** La etapa ENTERA: lo que el pipeline paga por lote. */
      stageMedian: round(jsMedian / wasmMedian, 3),
      stagePerRepeat: samples.javascript.map((ms, index) =>
        round(ms / samples.wasm[index], 3),
      ),
      // Sólo las curvas: lo que el motor gana donde el motor trabaja. En una
      // mezcla SIN curvas el sublote está vacío y el cociente sería 0/0: se
      // publica `null`, que es lo que es, y no un NaN disfrazado de medida.
      curveOnlyMedian:
        curveEntities > 0 && wasmCurveMedian > 0
          ? round(jsCurveMedian / wasmCurveMedian, 3)
          : null,
      curveOnlyPerRepeat:
        curveEntities > 0
          ? curveSamples.javascript.map((ms, index) =>
              curveSamples.wasm[index] > 0 ? round(ms / curveSamples.wasm[index], 3) : null,
            )
          : null,
    },
    amdahl: {
      curveOnlyMedianMsJavascript: round(jsCurveMedian),
      curveOnlyMedianMsWasm: round(wasmCurveMedian),
      stageMedianMsJavascript: round(jsMedian),
      stageMedianMsWasm: round(wasmMedian),
      /** Fracción del coste de la etapa que las curvas representan hoy. */
      curveShareOfStage: jsMedian > 0 ? round(jsCurveMedian / jsMedian, 4) : 0,
    },
  })}\n`,
);
